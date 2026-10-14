ALTER TYPE "public"."notification_type" ADD VALUE 'handoff_received';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'handoff_accepted';--> statement-breakpoint
ALTER TYPE "public"."task_event_type" ADD VALUE 'handed_off';--> statement-breakpoint
ALTER TYPE "public"."task_event_type" ADD VALUE 'handoff_accepted';--> statement-breakpoint
CREATE TABLE "task_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"done" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"remaining" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"blockers" text,
	"decisions" text,
	"attachment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_handoffs" ADD CONSTRAINT "task_handoffs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_handoffs" ADD CONSTRAINT "task_handoffs_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_handoffs" ADD CONSTRAINT "task_handoffs_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_handoffs" ADD CONSTRAINT "task_handoffs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_handoffs_task_idx" ON "task_handoffs" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "task_handoffs_one_pending_idx" ON "task_handoffs" USING btree ("task_id") WHERE "task_handoffs"."accepted_at" is null;