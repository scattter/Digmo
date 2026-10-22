import type { PortfolioType, DecisionAiMode, UserDecisionAiConfigSummary, PositionOperationType } from "@/shared";

export interface PortfolioItem {
  id: string;
  name: string;
  type: PortfolioType;
  shareCode: string;
  totalAsset: number;
  createdAt: string;
  updatedAt: string;
}

export interface FundStateItem {
  fundCode: string;
  totalChangePct: number;
  lastAccumulatedNavDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioFundItem {
  portfolioId: string;
  portfolioName: string;
  portfolioType: PortfolioType;
  fundCode: string;
  displayOrder: number;
  holdingAmount: number;
  holdingProfitAmount: number;
  plannedRatio?: number;
  lastHoldingRollNavDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioTabLayoutPreference {
  fundsTabIndex: number;
}

export interface UserDecisionAiConfigItem extends UserDecisionAiConfigSummary {
  userId: string;
  apiKey: string;
  createdAt: string;
}

export interface UpsertPortfolioFundInput {
  portfolioId: string;
  fundCode: string;
  holdingAmount: number;
  holdingProfitAmount?: number;
  plannedRatio?: number;
}

export interface UpdatePortfolioFundInput {
  portfolioId: string;
  fundCode: string;
  holdingAmount?: number;
  holdingProfitAmount?: number;
  plannedRatio?: number;
}

export interface PositionOperationInput {
  portfolioId: string;
  fundCode: string;
  operationType: PositionOperationType;
  amount: number;
}

export interface PositionOperationItem {
  id: string;
  portfolioId: string;
  fundCode: string;
  operationType: PositionOperationType;
  amount: number;
  beforeHoldingAmount: number;
  afterHoldingAmount: number;
  beforeHoldingProfitAmount: number;
  afterHoldingProfitAmount: number;
  status: "PENDING" | "APPLIED";
  effectiveAt: string;
  appliedAt?: string;
  manualCanceledAt?: string;
  createdAt: string;
}

export interface DeletePositionOperationResult {
  effect: "REMOVED" | "MARKED_MANUAL_CANCEL";
  operation?: PositionOperationItem;
}

export interface PortfolioShareRecord {
  id: string;
  userId: string;
  portfolioId: string;
  shareCode: string;
  status: "ACTIVE" | "INACTIVE";
  snapshotJson: string;
  passwordHash?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistStore {
  listPortfolios(userId: string): Promise<PortfolioItem[]>;
  getPortfolio(userId: string, portfolioId: string): Promise<PortfolioItem | undefined>;
  createPortfolio(userId: string, name: string, type: PortfolioType, totalAsset?: number): Promise<PortfolioItem>;
  updatePortfolio(
    userId: string,
    portfolioId: string,
    input: { name?: string; totalAsset?: number }
  ): Promise<boolean>;
  deletePortfolio(userId: string, portfolioId: string): Promise<boolean>;
  validatePortfolioSet(userId: string, orderedPortfolioIds: string[]): Promise<boolean>;
  reorderPortfolios(userId: string, orderedPortfolioIds: string[]): Promise<void>;
  getPortfolioTabLayoutPreference(userId: string): Promise<PortfolioTabLayoutPreference>;
  setPortfolioTabLayoutPreference(userId: string, preference: PortfolioTabLayoutPreference): Promise<void>;
  getDecisionAiConfig(userId: string): Promise<UserDecisionAiConfigItem | undefined>;
  upsertDecisionAiConfig(
    userId: string,
    input: { baseUrl: string; model: string; mode: DecisionAiMode; apiKey: string }
  ): Promise<UserDecisionAiConfigItem>;

  listPortfolioFunds(userId: string, portfolioId: string): Promise<PortfolioFundItem[]>;
  listAllPortfolioFunds(userId: string): Promise<PortfolioFundItem[]>;
  getPortfolioFund(userId: string, portfolioId: string, fundCode: string): Promise<PortfolioFundItem | undefined>;
  upsertPortfolioFund(userId: string, input: UpsertPortfolioFundInput): Promise<void>;
  updatePortfolioFund(userId: string, input: UpdatePortfolioFundInput): Promise<boolean>;
  applyPositionOperation(userId: string, input: PositionOperationInput): Promise<PositionOperationItem | undefined>;
  deletePositionOperation(
    userId: string,
    portfolioId: string,
    fundCode: string,
    operationId: string
  ): Promise<DeletePositionOperationResult | undefined>;
  listPositionOperations(
    userId: string,
    portfolioId: string,
    options?: { limit?: number; fundCode?: string }
  ): Promise<PositionOperationItem[]>;
  rollPortfolioFundHoldingByNavDate(userId: string, fundCode: string, navDate: string, dailyReturn: number): Promise<number>;
  removePortfolioFund(userId: string, portfolioId: string, fundCode: string): Promise<boolean>;
  reorderPortfolioFunds(userId: string, portfolioId: string, orderedFundCodes: string[]): Promise<void>;
  validatePortfolioFundSet(userId: string, portfolioId: string, orderedFundCodes: string[]): Promise<boolean>;
  sumPlannedRatio(userId: string, portfolioId: string, excludeFundCode?: string): Promise<number>;

  listUniqueFundCodes(userId: string): Promise<string[]>;
  listFundStatesByCodes(userId: string, fundCodes: string[]): Promise<Map<string, FundStateItem>>;
  ensureFundState(userId: string, fundCode: string): Promise<void>;
  accumulateOfficialReturn(userId: string, fundCode: string, navDate: string, dailyReturn: number): Promise<boolean>;
  cleanupOrphanFundStates(userId: string): Promise<void>;

  getActivePortfolioShareByCode(shareCode: string): Promise<PortfolioShareRecord | undefined>;
  replaceActivePortfolioShare(input: {
    userId: string;
    portfolioId: string;
    shareCode: string;
    snapshotJson: string;
    passwordHash?: string;
    expiresAt?: string;
  }): Promise<PortfolioShareRecord>;
}
