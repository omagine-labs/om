/**
 * Setup script to ensure storage bucket exists with correct configuration
 * Run with: npx tsx supabase-backend/scripts/setup-storage.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables:');
  console.error('  NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl);
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function setupStorage() {
  console.log('🔍 Checking if recordings bucket exists...');

  // Check if bucket exists
  const { data: buckets, error: listError } =
    await supabase.storage.listBuckets();

  if (listError) {
    console.error('❌ Error listing buckets:', listError);
    process.exit(1);
  }

  const recordingsBucket = buckets?.find((b) => b.id === 'recordings');

  if (recordingsBucket) {
    console.log('✅ Recordings bucket already exists:', recordingsBucket);
    console.log('   - Public:', recordingsBucket.public);
    console.log('   - File size limit:', recordingsBucket.file_size_limit);
    return;
  }

  console.log('📦 Creating recordings bucket...');

  // Create bucket
  const { data: newBucket, error: createError } =
    await supabase.storage.createBucket('recordings', {
      public: false,
      fileSizeLimit: 524288000, // 500MB in bytes
      allowedMimeTypes: [
        // Video formats
        'video/mp4',
        'video/quicktime',
        'video/webm',
        'video/x-msvideo',
        'video/x-matroska',
        // Audio formats
        'audio/mpeg',
        'audio/wav',
        'audio/x-wav',
        'audio/mp4',
        'audio/aac',
        'audio/flac',
        'audio/ogg',
        'audio/x-m4a',
      ],
    });

  if (createError) {
    console.error('❌ Error creating bucket:', createError);
    process.exit(1);
  }

  console.log('✅ Recordings bucket created successfully!', newBucket);
}

setupStorage()
  .then(() => {
    console.log('\n✨ Storage setup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Storage setup failed:', error);
    process.exit(1);
  });
