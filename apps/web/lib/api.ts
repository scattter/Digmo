import {
  AuthUser,
  BatchEstimateResponse,
  FlatFundItem,
  FundEstimateSnapshot,
  LoginResponse,
  PortfolioDailyProfitV2Response,
  PortfolioFundItem,
  PortfolioSummary,
  PortfolioType
} from "@digmo/shared";
import { getAccessToken } from "./auth-session";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
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

export async function fetchSingleEstimate(fundCode: string): Promise<FundEstimateSnapshot> {
  const response = await apiRequest(`/v1/funds/${fundCode}/estimate`);
  await ensureOk(response, "Fund request failed");
  return response.json() as Promise<FundEstimateSnapshot>;
}

export async function fetchPortfolios(): Promise<PortfolioSummary[]> {
  const response = await apiRequest("/v1/portfolios", {
    auth: true
  });

  await ensureOk(response, "Fetch portfolios failed");
  const data = (await response.json()) as { portfolios?: PortfolioSummary[] };
  return data.portfolios ?? [];
}

export async function fetchPortfoliosDailyProfitV2(): Promise<PortfolioDailyProfitV2Response> {
  const response = await apiRequest("/v2/portfolios/daily-profit", {
    auth: true
  });

  await ensureOk(response, "Fetch v2 portfolios daily profit failed");
  return response.json() as Promise<PortfolioDailyProfitV2Response>;
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
  const response = await apiRequest(`/v1/portfolios/${params.portfolioId}/funds/${params.fundCode}`, {
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
  const response = await apiRequest(`/v1/portfolios/${portfolioId}/funds/${fundCode}`, {
    method: "DELETE",
    auth: true
  });

  await ensureOk(response, "Remove portfolio fund failed");
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
