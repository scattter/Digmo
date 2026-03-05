CREATE TABLE IF NOT EXISTS fund_basic (
  fund_code VARCHAR(6) PRIMARY KEY,
  fund_name TEXT NOT NULL,
  fund_type TEXT NOT NULL,
  index_code TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fund_nav_daily (
  fund_code VARCHAR(6) NOT NULL,
  nav_date DATE NOT NULL,
  nav NUMERIC(18, 6) NOT NULL,
  daily_return NUMERIC(10, 6) NOT NULL,
  PRIMARY KEY (fund_code, nav_date)
);

CREATE TABLE IF NOT EXISTS fund_holding_snapshot (
  fund_code VARCHAR(6) NOT NULL,
  report_date DATE NOT NULL,
  holding_json JSONB NOT NULL,
  stock_ratio NUMERIC(10, 6) NOT NULL,
  bond_ratio NUMERIC(10, 6) NOT NULL,
  cash_ratio NUMERIC(10, 6) NOT NULL,
  PRIMARY KEY (fund_code, report_date)
);

CREATE TABLE IF NOT EXISTS market_quote_snapshot (
  quote_code TEXT NOT NULL,
  quote_date DATE NOT NULL,
  quote_time TIMESTAMP NOT NULL,
  close_or_last NUMERIC(18, 6),
  change_pct NUMERIC(10, 6) NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (quote_code, quote_time)
);

CREATE TABLE IF NOT EXISTS fund_estimate_snapshot (
  fund_code VARCHAR(6) NOT NULL,
  estimate_time TIMESTAMP NOT NULL,
  estimate_time_bucket TIMESTAMP NOT NULL,
  base_nav_date DATE NOT NULL,
  estimate_nav NUMERIC(18, 6) NOT NULL,
  estimate_change_pct NUMERIC(10, 6) NOT NULL,
  confidence_score NUMERIC(5, 2) NOT NULL,
  method TEXT NOT NULL,
  inputs_json JSONB NOT NULL,
  PRIMARY KEY (fund_code, estimate_time_bucket)
);

CREATE TABLE IF NOT EXISTS job_run_log (
  id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  status TEXT NOT NULL,
  success_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  error_json JSONB NOT NULL DEFAULT '{}'::jsonb
);
