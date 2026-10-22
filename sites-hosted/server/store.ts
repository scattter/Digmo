import { ERROR_CODES, type PortfolioType, type PortfolioDecisionDoc, type DailyDecision } from "@/shared";
import { AppError } from "./utils/app-error";
import { getNextWorkingDaySettlementTime, isSettlementDue } from "./utils/time";
import type { PortfolioItem, PortfolioFundItem, PositionOperationItem, WatchlistStore, UpsertPortfolioFundInput, UpdatePortfolioFundInput, PositionOperationInput, DeletePositionOperationResult, PortfolioShareRecord, FundStateItem } from "./models";
export type * from "./models";

export interface PortfolioDocument extends PortfolioItem {
  funds: PortfolioFundItem[];
  operations: PositionOperationItem[];
  decisionDoc?: PortfolioDecisionDoc;
  decisions: DailyDecision[];
  share?: PortfolioShareRecord;
}
interface Row { id: string; user_id: string; name: string; share_code: string; display_order: number; payload: string; revision: number }
const round = (n: number) => Number(n.toFixed(2));
const now = () => new Date().toISOString();
const unavailable = () => new AppError(ERROR_CODES.PORTFOLIO_NOT_FOUND, "组合不存在或无权访问", 404);

function snapshot(fund: Pick<PortfolioFundItem, "holdingAmount" | "holdingProfitAmount">, kind: "INCREASE" | "DECREASE", amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "amount must be greater than 0", 400);
  if (kind === "DECREASE" && amount > fund.holdingAmount) throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "decrease amount exceeds current holding amount", 400);
  const afterHoldingAmount = round(fund.holdingAmount + (kind === "INCREASE" ? amount : -amount));
  return { beforeHoldingAmount: round(fund.holdingAmount), afterHoldingAmount,
    beforeHoldingProfitAmount: round(fund.holdingProfitAmount),
    afterHoldingProfitAmount: kind === "INCREASE" ? round(fund.holdingProfitAmount) : fund.holdingAmount > 0 ? round(fund.holdingProfitAmount * afterHoldingAmount / fund.holdingAmount) : 0 };
}
function recompute(document: PortfolioDocument, fund: PortfolioFundItem) {
  let projected = { holdingAmount: fund.holdingAmount, holdingProfitAmount: fund.holdingProfitAmount };
  for (const operation of document.operations.filter(o => o.fundCode === fund.fundCode && o.status === "PENDING").sort((a,b) => a.effectiveAt.localeCompare(b.effectiveAt) || a.createdAt.localeCompare(b.createdAt))) {
    const next = snapshot(projected, operation.operationType, operation.amount);
    Object.assign(operation, next);
    projected = { holdingAmount: next.afterHoldingAmount, holdingProfitAmount: next.afterHoldingProfitAmount };
  }
  return projected;
}
function settle(document: PortfolioDocument) {
  const date = new Date();
  let changed = false;
  for (const operation of document.operations.filter(o => o.status === "PENDING").sort((a,b) => a.effectiveAt.localeCompare(b.effectiveAt) || a.createdAt.localeCompare(b.createdAt))) {
    if (!isSettlementDue(operation.effectiveAt, date)) continue;
    const fund = document.funds.find(f => f.fundCode === operation.fundCode);
    if (!fund) throw new Error("PENDING_FUND_MISSING");
    fund.holdingAmount = operation.afterHoldingAmount;
    fund.holdingProfitAmount = operation.afterHoldingProfitAmount;
    fund.updatedAt = date.toISOString();
    operation.status = "APPLIED";
    operation.appliedAt = date.toISOString();
    changed = true;
  }
  if (changed) document.totalAsset = Math.max(document.totalAsset, round(document.funds.reduce((sum,f) => sum + f.holdingAmount, 0)));
  return changed;
}
function view(document: PortfolioDocument): PortfolioItem {
  const { id, name, type, shareCode, totalAsset, createdAt, updatedAt } = document;
  return { id, name, type, shareCode, totalAsset, createdAt, updatedAt };
}

// Each portfolio is one bounded D1 aggregate. Compare-and-swap commits holdings,
// pending operations, documents and sharing atomically, without SQL BEGIN/COMMIT.
// Every owner operation binds the platform user ID in SQL; IDs never grant access.
export class D1WatchlistStore implements WatchlistStore {
  constructor(private readonly db: D1Database) {}
  private async row(userId: string, id: string) {
    return await this.db.prepare("SELECT * FROM portfolios WHERE user_id = ? AND id = ?").bind(userId, id).first<Row>();
  }
  async readDocument(userId: string, id: string): Promise<PortfolioDocument | undefined> {
    const row = await this.row(userId, id);
    if (!row) return undefined;
    const doc = JSON.parse(row.payload) as PortfolioDocument;
    if (doc.operations.some(o => o.status === "PENDING" && isSettlementDue(o.effectiveAt, new Date()))) {
      return this.mutate(userId, id, value => structuredClone(value));
    }
    return doc;
  }
  async mutate<T>(userId: string, id: string, change: (doc: PortfolioDocument) => T): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = await this.row(userId, id);
      if (!row) throw unavailable();
      const doc = JSON.parse(row.payload) as PortfolioDocument;
      settle(doc);
      const value = change(doc);
      doc.updatedAt = now();
      if (doc.funds.reduce((sum,f) => sum + (f.plannedRatio ?? 0), 0) > 1.0000001) throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "plannedRatio sum must be <= 1", 400);
      doc.totalAsset = Math.max(doc.totalAsset, round(doc.funds.reduce((sum,f) => sum + f.holdingAmount, 0)));
      const payload = JSON.stringify(doc);
      if (new TextEncoder().encode(payload).length > 900_000) throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "组合记录已达到容量上限，请先拆分组合。", 413);
      const result = await this.db.prepare("UPDATE portfolios SET name = ?, payload = ?, revision = revision + 1 WHERE user_id = ? AND id = ? AND revision = ?")
        .bind(doc.name, payload, userId, id, row.revision).run();
      if (result.meta.changes === 1) return value;
    }
    throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "其他页面刚修改了此组合，请刷新后重试。", 409);
  }
  async listPortfolios(userId: string) {
    const result = await this.db.prepare("SELECT id FROM portfolios WHERE user_id = ? ORDER BY display_order, id").bind(userId).all<{id:string}>();
    const docs = await Promise.all(result.results.map(row => this.readDocument(userId, row.id)));
    return docs.filter((doc): doc is PortfolioDocument => !!doc).map(view);
  }
  async getPortfolio(userId: string, id: string) { const doc = await this.readDocument(userId,id); return doc ? view(doc) : undefined; }
  async createPortfolio(userId: string, name: string, type: PortfolioType, totalAsset = 0) {
    const date = now();
    const doc: PortfolioDocument = { id: crypto.randomUUID(), name, type, shareCode: Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2,"0")).join("").toUpperCase(), totalAsset, createdAt: date, updatedAt: date, funds: [], operations: [], decisions: [] };
    await this.db.prepare("INSERT INTO portfolios (id, user_id, name, share_code, display_order, payload, revision) VALUES (?, ?, ?, ?, COALESCE((SELECT MAX(display_order) + 1 FROM portfolios WHERE user_id = ?), 0), ?, 0)")
      .bind(doc.id,userId,name,doc.shareCode,userId,JSON.stringify(doc)).run();
    return view(doc);
  }
  async updatePortfolio(userId: string,id: string,input: {name?:string;totalAsset?:number}) {
    if (!await this.row(userId,id)) return false;
    return this.mutate(userId,id,doc => {
      if (input.name !== undefined) {doc.name=input.name;for(const f of doc.funds)f.portfolioName=input.name;}
      if (input.totalAsset !== undefined) {
        if (input.totalAsset + .001 < doc.funds.reduce((sum,f)=>sum+f.holdingAmount,0)) throw new AppError(ERROR_CODES.INVALID_PORTFOLIO,"总资产不能低于当前持仓金额",400);
        doc.totalAsset=input.totalAsset;
      }
      return true;
    });
  }
  async deletePortfolio(userId:string,id:string) { return (await this.db.prepare("DELETE FROM portfolios WHERE user_id = ? AND id = ?").bind(userId,id).run()).meta.changes>0; }
  async validatePortfolioSet(userId:string,ids:string[]) {const rows=await this.listPortfolios(userId);return new Set(ids).size===ids.length && rows.length===ids.length && rows.every(r=>ids.includes(r.id));}
  async reorderPortfolios(userId:string,ids:string[]) {
    if (!await this.validatePortfolioSet(userId,ids)) throw new AppError(ERROR_CODES.INVALID_PORTFOLIO,"组合列表已变化，请刷新后重试。",409);
    if(ids.length)await this.db.batch(ids.map((id,i)=>this.db.prepare("UPDATE portfolios SET display_order = ? WHERE user_id = ? AND id = ?").bind(i,userId,id)));
  }
  async getPortfolioTabLayoutPreference(userId:string) { const row=await this.db.prepare("SELECT funds_tab_index AS fundsTabIndex FROM preferences WHERE user_id = ?").bind(userId).first<{fundsTabIndex:number}>(); return row??{fundsTabIndex:0}; }
  async setPortfolioTabLayoutPreference(userId:string,value:{fundsTabIndex:number}) {await this.db.prepare("INSERT INTO preferences (user_id, funds_tab_index) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET funds_tab_index = excluded.funds_tab_index").bind(userId,value.fundsTabIndex).run();}
  async getDecisionAiConfig(_userId:string) {return undefined;}
  async upsertDecisionAiConfig(): Promise<never> {throw new AppError(ERROR_CODES.DECISION_AI_CONFIG_REQUIRED,"AI 尚未接通；此版本不接收或保存 API 密钥。",503);}
  async listPortfolioFunds(userId:string,id:string) {return (await this.readDocument(userId,id))?.funds??[];}
  async listAllPortfolioFunds(userId:string) {return (await Promise.all((await this.listPortfolios(userId)).map(p=>this.listPortfolioFunds(userId,p.id)))).flat();}
  async getPortfolioFund(userId:string,id:string,code:string) {return (await this.listPortfolioFunds(userId,id)).find(f=>f.fundCode===code);}
  async upsertPortfolioFund(userId:string,input:UpsertPortfolioFundInput) {
    await this.mutate(userId,input.portfolioId,doc=>{
      const existing=doc.funds.find(f=>f.fundCode===input.fundCode);const date=now();
      const fund:PortfolioFundItem={portfolioId:doc.id,portfolioName:doc.name,portfolioType:doc.type,fundCode:input.fundCode,displayOrder:existing?.displayOrder??doc.funds.length,holdingAmount:input.holdingAmount,holdingProfitAmount:input.holdingProfitAmount??0,plannedRatio:doc.type==="RATIO"?input.plannedRatio:undefined,createdAt:existing?.createdAt??date,updatedAt:date};
      if(existing)Object.assign(existing,fund);else doc.funds.push(fund);
      recompute(doc,existing??fund);
    });
  }
  async updatePortfolioFund(userId:string,input:UpdatePortfolioFundInput) {
    return this.mutate(userId,input.portfolioId,doc=>{
      const fund=doc.funds.find(f=>f.fundCode===input.fundCode);if(!fund)return false;
      if(input.holdingAmount!==undefined)fund.holdingAmount=input.holdingAmount;
      if(input.holdingProfitAmount!==undefined)fund.holdingProfitAmount=input.holdingProfitAmount;
      if(input.plannedRatio!==undefined)fund.plannedRatio=input.plannedRatio;
      fund.updatedAt=now();recompute(doc,fund);return true;
    });
  }
  async applyPositionOperation(userId:string,input:PositionOperationInput) {
    return this.mutate(userId,input.portfolioId,doc=>{
      const fund=doc.funds.find(f=>f.fundCode===input.fundCode);if(!fund)return undefined;
      const projected=recompute(doc,fund);
      const operation:PositionOperationItem={id:crypto.randomUUID(),portfolioId:doc.id,fundCode:fund.fundCode,operationType:input.operationType,amount:round(input.amount),...snapshot(projected,input.operationType,input.amount),status:"PENDING",effectiveAt:getNextWorkingDaySettlementTime(new Date()).toISOString(),createdAt:now()};
      doc.operations.push(operation);return operation;
    });
  }
  async deletePositionOperation(userId:string,id:string,code:string,operationId:string):Promise<DeletePositionOperationResult|undefined> {
    return this.mutate(userId,id,doc=>{
      const operation=doc.operations.find(o=>o.id===operationId&&o.fundCode===code);if(!operation)return undefined;
      if(operation.status==="APPLIED"){operation.manualCanceledAt??=now();return {effect:"MARKED_MANUAL_CANCEL",operation};}
      doc.operations=doc.operations.filter(o=>o.id!==operationId);
      const fund=doc.funds.find(f=>f.fundCode===code);if(fund)recompute(doc,fund);
      return {effect:"REMOVED"};
    });
  }
  async listPositionOperations(userId:string,id:string,options?:{limit?:number;fundCode?:string}) {
    const doc=await this.readDocument(userId,id);return (doc?.operations??[]).filter(o=>!options?.fundCode||o.fundCode===options.fundCode).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,options?.limit??50);
  }
  async removePortfolioFund(userId:string,id:string,code:string) {
    return this.mutate(userId,id,doc=>{const exists=doc.funds.some(f=>f.fundCode===code);doc.funds=doc.funds.filter(f=>f.fundCode!==code);doc.operations=doc.operations.filter(o=>o.fundCode!==code);return exists;});
  }
  async validatePortfolioFundSet(userId:string,id:string,codes:string[]) {const funds=await this.listPortfolioFunds(userId,id);return codes.length===funds.length&&new Set(codes).size===codes.length&&funds.every(f=>codes.includes(f.fundCode));}
  async reorderPortfolioFunds(userId:string,id:string,codes:string[]) {
    await this.mutate(userId,id,doc=>{if(new Set(codes).size!==codes.length||doc.funds.length!==codes.length||doc.funds.some(f=>!codes.includes(f.fundCode)))throw new AppError(ERROR_CODES.INVALID_PORTFOLIO,"基金列表已变化，请刷新后重试。",409);doc.funds.sort((a,b)=>codes.indexOf(a.fundCode)-codes.indexOf(b.fundCode));doc.funds.forEach((f,i)=>f.displayOrder=i);});
  }
  async sumPlannedRatio(userId:string,id:string,exclude?:string) {return (await this.listPortfolioFunds(userId,id)).reduce((sum,f)=>sum+(f.fundCode===exclude?0:f.plannedRatio??0),0);}
  async listUniqueFundCodes(userId:string) {return [...new Set((await this.listAllPortfolioFunds(userId)).map(f=>f.fundCode))];}
  async listFundStatesByCodes(userId:string,codes:string[]) {
    const funds=await this.listAllPortfolioFunds(userId);const result=new Map<string,FundStateItem>();
    for(const code of codes){const fund=funds.find(f=>f.fundCode===code);if(fund)result.set(code,{fundCode:code,totalChangePct:0,createdAt:fund.createdAt,updatedAt:fund.updatedAt});}
    return result;
  }
  async ensureFundState(_userId:string,_code:string) { /* No separate accumulated official-return series is generated. */ }
  async cleanupOrphanFundStates(_userId:string) { /* Fund state is part of its portfolio aggregate. */ }
  async accumulateOfficialReturn():Promise<boolean> {throw new Error("Official return accumulation is not enabled");}
  async rollPortfolioFundHoldingByNavDate():Promise<number> {throw new Error("Automatic NAV holding rollover is not enabled");}
  async getActivePortfolioShareByCode(code:string) {
    const row=await this.db.prepare("SELECT payload FROM portfolios WHERE share_code = ?").bind(code).first<{payload:string}>();
    if(!row)return undefined;const doc=JSON.parse(row.payload) as PortfolioDocument;return doc.share?.status==="ACTIVE"?doc.share:undefined;
  }
  async replaceActivePortfolioShare(input:{userId:string;portfolioId:string;shareCode:string;snapshotJson:string;passwordHash?:string;expiresAt?:string}) {
    return this.mutate(input.userId,input.portfolioId,doc=>{
      const date=now();const record:PortfolioShareRecord={id:crypto.randomUUID(),...input,status:"ACTIVE",createdAt:date,updatedAt:date};doc.share=record;return record;
    });
  }
}
