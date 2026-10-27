CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY,
	"client_id" text NOT NULL,
	"title" text NOT NULL,
	"amount" numeric(12,2) NOT NULL,
	"category" text NOT NULL,
	"spent_on" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "expenses_client_id_idx" ON "expenses" ("client_id");