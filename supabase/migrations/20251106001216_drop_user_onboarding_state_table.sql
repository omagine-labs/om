-- CI-BYPASS: destructive-operations
-- Reason: Intentional cleanup - removing unused table
-- Impact: Drops user_onboarding_state table (unused, duplicated Intercom functionality)
-- Justification: Onboarding state management migrated to Intercom
--
-- Drop user_onboarding_state table - migrating onboarding state management to Intercom
-- This table was unused in the codebase and duplicated functionality that Intercom provides
-- via product tours and email sequences

begin;

-- Drop the table and all its dependencies (triggers, policies, etc.)
drop table if exists user_onboarding_state cascade;

commit;
