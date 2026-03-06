import {
  BatchEstimateResponse,
  FlatFundItem,
  FundEstimateSnapshot,
  PortfolioFundItem,
  PortfolioSummary,
  PortfolioType
} from "@digmo/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export type FlatExpandMode = "dedup" | "expanded";
export type SortOrder = "default" | "asc" | "desc";

export async function fetchBatchEstimates(fundCodes: string[]): Promise<BatchEstimateResponse> {
  const response = await fetch(`${API_BASE_URL}/v1/funds/estimate/batch`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ fundCodes }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Batch request failed with status ${response.status}`);
  }

  return response.json() as Promise<BatchEstimateResponse>;
}

export async function fetchSingleEstimate(fundCode: string): Promise<FundEstimateSnapshot> {
  const response = await fetch(`${API_BASE_URL}/v1/funds/${fundCode}/estimate`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Fund request failed with status ${response.status}`);
  }

  return response.json() as Promise<FundEstimateSnapshot>;
}

export async function fetchPortfolios(): Promise<PortfolioSummary[]> {
  const response = await fetch(`${API_BASE_URL}/v1/portfolios`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Fetch portfolios failed with status ${response.status}`);
  }

  const data = (await response.json()) as { portfolios?: PortfolioSummary[] };
  return data.portfolios ?? [];
}

export async function createPortfolio(name: string, type: PortfolioType): Promise<PortfolioSummary> {
  const response = await fetch(`${API_BASE_URL}/v1/portfolios`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ name, type }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Create portfolio failed with status ${response.status}`);
  }

  const data = (await response.json()) as { portfolio: PortfolioSummary };
  return data.portfolio;
}

export async function renamePortfolio(portfolioId: string, name: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/v1/portfolios/${portfolioId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ name }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Rename portfolio failed with status ${response.status}`);
  }
}

export async function deletePortfolio(portfolioId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/v1/portfolios/${portfolioId}`, {
    method: "DELETE",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Delete portfolio failed with status ${response.status}`);
  }
}

export async function reorderPortfolios(portfolioIds: string[]): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/v1/portfolios/order`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ portfolioIds }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Reorder portfolios failed with status ${response.status}`);
  }
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
  const response = await fetch(`${API_BASE_URL}/v1/portfolios/${portfolioId}/funds`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Fetch portfolio funds failed with status ${response.status}`);
  }

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
  const response = await fetch(`${API_BASE_URL}/v1/portfolios/${params.portfolioId}/funds`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      fundCode: params.fundCode,
      holdingAmount: params.holdingAmount,
      holdingProfitAmount: params.holdingProfitAmount,
      plannedRatio: params.plannedRatio
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Add portfolio fund failed with status ${response.status}`);
  }
}

export async function updatePortfolioFund(params: {
  portfolioId: string;
  fundCode: string;
  holdingAmount?: number;
  holdingProfitAmount?: number;
  plannedRatio?: number;
}): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/v1/portfolios/${params.portfolioId}/funds/${params.fundCode}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      holdingAmount: params.holdingAmount,
      holdingProfitAmount: params.holdingProfitAmount,
      plannedRatio: params.plannedRatio
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Update portfolio fund failed with status ${response.status}`);
  }
}

export async function removePortfolioFund(portfolioId: string, fundCode: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/v1/portfolios/${portfolioId}/funds/${fundCode}`, {
    method: "DELETE",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Remove portfolio fund failed with status ${response.status}`);
  }
}

export async function reorderPortfolioFunds(portfolioId: string, fundCodes: string[]): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/v1/portfolios/${portfolioId}/funds/order`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ fundCodes }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Reorder portfolio funds failed with status ${response.status}`);
  }
}

export async function fetchFlatFunds(expand: FlatExpandMode, sortOrder: SortOrder): Promise<FlatFundItem[]> {
  const response = await fetch(`${API_BASE_URL}/v1/funds/flat?expand=${expand}&sortOrder=${sortOrder}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Fetch flat funds failed with status ${response.status}`);
  }

  const data = (await response.json()) as { items?: FlatFundItem[] };
  return data.items ?? [];
}
