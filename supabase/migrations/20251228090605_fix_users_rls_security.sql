-- Security fix: Restrict users table SELECT policy to own profile only
-- Previously, any authenticated user could view ALL user profiles (emails, names)
-- This allowed user enumeration and potential email harvesting

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view all users" ON public.users;

-- Create a new policy that only allows users to view their own profile
CREATE POLICY "Users can view their own profile" ON public.users
    FOR SELECT USING (id = auth.uid());
