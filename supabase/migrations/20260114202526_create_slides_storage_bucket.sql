-- Create slides storage bucket for slide images
-- Images are publicly readable (no auth needed to view)
-- Only authenticated admin users can upload/modify

-- Create the slides bucket (public for read access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'slides',
  'slides',
  true,  -- Public bucket for easy image access
  5242880,  -- 5MB max file size
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Allow public read access to slides (anyone can view images)
DROP POLICY IF EXISTS "Public read access for slides" ON storage.objects;
CREATE POLICY "Public read access for slides"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'slides');

-- Only service role can upload/modify slides (via scripts or admin)
-- This is implicit - without an INSERT policy, only service role can upload
