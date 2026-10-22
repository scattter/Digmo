import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// Platform identity is the tenant key. No passwords, legacy users or API keys.
export const portfolios = sqliteTable("portfolios", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  shareCode: text("share_code").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull().default(0),
}, (table) => [
  uniqueIndex("portfolio_owner_name").on(table.userId, table.name),
  uniqueIndex("portfolio_share_code").on(table.shareCode),
  index("portfolio_owner_order").on(table.userId, table.displayOrder),
]);

export const preferences = sqliteTable("preferences", {
  userId: text("user_id").primaryKey(),
  fundsTabIndex: integer("funds_tab_index").notNull().default(0),
});
