// Edge Function: Send Team Alert
// Sends real-time alerts to the team about fraud, rate limiting, and capacity issues
// Includes deduplication to prevent alert fatigue

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { initSentry, captureException, flush } from '../_shared/sentry.ts';

// Initialize Sentry for error tracking
initSentry('send-team-alert');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// Alert configuration
const ALERT_DEDUP_WINDOW_HOURS = 1; // Only send one alert per type per hour
const TEAM_ALERT_EMAIL =
  Deno.env.get('TEAM_ALERT_EMAIL') || 'team@omaginelabs.com';

interface AlertPayload {
  alert_type: string;
  alert_details: Record<string, unknown>;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // Only allow POST
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request
    const { alert_type, alert_details }: AlertPayload = await req.json();

    if (!alert_type) {
      return new Response(JSON.stringify({ error: 'alert_type is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[send-team-alert] Processing alert: ${alert_type}`);

    // Check for recent alerts of this type (deduplication)
    const dedupWindowStart = new Date(
      Date.now() - ALERT_DEDUP_WINDOW_HOURS * 60 * 60 * 1000
    );

    const { data: recentAlerts, error: dedupError } = await supabase
      .from('monitoring_alerts')
      .select('id, sent_at')
      .eq('alert_type', alert_type)
      .gte('sent_at', dedupWindowStart.toISOString())
      .order('sent_at', { ascending: false })
      .limit(1);

    if (dedupError) {
      console.error(
        '[send-team-alert] Error checking recent alerts:',
        dedupError
      );
      throw dedupError;
    }

    if (recentAlerts && recentAlerts.length > 0) {
      const lastAlertTime = new Date(recentAlerts[0].sent_at);
      const minutesAgo = Math.round(
        (Date.now() - lastAlertTime.getTime()) / 60000
      );

      console.log(
        `[send-team-alert] Alert ${alert_type} was sent ${minutesAgo} minutes ago, skipping duplicate`
      );

      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: `Alert already sent ${minutesAgo} minutes ago`,
        }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    // Generate email content based on alert type
    const emailContent = generateAlertEmail(alert_type, alert_details);

    // Send email via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.warn(
        '[send-team-alert] RESEND_API_KEY not configured, skipping email send'
      );
      // In development, log the alert instead
      console.log('[send-team-alert] Alert email (dev mode):');
      console.log('  To:', TEAM_ALERT_EMAIL);
      console.log('  Subject:', emailContent.subject);
      console.log('  Body:', emailContent.html.substring(0, 200) + '...');
    } else {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Chip Alerts <alerts@omaginelabs.com>',
          to: TEAM_ALERT_EMAIL,
          subject: emailContent.subject,
          html: emailContent.html,
        }),
      });

      if (!emailResponse.ok) {
        const errorText = await emailResponse.text();
        throw new Error(`Resend API error: ${errorText}`);
      }

      const emailResult = await emailResponse.json();
      console.log(
        `[send-team-alert] Email sent successfully (ID: ${emailResult.id})`
      );
    }

    // Log the alert to monitoring_alerts table
    const { error: insertError } = await supabase
      .from('monitoring_alerts')
      .insert({
        alert_type,
        alert_details: alert_details || null,
        sent_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('[send-team-alert] Error logging alert:', insertError);
      // Don't throw - email was sent successfully
    }

    await flush();
    return new Response(
      JSON.stringify({
        success: true,
        alert_type,
        sent_at: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[send-team-alert] Error:', error);
    captureException(error);
    await flush();
    return new Response(
      JSON.stringify({
        error: error.message || 'An unexpected error occurred',
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }
});

/**
 * Generate email content based on alert type
 */
function generateAlertEmail(
  alertType: string,
  details: Record<string, unknown>
): { subject: string; html: string } {
  switch (alertType) {
    case 'capacity_warning':
      return {
        subject: `🚨 Anonymous Upload Capacity Warning: ${details.percentage_used}% Used`,
        html: `
          <h1>⚠️ Capacity Warning</h1>
          <p>The anonymous meeting upload system is approaching capacity:</p>
          <ul>
            <li><strong>Current Count:</strong> ${details.current_count}</li>
            <li><strong>Max Capacity:</strong> ${details.max_capacity}</li>
            <li><strong>Percentage Used:</strong> ${details.percentage_used}%</li>
          </ul>
          <p><strong>Action Required:</strong> Consider increasing the monthly cap or monitoring closely for capacity breach.</p>
        `,
      };

    case 'rate_limit_spike':
      return {
        subject: '🚨 Rate Limiting Spike Detected',
        html: `
          <h1>⚠️ Rate Limit Spike</h1>
          <p>Multiple users are hitting rate limits:</p>
          <ul>
            <li><strong>Limit Type:</strong> ${details.limit_type || 'unknown'}</li>
            <li><strong>Count in Last Hour:</strong> ${details.count || 0}</li>
          </ul>
          <p><strong>Action:</strong> Check logs for potential abuse patterns or legitimate traffic spikes.</p>
        `,
      };

    case 'fraud_spike':
      return {
        subject: '🚨 Fraud Detection Spike',
        html: `
          <h1>⚠️ Fraud Activity Detected</h1>
          <p>Multiple fraud patterns detected in the last hour:</p>
          <ul>
            <li><strong>Fraud Events:</strong> ${details.count || 0}</li>
            <li><strong>Primary Reason:</strong> ${details.primary_reason || 'various'}</li>
          </ul>
          <p><strong>Action:</strong> Review user_event_log for 'anon_upload_fraud_detected' events.</p>
        `,
      };

    case 'system_failure':
      return {
        subject: '🚨 Anonymous Upload System Failure',
        html: `
          <h1>⚠️ System Failure</h1>
          <p>Multiple anonymous uploads are failing:</p>
          <ul>
            <li><strong>Failed Uploads:</strong> ${details.count || 0}</li>
            <li><strong>Error Pattern:</strong> ${details.error_pattern || 'various errors'}</li>
          </ul>
          <p><strong>Action:</strong> Check logs immediately for system issues.</p>
        `,
      };

    default:
      return {
        subject: `🚨 Monitoring Alert: ${alertType}`,
        html: `
          <h1>⚠️ Monitoring Alert</h1>
          <p>Alert Type: <strong>${alertType}</strong></p>
          <pre>${JSON.stringify(details, null, 2)}</pre>
        `,
      };
  }
}
