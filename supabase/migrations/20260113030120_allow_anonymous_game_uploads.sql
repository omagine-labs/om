-- Allow anonymous users to upload game recordings to the guest user folder in the recordings bucket
-- This enables the BlindSlide game to work for unauthenticated users

-- Allow anonymous uploads to the guest user folder
CREATE POLICY "Allow anonymous game uploads to guest folder"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'recordings'
  AND (storage.foldername(name))[1] = '00000000-0000-0000-0000-000000000001'
);

-- Allow service role to read files from guest folder (for processing)
-- Note: This may already be covered by existing service role policies, but adding for clarity
CREATE POLICY "Service role can read guest recordings"
ON storage.objects FOR SELECT
TO service_role
USING (
  bucket_id = 'recordings'
  AND (storage.foldername(name))[1] = '00000000-0000-0000-0000-000000000001'
);
