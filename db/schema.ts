import { pgTable, serial, text, timestamp, numeric, date, index } from "drizzle-orm/pg-core";

export const expenses = pgTable(
  "expenses",
  {
    id: serial().primaryKey(),
    clientId: text("client_id").notNull(),
    title: text().notNull(),
    amount: numeric({ precision: 12, scale: 2 }).notNull(),
    category: text().notNull(),
    spentOn: date("spent_on").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("expenses_client_id_idx").on(t.clientId)]
);
