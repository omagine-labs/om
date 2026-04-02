// Edge Function: Monitoring Digest Cron
// Sends daily digest of anonymous upload metrics to the team
// Run daily at 9 AM UTC

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { initSentry, flush } from '../_shared/sentry.ts';

// Initialize Sentry for error tracking
initSentry('monitoring-digest-cron');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const TEAM_ALERT_EMAIL =
  Deno.env.get('TEAM_ALERT_EMAIL') || 'team@omaginelabs.com';
const MONTHLY_UPLOAD_CAP = 500;

interface MetricsSummary {
  successful_uploads: number;
  failed_uploads: number;
  rate_limited: {
    per_email: number;
    per_ip: number;
    distributed_abuse: number;
  };
  fraud_detected: {
    invalid_user_agent: number;
    duplicate_content: number;
    other: number;
  };
  ip_blocks: number;
  capacity_warnings: number;
  current_monthly_usage: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[monitoring-digest-cron] Generating daily digest...');

    // Calculate time range (last 24 hours)
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    console.log(
      `[monitoring-digest-cron] Time range: ${yesterday.toISOString()} to ${now.toISOString()}`
    );

    // Query events from user_event_log
    const { data: events, error: eventsError } = await supabase
      .from('user_event_log')
      .select('event_name, payload')
      .gte('created_at', yesterday.toISOString())
      .lte('created_at', now.toISOString())
      .in('event_name', [
        'anon_upload_succeeded',
        'anon_upload_failed',
        'anon_upload_rate_limited',
        'anon_upload_fraud_detected',
        'anon_upload_ip_blocked',
        'anon_upload_capacity_warning',
      ]);

    if (eventsError) {
      throw new Error(`Failed to fetch events: ${eventsError.message}`);
    }

    console.log(
      `[monitoring-digest-cron] Found ${events?.length || 0} events in last 24h`
    );

    // Aggregate metrics
    const metrics: MetricsSummary = {
      successful_uploads: 0,
      failed_uploads: 0,
      rate_limited: {
        per_email: 0,
        per_ip: 0,
        distributed_abuse: 0,
      },
      fraud_detected: {
        invalid_user_agent: 0,
        duplicate_content: 0,
        other: 0,
      },
      ip_blocks: 0,
      capacity_warnings: 0,
      current_monthly_usage: 0,
    };

    // Process events
    events?.forEach((event) => {
      switch (event.event_name) {
        case 'anon_upload_succeeded':
          metrics.successful_uploads++;
          break;
        case 'anon_upload_failed':
          metrics.failed_uploads++;
          break;
        case 'anon_upload_rate_limited': {
          const limitType = event.payload?.limit_type;
          if (limitType === 'per_email') {
            metrics.rate_limited.per_email++;
          } else if (limitType === 'per_ip') {
            metrics.rate_limited.per_ip++;
          } else if (limitType === 'distributed_abuse') {
            metrics.rate_limited.distributed_abuse++;
          }
          break;
        }
        case 'anon_upload_fraud_detected': {
          const reason = event.payload?.reason;
          if (reason === 'invalid_user_agent') {
            metrics.fraud_detected.invalid_user_agent++;
          } else if (reason === 'duplicate_content') {
            metrics.fraud_detected.duplicate_content++;
          } else {
            metrics.fraud_detected.other++;
          }
          break;
        }
        case 'anon_upload_ip_blocked':
          metrics.ip_blocks++;
          break;
        case 'anon_upload_capacity_warning':
          metrics.capacity_warnings++;
          break;
      }
    });

    // Get current monthly usage
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const { count: monthlyUploads, error: countError } = await supabase
      .from('anonymous_uploads')
      .select('id', { count: 'exact', head: true })
      .gte('uploaded_at', firstDayOfMonth.toISOString());

    if (countError) {
      console.error(
        '[monitoring-digest-cron] Error counting monthly uploads:',
        countError
      );
    } else {
      metrics.current_monthly_usage = monthlyUploads || 0;
    }

    console.log(
      '[monitoring-digest-cron] Metrics:',
      JSON.stringify(metrics, null, 2)
    );

    // Generate email content
    const emailContent = generateDigestEmail(metrics, yesterday, now);

    // Send email via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.warn(
        '[monitoring-digest-cron] RESEND_API_KEY not configured, skipping email send'
      );
      console.log('[monitoring-digest-cron] Digest email (dev mode):');
      console.log('  To:', TEAM_ALERT_EMAIL);
      console.log('  Subject:', emailContent.subject);
      console.log('  Body:', emailContent.html.substring(0, 500) + '...');
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
        `[monitoring-digest-cron] Digest email sent successfully (ID: ${emailResult.id})`
      );
    }

    await flush();
    return new Response(
      JSON.stringify({
        success: true,
        metrics,
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[monitoring-digest-cron] Error:', error);
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
 * Generate daily digest email content
 */
function generateDigestEmail(
  metrics: MetricsSummary,
  startTime: Date,
  endTime: Date
): { subject: string; html: string } {
  const totalRateLimited =
    metrics.rate_limited.per_email +
    metrics.rate_limited.per_ip +
    metrics.rate_limited.distributed_abuse;

  const totalFraud =
    metrics.fraud_detected.invalid_user_agent +
    metrics.fraud_detected.duplicate_content +
    metrics.fraud_detected.other;

  const monthlyPercentage = Math.round(
    (metrics.current_monthly_usage / MONTHLY_UPLOAD_CAP) * 100
  );

  // Determine health status
  let healthStatus = '🟢 Healthy';
  if (
    metrics.failed_uploads > 5 ||
    totalFraud > 10 ||
    monthlyPercentage >= 90
  ) {
    healthStatus = '🔴 Attention Required';
  } else if (
    metrics.failed_uploads > 0 ||
    totalFraud > 0 ||
    monthlyPercentage >= 75
  ) {
    healthStatus = '🟡 Monitor Closely';
  }

  const dateStr = startTime.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    subject: `📊 Anonymous Upload Digest - ${dateStr} - ${healthStatus}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          h1 { color: #2563eb; border-bottom: 3px solid #2563eb; padding-bottom: 10px; }
          h2 { color: #1e40af; margin-top: 30px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
          .metric-box { background: #f8fafc; border-left: 4px solid #2563eb; padding: 15px; margin: 10px 0; border-radius: 4px; }
          .metric-label { font-weight: 600; color: #64748b; font-size: 14px; }
          .metric-value { font-size: 32px; font-weight: 700; color: #1e293b; }
          .metric-subvalue { font-size: 14px; color: #64748b; margin-top: 5px; }
          .status-healthy { color: #16a34a; }
          .status-warning { color: #eab308; }
          .status-critical { color: #dc2626; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }
          th { background: #f1f5f9; font-weight: 600; color: #475569; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #e2e8f0; color: #64748b; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📊 Anonymous Upload Daily Digest</h1>
          <p><strong>Period:</strong> ${startTime.toLocaleString()} - ${endTime.toLocaleString()}</p>
          <p><strong>Status:</strong> ${healthStatus}</p>

          <h2>📈 Upload Activity</h2>
          <div class="metric-box">
            <div class="metric-label">Successful Uploads</div>
            <div class="metric-value">${metrics.successful_uploads}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Failed Uploads</div>
            <div class="metric-value ${metrics.failed_uploads > 5 ? 'status-critical' : metrics.failed_uploads > 0 ? 'status-warning' : 'status-healthy'}">${metrics.failed_uploads}</div>
          </div>

          <h2>🚦 Monthly Capacity</h2>
          <div class="metric-box">
            <div class="metric-label">Current Usage</div>
            <div class="metric-value ${monthlyPercentage >= 90 ? 'status-critical' : monthlyPercentage >= 75 ? 'status-warning' : 'status-healthy'}">${metrics.current_monthly_usage} / ${MONTHLY_UPLOAD_CAP}</div>
            <div class="metric-subvalue">${monthlyPercentage}% of monthly capacity</div>
          </div>
          ${metrics.capacity_warnings > 0 ? `<p style="color: #dc2626; font-weight: 600;">⚠️ ${metrics.capacity_warnings} capacity warning(s) in last 24h</p>` : ''}

          <h2>🛡️ Rate Limiting</h2>
          <table>
            <tr>
              <th>Limit Type</th>
              <th>Count</th>
            </tr>
            <tr>
              <td>Per Email</td>
              <td>${metrics.rate_limited.per_email}</td>
            </tr>
            <tr>
              <td>Per IP</td>
              <td>${metrics.rate_limited.per_ip}</td>
            </tr>
            <tr>
              <td>Distributed Abuse</td>
              <td>${metrics.rate_limited.distributed_abuse}</td>
            </tr>
            <tr style="font-weight: 600; background: #f1f5f9;">
              <td>Total</td>
              <td>${totalRateLimited}</td>
            </tr>
          </table>

          <h2>🔒 Fraud Detection</h2>
          <table>
            <tr>
              <th>Fraud Type</th>
              <th>Count</th>
            </tr>
            <tr>
              <td>Invalid User-Agent</td>
              <td>${metrics.fraud_detected.invalid_user_agent}</td>
            </tr>
            <tr>
              <td>Duplicate Content</td>
              <td>${metrics.fraud_detected.duplicate_content}</td>
            </tr>
            <tr>
              <td>Other</td>
              <td>${metrics.fraud_detected.other}</td>
            </tr>
            <tr style="font-weight: 600; background: #f1f5f9;">
              <td>Total</td>
              <td class="${totalFraud > 10 ? 'status-critical' : totalFraud > 0 ? 'status-warning' : 'status-healthy'}">${totalFraud}</td>
            </tr>
          </table>
          ${metrics.ip_blocks > 0 ? `<p style="color: #dc2626; font-weight: 600;">⚠️ ${metrics.ip_blocks} IP block(s) for distributed abuse</p>` : ''}

          <div class="footer">
            <p>This digest is generated daily to keep you informed about anonymous upload system health.</p>
            <p>View detailed logs in PostHog or query the <code>user_event_log</code> table for more information.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };
}
