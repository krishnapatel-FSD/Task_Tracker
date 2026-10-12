CREATE TYPE "public"."task_event_type" AS ENUM('created', 'updated', 'reassigned', 'status_changed', 'archived', 'restored', 'attachment_added', 'attachment_removed');--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"colour_index" smallint DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"type" "task_event_type" NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "archived_by" uuid;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_events_task_created_idx" ON "task_events" USING btree ("task_id","created_at");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_completed_at_idx" ON "tasks" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "tasks_live_deadline_idx" ON "tasks" USING btree ("deadline") WHERE "tasks"."archived_at" is null;--> statement-breakpoint
-- Backfill (hand-written): existing tasks move into "General", get completed_at and a "created" event.
INSERT INTO "projects" ("name", "description", "colour_index")
SELECT 'General', 'Tasks created before projects existed.', 7
WHERE EXISTS (SELECT 1 FROM "tasks");--> statement-breakpoint
UPDATE "tasks" SET "project_id" = (SELECT "id" FROM "projects" WHERE "name" = 'General') WHERE "project_id" IS NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
UPDATE "tasks" SET "completed_at" = "updated_at" WHERE "status" = 'done' AND "completed_at" IS NULL;--> statement-breakpoint
INSERT INTO "task_events" ("task_id", "actor_id", "type", "data", "created_at")
SELECT t."id",
       (SELECT u."id" FROM "users" u WHERE u."role" = 'admin' ORDER BY u."created_at" LIMIT 1),
       'created',
       jsonb_build_object('title', t."title", 'assigneeId', t."assignee_id", 'projectId', t."project_id",
                          'priority', t."priority", 'deadline', t."deadline"),
       t."created_at"
FROM "tasks" t
WHERE EXISTS (SELECT 1 FROM "users" WHERE "role" = 'admin');