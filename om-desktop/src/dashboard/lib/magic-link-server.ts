import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/config';

/**
 * Server-side helper to generate a magic link via Edge Function
 * This is used in server contexts (API routes, server components) where we have an access token
 *
 * @param accessToken - The user's access token from their session
 * @returns The hashed token and email if successful
 * @throws Error if generation fails
 */
export async function generateMagicLinkServer(accessToken: string): Promise<{
  hashedToken: string;
  email: string;
}> {
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  // Create a client to invoke the Edge Function
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Call the Edge Function with the access token
  const { data, error } = await supabase.functions.invoke(
    'generate-magic-link',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (error) {
    console.error('[MagicLinkServer] Error calling Edge Function:', error);
    throw new Error('Failed to generate magic link');
  }

  if (!data?.success || !data?.hashedToken || !data?.email) {
    console.error('[MagicLinkServer] Invalid response:', data);
    throw new Error('Invalid magic link response');
  }

  return {
    hashedToken: data.hashedToken,
    email: data.email,
  };
}
