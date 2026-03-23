import {
  AuthUser,
  BatchEstimateResponse,
  DailyDecision,
  DecisionDocFormat,
  FlatFundItem,
  ImportPortfolioByShareCodeResult,
  LoginResponse,
  PortfolioDecisionDoc,
  PortfolioFundItem,
  PortfolioShareResult,
  PortfolioShareValidity,
  PositionOperationRecord,
  PositionOperationType,
  PortfolioSummary,
  PortfolioType
} from "@digmo/shared";
import { getAccessToken } from "./auth-session";

const API_BASE_URL = "/api";
const AUTH_REQUIRED_EVENT = "digmo-auth-required";

export type FlatExpandMode = "dedup" | "expanded";
export type SortOrder = "default" | "asc" | "desc";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

function emitAuthRequired(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
}

export function getAuthRequiredEventName(): string {
  return AUTH_REQUIRED_EVENT;
}

interface ApiRequestOptions extends RequestInit {
  auth?: boolean;
}

async function safeErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const payload = (await response.json()) as { message?: string };
    if (typeof payload?.message === "string" && payload.message.trim()) {
      return payload.message.trim();
    }
  } catch {
    // ignore parse failure and fallback to status
  }

  return undefined;
}

async function apiRequest(path: string, options?: ApiRequestOptions): Promise<Response> {
  const headers = new Headers(options?.headers);
  if (options?.auth) {
    const token = getAccessToken();
    if (!token) {
      emitAuthRequired();
      throw new AuthError("authentication is required");
    }
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store"
  });

  if (options?.auth && response.status === 401) {
    emitAuthRequired();
    throw new AuthError("authentication is required");
  }

  return response;
}

async function ensureOk(response: Response, message: string): Promise<void> {
  if (response.ok) {
    return;
  }

  const detail = await safeErrorMessage(response);
  throw new Error(detail ? `${message}: ${detail}` : `${message} (status ${response.status})`);
}

function normalizeFundCodeForPath(rawFundCode: string): string {
  const sanitized = rawFundCode.trim().replace(/^[^0-9]+|[^0-9]+$/g, "");
  if (!/^\d{6}$/.test(sanitized)) {
    throw new Error("基金代码格式不正确，请检查后重试");
  }
  return sanitized;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await apiRequest("/v1/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ username, password })
  });

  await ensureOk(response, "Login failed");
  return response.json() as Promise<LoginResponse>;
}

export async function fetchMe(): Promise<{ user: AuthUser }> {
  const response = await apiRequest("/v1/auth/me", {
    auth: true
  });

  await ensureOk(response, "Fetch current user failed");
  return response.json() as Promise<{ user: AuthUser }>;
}

export async function fetchBatchEstimates(fundCodes: string[]): Promise<BatchEstimateResponse> {
  const response = await apiRequest("/v1/funds/estimate/batch", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ fundCodes })
  });

  await ensureOk(response, "Batch request failed");
  return response.json() as Promise<BatchEstimateResponse>;
}

export async function fetchPortfolios(): Promise<PortfolioSummary[]> {
  const response = await apiRequest("/v1/portfolios", {
    auth: true
  });

  await ensureOk(response, "Fetch portfolios failed");
  const data = (await response.json()) as { portfolios?: PortfolioSummary[] };
  return data.portfolios ?? [];
}

export async function createPortfolio(name: string, type: PortfolioType): Promise<PortfolioSummary> {
  const response = await apiRequest("/v1/portfolios", {
    method: "POST",
    auth: true,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ name, type })
  });

  await ensureOk(response, "Create portfolio failed");
  const data = (await response.json()) as { portfolio: PortfolioSummary };
  return data.portfolio;
}

export async function renamePortfolio(portfolioId: string, name: string): Promise<void> {
  const response = await apiRequest(`/v1/portfolios/${portfolioId}`, {
    method: "PATCH",
    auth: true,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ name })
  });

  await ensureOk(response, "Rename portfolio failed");
}

export async function deletePortfolio(portfolioId: string): Promise<void> {
  const response = await apiRequest(`/v1/portfolios/${portfolioId}`, {
    method: "DELETE",
    auth: true
  });

  await ensureOk(response, "Delete portfolio failed");
}

export async function reorderPortfolios(portfolioIds: string[]): Promise<void> {
  const response = await apiRequest("/v1/portfolios/order", {
    method: "PATCH",
    auth: true,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ portfolioIds })
  });

  await ensureOk(response, "Reorder portfolios failed");
}

export async function fetchPortfolioTabLayout(): Promise<{ fundsTabIndex: number }> {
  const response = await apiRequest("/v1/portfolios/tab-layout", {
    auth: true
  });

  await ensureOk(response, "Fetch portfolio tab layout failed");
  const data = (await response.json()) as { fundsTabIndex?: number };
  return {
    fundsTabIndex: typeof data.fundsTabIndex === "number" ? data.fundsTabIndex : 0
  };
}

export async function updatePortfolioTabLayout(fundsTabIndex: number): Promise<void> {
  const response = await apiRequest("/v1/portfolios/tab-layout", {
    method: "PATCH",
    auth: true,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ fundsTabIndex })
  });

  await ensureOk(response, "Update portfolio tab layout failed");
}

export async function fetchPortfolioFunds(
  portfolioId: string
): Promise<{
  portfolio: {
    id: string;
    name: string;
    type: PortfolioType;
    createdAt: string;
    updatedAt: string;
  };
  funds: PortfolioFundItem[];
}> {
  const response = await apiRequest(`/v1/portfolios/${portfolioId}/funds`, {
    auth: true
  });

  await ensureOk(response, "Fetch portfolio funds failed");

  return response.json() as Promise<{
    portfolio: {
      id: string;
      name: string;
      type: PortfolioType;
      createdAt: string;
      updatedAt: string;
    };
    funds: PortfolioFundItem[];
  }>;
}

export async function addPortfolioFund(params: {
  portfolioId: string;
  fundCode: string;
  holdingAmount: number;
  holdingProfitAmount?: number;
  plannedRatio?: number;
}): Promise<void> {
  const response = await apiRequest(`/v1/portfolios/${params.portfolioId}/funds`, {
    method: "POST",
    auth: true,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      fundCode: params.fundCode,
      holdingAmount: params.holdingAmount,
      holdingProfitAmount: params.holdingProfitAmount,
      plannedRatio: params.plannedRatio
    })
  });

  await ensureOk(response, "Add portfolio fund failed");
}

export async function updatePortfolioFund(params: {
  portfolioId: string;
  fundCode: string;
  holdingAmount?: number;
  holdingProfitAmount?: number;
  plannedRatio?: number;
}): Promise<void> {
  const normalizedFundCode = normalizeFundCodeForPath(params.fundCode);
  const response = await apiRequest(`/v1/portfolios/${params.portfolioId}/funds/${normalizedFundCode}`, {
    method: "PATCH",
    auth: true,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      holdingAmount: params.holdingAmount,
      holdingProfitAmount: params.holdingProfitAmount,
      plannedRatio: params.plannedRatio
    })
  });

  await ensureOk(response, "Update portfolio fund failed");
}

export async function removePortfolioFund(portfolioId: string, fundCode: string): Promise<void> {
  const normalizedFundCode = normalizeFundCodeForPath(fundCode);
  const response = await apiRequest(`/v1/portfolios/${portfolioId}/funds/${normalizedFundCode}`, {
    method: "DELETE",
    auth: true
  });

  await ensureOk(response, "Remove portfolio fund failed");
}

export async function createPositionOperation(params: {
  portfolioId: string;
  fundCode: string;
  operationType: PositionOperationType;
  amount: number;
}): Promise<PositionOperationRecord> {
  const normalizedFundCode = normalizeFundCodeForPath(params.fundCode);
  const response = await apiRequest(`/v1/portfolios/${params.portfolioId}/funds/${normalizedFundCode}/position-operations`, {
    method: "POST",
    auth: true,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      operationType: params.operationType,
      amount: params.amount
    })
  });

  await ensureOk(response, "Create position operation failed");
  const data = (await response.json()) as { operation: PositionOperationRecord };
  return data.operation;
}

export async function fetchPositionOperations(
  portfolioId: string,
  options?: { limit?: number; fundCode?: string }
): Promise<PositionOperationRecord[]> {
  const search = new URLSearchParams();
  if (typeof options?.limit === "number") {
    search.set("limit", String(options.limit));
  }
  if (options?.fundCode) {
    search.set("fundCode", options.fundCode);
  }
  const query = search.toString();
  const path = query ? `/v1/portfolios/${portfolioId}/position-operations?${query}` : `/v1/portfolios/${portfolioId}/position-operations`;
  const response = await apiRequest(path, {
    auth: true
  });
  await ensureOk(response, "Fetch position operations failed");
  const data = (await response.json()) as { items?: PositionOperationRecord[] };
  return data.items ?? [];
}

export async function reorderPortfolioFunds(portfolioId: string, fundCodes: string[]): Promise<void> {
  const response = await apiRequest(`/v1/portfolios/${portfolioId}/funds/order`, {
    method: "PATCH",
    auth: true,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ fundCodes })
  });

  await ensureOk(response, "Reorder portfolio funds failed");
}

export async function fetchFlatFunds(expand: FlatExpandMode, sortOrder: SortOrder): Promise<FlatFundItem[]> {
  const response = await apiRequest(`/v1/funds/flat?expand=${expand}&sortOrder=${sortOrder}`, {
    auth: true
  });

  await ensureOk(response, "Fetch flat funds failed");

  const data = (await response.json()) as { items?: FlatFundItem[] };
  return data.items ?? [];
}

export async function fetchDecisionDoc(portfolioId: string): Promise<PortfolioDecisionDoc | null> {
  const response = await apiRequest(`/v1/portfolios/${portfolioId}/decision-doc`, {
    auth: true
  });

  if (response.status === 404) {
    return null;
  }
  await ensureOk(response, "Fetch decision doc failed");
  const data = (await response.json()) as { doc: PortfolioDecisionDoc };
  return data.doc;
}

export async function upsertDecisionDoc(params: {
  portfolioId: string;
  title?: string;
  content: string;
  format: DecisionDocFormat;
  sourceFileName?: string;
}): Promise<PortfolioDecisionDoc> {
  const response = await apiRequest(`/v1/portfolios/${params.portfolioId}/decision-doc`, {
    method: "PUT",
    auth: true,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      title: params.title,
      content: params.content,
      format: params.format,
      sourceFileName: params.sourceFileName
    })
  });

  await ensureOk(response, "Save decision doc failed");
  const data = (await response.json()) as { doc: PortfolioDecisionDoc };
  return data.doc;
}

export async function generateDailyDecision(portfolioId: string): Promise<DailyDecision> {
  const response = await apiRequest(`/v1/portfolios/${portfolioId}/daily-decision:generate`, {
    method: "POST",
    auth: true
  });
  await ensureOk(response, "Generate daily decision failed");
  const data = (await response.json()) as { decision: DailyDecision };
  return data.decision;
}

export async function fetchLatestDailyDecision(portfolioId: string): Promise<DailyDecision | null> {
  const response = await apiRequest(`/v1/portfolios/${portfolioId}/daily-decision/latest`, {
    auth: true
  });
  await ensureOk(response, "Fetch latest daily decision failed");
  const data = (await response.json()) as { decision: DailyDecision | null };
  return data.decision;
}

export async function fetchDailyDecisionHistory(portfolioId: string, limit = 10): Promise<DailyDecision[]> {
  const response = await apiRequest(`/v1/portfolios/${portfolioId}/daily-decision/history?limit=${limit}`, {
    auth: true
  });
  await ensureOk(response, "Fetch daily decision history failed");
  const data = (await response.json()) as { items?: DailyDecision[] };
  return data.items ?? [];
}

export async function sharePortfolio(params: {
  portfolioId: string;
  validity?: PortfolioShareValidity;
  password?: string;
}): Promise<PortfolioShareResult> {
  const response = await apiRequest(`/v1/portfolios/${params.portfolioId}/share`, {
    method: "POST",
    auth: true,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      validity: params.validity ?? "SEVEN_DAYS",
      password: params.password
    })
  });

  await ensureOk(response, "Share portfolio failed");
  return response.json() as Promise<PortfolioShareResult>;
}

export async function importPortfolioByShareCode(params: {
  shareCode: string;
  password?: string;
}): Promise<ImportPortfolioByShareCodeResult> {
  const response = await apiRequest("/v1/portfolios/import-by-share-code", {
    method: "POST",
    auth: true,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      shareCode: params.shareCode,
      password: params.password
    })
  });

  await ensureOk(response, "Import portfolio failed");
  return response.json() as Promise<ImportPortfolioByShareCodeResult>;
}
