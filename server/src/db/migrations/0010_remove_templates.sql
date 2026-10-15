-- Templates and repeating tasks are gone. Tasks made from them stay as ordinary tasks.
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_template_id_task_templates_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "template_id";--> statement-breakpoint
DROP TABLE IF EXISTS "task_occurrences";--> statement-breakpoint
DROP TABLE IF EXISTS "task_templates";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."repeat";
