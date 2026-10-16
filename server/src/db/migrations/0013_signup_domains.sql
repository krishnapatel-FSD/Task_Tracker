CREATE TABLE "signup_domains" (
	"domain" varchar(255) PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "signup_domains" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Supabase "Before User Created" hook: only allowed company domains may sign up. Accounts the
-- admin creates (app_metadata.added_by_admin, which users can't set themselves) may use any email.
CREATE OR REPLACE FUNCTION public.hook_before_user_created(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  email_domain text := lower(split_part(event->'user'->>'email', '@', 2));
BEGIN
  IF coalesce((event->'user'->'app_metadata'->>'added_by_admin')::boolean, false) THEN
    RETURN '{}'::jsonb;
  END IF;
  IF EXISTS (SELECT 1 FROM public.signup_domains d WHERE d.domain = email_domain) THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Sign-up is only open to company email addresses. Ask your admin to add you.'
  ));
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.hook_before_user_created(jsonb) FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.hook_before_user_created(jsonb) TO supabase_auth_admin';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.hook_before_user_created(jsonb) FROM anon';
    EXECUTE 'REVOKE ALL ON public.signup_domains FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.hook_before_user_created(jsonb) FROM authenticated';
    EXECUTE 'REVOKE ALL ON public.signup_domains FROM authenticated';
  END IF;
END $$;
