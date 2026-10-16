-- Logins move to Supabase Auth: each person links to auth.users through auth_id. The emailed
-- sign-up codes are now Supabase's, so our own code table goes.
DROP TABLE IF EXISTS "signup_codes";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_id_unique" UNIQUE("auth_id");