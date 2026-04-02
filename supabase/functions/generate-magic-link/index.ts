import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { initSentry, flush } from '../_shared/sentry.ts';

// Initialize Sentry for error tracking
initSentry('generate-magic-link');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory rate limiter for Edge Functions
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(
  userId: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; headers: Record<string, string> } {
  const now = Date.now();
  const key = userId;
  const limit = rateLimits.get(key);

  if (!limit || now > limit.resetAt) {
    // New window or expired
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      headers: {
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': (maxRequests - 1).toString(),
        'X-RateLimit-Reset': new Date(now + windowMs).toISOString(),
      },
    };
  }

  if (limit.count >= maxRequests) {
    // Rate limit exceeded
    return {
      allowed: false,
      headers: {
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(limit.resetAt).toISOString(),
        'Retry-After': Math.ceil((limit.resetAt - now) / 1000).toString(),
      },
    };
  }

  // Increment count
  limit.count++;
  rateLimits.set(key, limit);

  return {
    allowed: true,
    headers: {
      'X-RateLimit-Limit': maxRequests.toString(),
      'X-RateLimit-Remaining': (maxRequests - limit.count).toString(),
      'X-RateLimit-Reset': new Date(limit.resetAt).toISOString(),
    },
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      await flush();
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Method not allowed',
        }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceRoleKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseServiceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
    }

    // Create client with user's auth token for verification
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      await flush();
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      await flush();
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check rate limit (10 requests per 5 minutes)
    const rateLimit = checkRateLimit(user.id, 10, 5 * 60 * 1000);
    if (!rateLimit.allowed) {
      await flush();
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Too many requests. Please try again later.',
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            ...rateLimit.headers,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Create admin client with service role key to generate magic link
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Generate magic link using admin API
    const { data, error } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email!,
      options: {
        redirectTo: 'om://auth/magiclink', // Desktop deep link
      },
    });

    if (error) {
      console.error('[generate-magic-link] Error generating link:', error);
      throw new Error('Failed to generate magic link');
    }

    if (!data.properties?.hashed_token) {
      console.error('[generate-magic-link] No hashed token in response');
      throw new Error('Invalid magic link response');
    }

    console.log(
      '[generate-magic-link] Generated magic link for user:',
      user.id
    );

    // Return the hashed token (not the full URL)
    // Desktop will use this with verifyOtp()
    await flush();
    return new Response(
      JSON.stringify({
        success: true,
        hashedToken: data.properties.hashed_token,
        email: user.email,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          ...rateLimit.headers,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[generate-magic-link] Error:', error);

    await flush();
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
