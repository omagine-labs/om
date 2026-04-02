import { createClient } from '@/lib/supabase';

/**
 * Generate a magic link for desktop app authentication
 * Calls the Supabase Edge Function with the user's session token
 *
 * @returns The hashed token and email if successful
 * @throws Error if generation fails
 */
export async function generateMagicLink(): Promise<{
  hashedToken: string;
  email: string;
}> {
  const supabase = createClient();

  // Get the current session to pass as Bearer token
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error('Not authenticated');
  }

  // Call the Edge Function with the session token
  const { data, error } = await supabase.functions.invoke(
    'generate-magic-link',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );

  if (error) {
    console.error('[MagicLink] Error calling Edge Function:', error);
    throw new Error('Failed to generate magic link');
  }

  if (!data.success || !data.hashedToken || !data.email) {
    console.error('[MagicLink] Invalid response:', data);
    throw new Error('Invalid magic link response');
  }

  return {
    hashedToken: data.hashedToken,
    email: data.email,
  };
}
