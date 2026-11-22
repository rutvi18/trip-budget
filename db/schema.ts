import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const contributions = sqliteTable("contributions", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  amount: integer("amount").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  index("contributions_created_at_idx").on(table.createdAt),
  index("contributions_owner_id_idx").on(table.ownerId)
]);
