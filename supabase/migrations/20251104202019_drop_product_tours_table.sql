-- CI-BYPASS: destructive-operations
-- Reason: Intentional cleanup - removing unused table
-- Impact: Drops product_tours table (unused, migrated to Intercom)
-- Justification: Product tours functionality moved to Intercom
--
-- Drop product_tours table - switching to Intercom for product tours and email onboarding

begin;

-- Drop the product_tours table and all its dependencies
drop table if exists product_tours cascade;

commit;
