Go to the Supabase Dashboard ->  Auth -> Users -> Add a new user with the following credentials:
-- Email: owner@mamtastore.in
-- Password: Mamta@2026


-- Set the role of the user with the specified email to 'admin'
UPDATE public.profiles
SET role = 'admin'
WHERE lower(email) = lower('owner@mamtastore.in');