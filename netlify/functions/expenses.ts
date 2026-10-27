import type { Config, Context } from "@netlify/functions";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { expenses } from "../../db/schema.js";

const CATEGORIES = ["Food", "Travel", "Shopping", "Bills", "Education", "Others"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toJson = (row: typeof expenses.$inferSelect) => ({
  id: row.id,
  title: row.title,
  amount: Number(row.amount),
  category: row.category,
  date: row.spentOn,
  createdAt: row.createdAt,
});

export default async (req: Request, context: Context) => {
  // Expenses are scoped to an anonymous per-browser ID generated on the client.
  const clientId = req.headers.get("x-client-id") ?? "";
  if (!UUID_RE.test(clientId)) {
    return Response.json({ error: "Missing or invalid client ID" }, { status: 400 });
  }

  if (req.method === "GET") {
    const rows = await db
      .select()
      .from(expenses)
      .where(eq(expenses.clientId, clientId))
      .orderBy(desc(expenses.spentOn), desc(expenses.id));
    return Response.json(rows.map(toJson));
  }

  if (req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const title = String(body?.title ?? "").trim().slice(0, 120);
    const amount = Number(body?.amount);
    const category = CATEGORIES.includes(body?.category) ? body.category : "Others";
    const date = String(body?.date ?? "");

    if (!title) return Response.json({ error: "Expense name is required" }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
      return Response.json({ error: "Amount must be a positive number" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      return Response.json({ error: "A valid date is required" }, { status: 400 });
    }

    const [row] = await db
      .insert(expenses)
      .values({ clientId, title, amount: amount.toFixed(2), category, spentOn: date })
      .returning();
    return Response.json(toJson(row), { status: 201 });
  }

  if (req.method === "DELETE") {
    const id = Number(context.params.id);
    if (!Number.isInteger(id)) return Response.json({ error: "Invalid ID" }, { status: 400 });
    const deleted = await db
      .delete(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.clientId, clientId)))
      .returning({ id: expenses.id });
    if (!deleted.length) return Response.json({ error: "Not found" }, { status: 404 });
    return new Response(null, { status: 204 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: ["/api/expenses", "/api/expenses/:id"],
};
