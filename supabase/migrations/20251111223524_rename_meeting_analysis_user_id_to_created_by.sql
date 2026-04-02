-- Rename meeting_analysis.user_id to created_by to match v2 schema
-- This fixes production schema drift where v2 migration was never applied
-- Idempotent: Only applies changes if user_id column exists

DO $$
BEGIN
    -- Step 1: Rename the column (only if user_id exists)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'meeting_analysis'
        AND column_name = 'user_id'
    ) THEN
        ALTER TABLE public.meeting_analysis
        RENAME COLUMN user_id TO created_by;

        RAISE NOTICE 'Renamed column user_id to created_by';
    ELSE
        RAISE NOTICE 'Column created_by already exists, skipping rename';
    END IF;

    -- Step 2: Update the foreign key constraint (only if old constraint exists)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
        AND table_name = 'meeting_analysis'
        AND constraint_name = 'meeting_analysis_user_id_fkey'
    ) THEN
        ALTER TABLE public.meeting_analysis
        DROP CONSTRAINT meeting_analysis_user_id_fkey;

        ALTER TABLE public.meeting_analysis
        ADD CONSTRAINT meeting_analysis_created_by_fkey
          FOREIGN KEY (created_by)
          REFERENCES public.users(id)
          ON DELETE CASCADE;

        RAISE NOTICE 'Renamed foreign key constraint';
    ELSE
        RAISE NOTICE 'Foreign key constraint already correct, skipping';
    END IF;

    -- Step 3: Update the index (only if old index exists)
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
        AND tablename = 'meeting_analysis'
        AND indexname = 'idx_meeting_analysis_user_id'
    ) THEN
        DROP INDEX public.idx_meeting_analysis_user_id;
        CREATE INDEX idx_meeting_analysis_created_by
        ON public.meeting_analysis(created_by);

        RAISE NOTICE 'Renamed index';
    ELSE
        RAISE NOTICE 'Index already correct, skipping';
    END IF;

    -- Step 4: Update RLS policies (idempotent - drop and recreate)
    -- Drop old policies if they exist
    DROP POLICY IF EXISTS "Users can view own or assigned analyses" ON public.meeting_analysis;
    DROP POLICY IF EXISTS "Users can create their own analysis" ON public.meeting_analysis;
    DROP POLICY IF EXISTS "Users can update their own analysis" ON public.meeting_analysis;
    DROP POLICY IF EXISTS "Users can delete their own analysis" ON public.meeting_analysis;

    -- Recreate policies with created_by
    CREATE POLICY "Users can view own or assigned analyses"
    ON public.meeting_analysis
    FOR SELECT
    USING (
        created_by = auth.uid()
        OR assigned_user_id = auth.uid()
    );

    CREATE POLICY "Users can create their own analysis"
    ON public.meeting_analysis
    FOR INSERT
    WITH CHECK (created_by = auth.uid());

    CREATE POLICY "Users can update their own analysis"
    ON public.meeting_analysis
    FOR UPDATE
    USING (created_by = auth.uid());

    CREATE POLICY "Users can delete their own analysis"
    ON public.meeting_analysis
    FOR DELETE
    USING (created_by = auth.uid());

    RAISE NOTICE 'RLS policies updated';
END $$;
