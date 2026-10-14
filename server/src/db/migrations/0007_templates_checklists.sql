CREATE TYPE "public"."repeat" AS ENUM('none', 'daily', 'weekly', 'monthly', 'interval');--> statement-breakpoint
CREATE TABLE "project_holidays" (
	"project_id" uuid NOT NULL,
	"date" date NOT NULL,
	"name" varchar(100) NOT NULL,
	CONSTRAINT "project_holidays_project_id_date_pk" PRIMARY KEY("project_id","date")
);
--> statement-breakpoint
CREATE TABLE "task_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"text" varchar(200) NOT NULL,
	"position" integer NOT NULL,
	"done_at" timestamp with time zone,
	"done_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_occurrences" (
	"template_id" uuid NOT NULL,
	"deadline" date NOT NULL,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_occurrences_template_id_deadline_pk" PRIMARY KEY("template_id","deadline")
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"title" varchar(150) NOT NULL,
	"description" text NOT NULL,
	"project_id" uuid NOT NULL,
	"assignee_id" uuid,
	"priority" "priority" NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"repeat" "repeat" DEFAULT 'none' NOT NULL,
	"weekdays" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
	"month_day" smallint,
	"interval_days" smallint,
	"start_date" date NOT NULL,
	"end_date" date,
	"lead_days" smallint DEFAULT 3 NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "skip_weekends" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "project_holidays" ADD CONSTRAINT "project_holidays_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_done_by_users_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_checklist_items_task_idx" ON "task_checklist_items" USING btree ("task_id","position");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE no action ON UPDATE no action;