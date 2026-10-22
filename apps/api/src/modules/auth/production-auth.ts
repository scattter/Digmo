import { SqliteWatchlistStore } from "../../infra/watchlist/sqlite-watchlist-store.js";
import { verifyPassword } from "./password.js";

export async function ensureProductionPasswords(store: SqliteWatchlistStore): Promise<void> {
  for (const user of await store.listUsers()) {
    if (user.status !== "active") continue;
    const saved = await store.getUserById(user.id);
    if (saved && verifyPassword("admin123456", saved.passwordHash)) {
      throw new Error(`账号 ${user.username} 仍使用公开默认密码，请先运行 user:password 修改密码，并更换 AUTH_JWT_SECRET`);
    }
  }
}
