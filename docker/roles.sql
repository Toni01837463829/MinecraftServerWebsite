-- Only for the Docker test: creates the same roles a Supabase project has, so supabase/schema.sql
-- works here exactly like in Supabase. (Supabase already has these roles; don't run this there.)
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
-- The API logs in as "authenticator" and then switches to anon or service_role, depending on the key.
create role authenticator login password 'test123' noinherit;
grant anon, authenticated, service_role to authenticator;
