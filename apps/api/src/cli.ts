import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { UserRole, UserStatus } from "@digmo/shared";
import { getConfig } from "./config.js";
import { ExportDataPayload, SqliteWatchlistStore } from "./infra/watchlist/sqlite-watchlist-store.js";
import { hashPassword } from "./modules/auth/password.js";

interface ArgMap {
  [key: string]: string | boolean;
}

function parseArgs(argv: string[]): { command?: string; args: ArgMap } {
  const [command, ...rest] = argv;
  const args: ArgMap = {};

  for (let i = 0; i < rest.length; i += 1) {
    const item = rest[i];
    if (!item.startsWith("--")) {
      continue;
    }

    const key = item.slice(2);
    const next = rest[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    i += 1;
  }

  return {
    command,
    args
  };
}

function ensureStringArg(args: ArgMap, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`missing required argument --${key}`);
  }
  return value.trim();
}

function parseRole(value: string | boolean | undefined): UserRole {
  if (value === "admin" || value === "user") {
    return value;
  }
  return "user";
}

function parseStatus(value: string | boolean | undefined): UserStatus {
  if (value === "disabled") {
    return "disabled";
  }
  return "active";
}

async function main(): Promise<void> {
  const { command, args } = parseArgs(process.argv.slice(2));
  if (command === "user:password") {
    const username = ensureStringArg(args, "username");
    const password = typeof args.password === "string" ? args.password.trim() : process.env.USER_PASSWORD?.trim();
    if (!password || password.length < 12) throw new Error("密码至少 12 字符，请设置 USER_PASSWORD 或 --password");
    const dbPath = process.env.WATCHLIST_DB_PATH ?? "./data/watchlist.sqlite";
    if (!existsSync(dbPath)) throw new Error(`数据库不存在: ${dbPath}`);
    // 密码恢复必须绕过生产启动校验，且不能额外创建初始管理员。
    const db = new DatabaseSync(dbPath);
    try {
      const result = db.prepare("UPDATE app_user SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ? COLLATE NOCASE")
        .run(hashPassword(password), username);
      if (result.changes !== 1) throw new Error(`user ${username} not found`);
    } finally {
      db.close();
    }
    console.log(JSON.stringify({ ok: true, username }));
    return;
  }
  const config = getConfig();
  const store = new SqliteWatchlistStore(config.watchlist.dbPath, {
    bootstrapAdminUsername: config.auth.bootstrapAdminUsername,
    bootstrapAdminPassword: config.auth.bootstrapAdminPassword
  });

  if (!command) {
    throw new Error("missing command. supported: user:create, user:password, data:export, data:import");
  }

  if (command === "user:create") {
    const username = ensureStringArg(args, "username");
    const password = typeof args.password === "string" ? args.password.trim() : process.env.USER_PASSWORD?.trim();
    if (!password) throw new Error("请通过 USER_PASSWORD 或 --password 设置密码");
    if (config.production && password.length < 12) throw new Error("生产账号密码至少 12 字符");
    const role = parseRole(args.role);
    const status = parseStatus(args.status);

    const user = await store.createUser({
      username,
      password,
      role,
      status
    });

    console.log(JSON.stringify({ ok: true, user }, null, 2));
    return;
  }

  if (command === "data:export") {
    const outPath = resolve(ensureStringArg(args, "out"));
    const all = args.all === true;
    const username = typeof args.username === "string" ? args.username.trim() : undefined;

    if (!all && !username) {
      throw new Error("data:export requires either --all or --username <name>");
    }

    const payload = await store.exportData({
      all,
      username
    });

    writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf-8");
    console.log(
      JSON.stringify(
        {
          ok: true,
          out: outPath,
          users: payload.users.length,
          portfolios: payload.portfolios.length,
          fundStates: payload.fundStates.length,
          portfolioFunds: payload.portfolioFunds.length
        },
        null,
        2
      )
    );
    return;
  }

  if (command === "data:import") {
    const inPath = resolve(ensureStringArg(args, "in"));
    const raw = readFileSync(inPath, "utf-8");
    const payload = JSON.parse(raw) as ExportDataPayload;

    await store.importData(payload);

    console.log(
      JSON.stringify(
        {
          ok: true,
          in: inPath,
          users: payload.users?.length ?? 0,
          portfolios: payload.portfolios?.length ?? 0,
          fundStates: payload.fundStates?.length ?? 0,
          portfolioFunds: payload.portfolioFunds?.length ?? 0
        },
        null,
        2
      )
    );
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

void main().catch((error) => {
  console.error(`[cli] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
