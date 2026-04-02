-- Add UPDATE policy for meeting_analysis table
-- This allows users to update speaker assignments and other fields in their own meeting analysis

CREATE POLICY "Users can update their own analysis" ON public.meeting_analysis
    FOR UPDATE USING (user_id = auth.uid());
