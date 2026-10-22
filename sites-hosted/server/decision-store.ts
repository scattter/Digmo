import type { DailyDecision, DecisionDocFormat, PortfolioDecisionDoc } from "@/shared";
import { D1WatchlistStore } from "./store";

export interface SaveDecisionRunInput { userId:string; portfolioId:string; tradeDate:string; summary:string; provider:string; model:string; status:"SUCCESS"|"FAILED"; errorMessage?:string; latencyMs:number; usage?:{inputTokens?:number;outputTokens?:number;totalTokens?:number}; rawResponse?:string; promptSnapshotJson?:string }
export interface DecisionStore {
  upsertDecisionDoc(userId:string,portfolioId:string,input:{title?:string;format:DecisionDocFormat;content:string;sourceFileName?:string}):Promise<PortfolioDecisionDoc>;
  getActiveDecisionDoc(userId:string,portfolioId:string):Promise<PortfolioDecisionDoc|undefined>;
  saveDecisionRun(input:SaveDecisionRunInput):Promise<DailyDecision>;
  getLatestDecision(userId:string,portfolioId:string):Promise<DailyDecision|undefined>;
  getLatestDecisionByTradeDate(userId:string,portfolioId:string,tradeDate:string):Promise<DailyDecision|undefined>;
  listDecisionHistory(userId:string,portfolioId:string,limit:number):Promise<DailyDecision[]>;
}
export class D1DecisionStore implements DecisionStore {
  constructor(private readonly store:D1WatchlistStore) {}
  async upsertDecisionDoc(userId:string,portfolioId:string,input:{title?:string;format:DecisionDocFormat;content:string;sourceFileName?:string}) {
    return this.store.mutate(userId,portfolioId,doc=>{
      const date=new Date().toISOString();const next:PortfolioDecisionDoc={id:crypto.randomUUID(),portfolioId,version:(doc.decisionDoc?.version??0)+1,...input,createdAt:date,updatedAt:date};doc.decisionDoc=next;return next;
    });
  }
  async getActiveDecisionDoc(userId:string,id:string) {return (await this.store.readDocument(userId,id))?.decisionDoc;}
  async saveDecisionRun(_input:SaveDecisionRunInput):Promise<DailyDecision> {throw new Error("AI_NOT_CONNECTED");}
  async getLatestDecision(userId:string,id:string) {return (await this.store.readDocument(userId,id))?.decisions.at(-1);}
  async getLatestDecisionByTradeDate(userId:string,id:string,date:string) {return (await this.store.readDocument(userId,id))?.decisions.filter(d=>d.tradeDate===date).at(-1);}
  async listDecisionHistory(userId:string,id:string,limit:number) {return (await this.store.readDocument(userId,id))?.decisions.slice(-limit).reverse()??[];}
}
