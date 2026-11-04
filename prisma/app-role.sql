-- The role the app connects as: owns the schema and everything in it, and nothing more.
-- The stack's own Postgres user (society_user) is a superuser, and a superuser can run
-- COPY ... TO PROGRAM, a shell in the db container, from the Debugging tab's SQL runner
-- or any query that went wrong. Run as that superuser on every app start (compose's app
-- command), before db push: idempotent, and it also takes back anything a restore run
-- as the superuser created.
--   psql "$DB_ADMIN_URL" -v ON_ERROR_STOP=1 -v pw="$DB_PASSWORD" -f prisma/app-role.sql
-- ponytail: same password as the superuser, so only SQL is fenced in, not a stolen env
-- file; give portal_app its own password if that becomes the threat.
\set QUIET on
SELECT 'CREATE ROLE portal_app' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') \gexec
ALTER ROLE portal_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'pw';
-- CREATE: a restore from Settings > Debugging drops and recreates the schema.
SELECT format('GRANT CONNECT, CREATE, TEMPORARY ON DATABASE %I TO portal_app', current_database()) \gexec
ALTER SCHEMA public OWNER TO portal_app;
SELECT format('ALTER TABLE public.%I OWNER TO portal_app', tablename)
  FROM pg_tables WHERE schemaname = 'public' AND tableowner <> 'portal_app' \gexec
SELECT format('ALTER SEQUENCE public.%I OWNER TO portal_app', sequencename)
  FROM pg_sequences WHERE schemaname = 'public' AND sequenceowner <> 'portal_app' \gexec
SELECT format('ALTER VIEW public.%I OWNER TO portal_app', viewname)
  FROM pg_views WHERE schemaname = 'public' AND viewowner <> 'portal_app' \gexec
-- Prisma's enums (and any domain).
SELECT format('ALTER TYPE public.%I OWNER TO portal_app', t.typname)
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd') AND t.typowner <> 'portal_app'::regrole \gexec
SELECT format('ALTER ROUTINE %s OWNER TO portal_app', p.oid::regprocedure)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proowner <> 'portal_app'::regrole \gexec
