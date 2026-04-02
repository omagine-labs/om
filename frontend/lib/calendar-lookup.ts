/**
 * Calendar Lookup Service
 *
 * Server-side utilities for querying calendar APIs (Google Calendar, Microsoft Graph)
 * to enrich meeting records with calendar metadata (attendees, meeting links, etc.)
 *
 * Used by the upload route to enrich meetings after recording upload.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/supabase/database.types';

type Provider = 'google' | 'microsoft';

interface CalendarAttendee {
  email: string;
  name?: string;
  responseStatus?: string;
}

interface CalendarEventMetadata {
  attendees: CalendarAttendee[] | null;
  meetingLink: string | null;
  description: string | null;
}

interface OAuthToken {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  provider: string;
}

/**
 * Get a valid access token for the given provider, refreshing if expired
 */
async function getValidAccessToken(
  supabase: SupabaseClient<Database>,
  userId: string,
  provider: Provider
): Promise<string | null> {
  // Fetch stored OAuth token
  const { data: tokenData, error } = await supabase
    .from('oauth_tokens')
    .select('access_token, refresh_token, expires_at, provider')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();

  if (error || !tokenData) {
    console.log(
      `[calendar-lookup] No ${provider} token found for user ${userId}`
    );
    return null;
  }

  const token = tokenData as OAuthToken;

  // Check if token is expired (with 5 minute buffer)
  if (token.expires_at) {
    const expiresAt = new Date(token.expires_at);
    const now = new Date();
    const bufferMs = 5 * 60 * 1000; // 5 minutes

    if (expiresAt.getTime() - bufferMs <= now.getTime()) {
      // Token expired or expiring soon - need to refresh
      console.log(`[calendar-lookup] ${provider} token expired, refreshing...`);

      if (!token.refresh_token) {
        console.log(
          `[calendar-lookup] No refresh token available for ${provider}`
        );
        return null;
      }

      const refreshedToken = await refreshAccessToken(
        supabase,
        userId,
        provider,
        token.refresh_token
      );
      return refreshedToken;
    }
  }

  return token.access_token;
}

/**
 * Refresh an expired access token
 */
async function refreshAccessToken(
  supabase: SupabaseClient<Database>,
  userId: string,
  provider: Provider,
  refreshToken: string
): Promise<string | null> {
  try {
    const tokenUrl =
      provider === 'google'
        ? 'https://oauth2.googleapis.com/token'
        : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

    const clientId =
      provider === 'google'
        ? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
        : process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID;

    const clientSecret =
      provider === 'google'
        ? process.env.GOOGLE_CLIENT_SECRET
        : process.env.MICROSOFT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error(`[calendar-lookup] Missing ${provider} OAuth credentials`);
      return null;
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(
        `[calendar-lookup] Failed to refresh ${provider} token:`,
        errorData
      );
      return null;
    }

    const data = await response.json();

    // Update token in database
    const newExpiresAt = new Date();
    newExpiresAt.setSeconds(newExpiresAt.getSeconds() + data.expires_in);

    const updateData: {
      access_token: string;
      expires_at: string;
      refresh_token?: string;
    } = {
      access_token: data.access_token,
      expires_at: newExpiresAt.toISOString(),
    };

    // Provider may return a new refresh token
    if (data.refresh_token) {
      updateData.refresh_token = data.refresh_token;
    }

    await supabase
      .from('oauth_tokens')
      .update(updateData)
      .eq('user_id', userId)
      .eq('provider', provider);

    return data.access_token;
  } catch (error) {
    console.error(
      `[calendar-lookup] Error refreshing ${provider} token:`,
      error
    );
    return null;
  }
}

/**
 * Query Google Calendar for events in a time range
 */
async function queryGoogleCalendar(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<CalendarEventMetadata | null> {
  try {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '5',
      // Explicitly request attendees and conference data
      fields:
        'items(id,summary,description,attendees,conferenceData,hangoutLink,start,end)',
    });

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      console.error(
        '[calendar-lookup] Google Calendar API error:',
        response.status
      );
      return null;
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      return null;
    }

    // Return the first (closest) event
    const event = data.items[0];

    const attendees: CalendarAttendee[] | null = event.attendees
      ? event.attendees.map(
          (a: {
            email: string;
            displayName?: string;
            responseStatus?: string;
          }) => ({
            email: a.email,
            name: a.displayName || undefined,
            responseStatus: a.responseStatus || undefined,
          })
        )
      : null;

    // Extract meeting link from conferenceData
    let meetingLink: string | null = null;
    if (event.conferenceData?.entryPoints) {
      const videoEntry = event.conferenceData.entryPoints.find(
        (e: { entryPointType: string }) => e.entryPointType === 'video'
      );
      if (videoEntry?.uri) {
        meetingLink = videoEntry.uri;
      }
    }
    // Fallback to hangoutLink
    if (!meetingLink && event.hangoutLink) {
      meetingLink = event.hangoutLink;
    }

    return {
      attendees,
      meetingLink,
      description: event.description || null,
    };
  } catch (error) {
    console.error('[calendar-lookup] Error querying Google Calendar:', error);
    return null;
  }
}

/**
 * Query Microsoft Graph for calendar events in a time range
 */
async function queryMicrosoftCalendar(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<CalendarEventMetadata | null> {
  try {
    const params = new URLSearchParams({
      startDateTime: timeMin,
      endDateTime: timeMax,
      $orderby: 'start/dateTime',
      $top: '5',
      $select: 'subject,attendees,onlineMeeting,bodyPreview,body',
    });

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Prefer: 'outlook.timezone="UTC"',
        },
      }
    );

    if (!response.ok) {
      console.error(
        '[calendar-lookup] Microsoft Graph API error:',
        response.status
      );
      return null;
    }

    const data = await response.json();

    if (!data.value || data.value.length === 0) {
      return null;
    }

    // Return the first (closest) event
    const event = data.value[0];

    const attendees: CalendarAttendee[] | null = event.attendees
      ? event.attendees.map(
          (a: {
            emailAddress: { address: string; name?: string };
            status?: { response?: string };
          }) => ({
            email: a.emailAddress.address,
            name: a.emailAddress.name || undefined,
            responseStatus: a.status?.response || undefined,
          })
        )
      : null;

    // Extract meeting link
    const meetingLink = event.onlineMeeting?.joinUrl || null;

    // Use bodyPreview for description (plain text excerpt)
    const description = event.bodyPreview || null;

    return {
      attendees,
      meetingLink,
      description,
    };
  } catch (error) {
    console.error(
      '[calendar-lookup] Error querying Microsoft Calendar:',
      error
    );
    return null;
  }
}

/**
 * Find calendar event metadata for a meeting time range
 *
 * Checks both Google and Microsoft calendars (if connected) and returns
 * the first matching event's metadata.
 *
 * @param supabase - Supabase client (must have user context)
 * @param userId - User ID to look up calendar tokens for
 * @param startTime - Recording start time (ISO string)
 * @param endTime - Recording end time (ISO string, optional)
 * @returns Calendar event metadata or null if no match found
 */
export async function findCalendarEventMetadata(
  supabase: SupabaseClient<Database>,
  userId: string,
  startTime: string,
  endTime?: string | null
): Promise<CalendarEventMetadata | null> {
  // Calculate search window: from 30 min before start to 30 min after end
  const startDate = new Date(startTime);
  const endDate = endTime
    ? new Date(endTime)
    : new Date(startDate.getTime() + 60 * 60 * 1000); // Default 1 hour if no end

  const searchStart = new Date(startDate.getTime() - 30 * 60 * 1000); // 30 min before
  const searchEnd = new Date(endDate.getTime() + 30 * 60 * 1000); // 30 min after

  const timeMin = searchStart.toISOString();
  const timeMax = searchEnd.toISOString();

  console.log(
    `[calendar-lookup] Searching for events between ${timeMin} and ${timeMax}`
  );

  // Try Google Calendar first
  const googleToken = await getValidAccessToken(supabase, userId, 'google');
  if (googleToken) {
    console.log('[calendar-lookup] Querying Google Calendar...');
    const googleResult = await queryGoogleCalendar(
      googleToken,
      timeMin,
      timeMax
    );
    if (googleResult) {
      console.log('[calendar-lookup] Found matching Google Calendar event');
      return googleResult;
    }
  }

  // Try Microsoft Calendar
  const microsoftToken = await getValidAccessToken(
    supabase,
    userId,
    'microsoft'
  );
  if (microsoftToken) {
    console.log('[calendar-lookup] Querying Microsoft Calendar...');
    const microsoftResult = await queryMicrosoftCalendar(
      microsoftToken,
      timeMin,
      timeMax
    );
    if (microsoftResult) {
      console.log('[calendar-lookup] Found matching Microsoft Calendar event');
      return microsoftResult;
    }
  }

  console.log('[calendar-lookup] No matching calendar events found');
  return null;
}

/**
 * Enrich a meeting with calendar metadata
 *
 * Looks up calendar events around the meeting time and updates the meeting
 * record with attendees, meeting link, and description if found.
 *
 * This function is designed to be called async (fire-and-forget) so it
 * doesn't block the upload response.
 *
 * @param supabase - Supabase client with service role or user context
 * @param meetingId - Meeting ID to enrich
 * @param userId - User ID for calendar lookup
 * @param startTime - Meeting start time
 * @param endTime - Meeting end time (optional)
 */
export async function enrichMeetingWithCalendarData(
  supabase: SupabaseClient<Database>,
  meetingId: string,
  userId: string,
  startTime: string,
  endTime?: string | null
): Promise<void> {
  try {
    console.log(
      `[calendar-lookup] Enriching meeting ${meetingId} with calendar data`
    );

    const metadata = await findCalendarEventMetadata(
      supabase,
      userId,
      startTime,
      endTime
    );

    if (!metadata) {
      console.log(
        `[calendar-lookup] No calendar metadata found for meeting ${meetingId}`
      );
      return;
    }

    // Fetch current meeting to only update null fields
    // (don't overwrite data from desktop app)
    const { data: currentMeeting, error: fetchError } = await supabase
      .from('meetings')
      .select('attendees, meeting_link, description')
      .eq('id', meetingId)
      .single();

    if (fetchError || !currentMeeting) {
      console.error(
        `[calendar-lookup] Failed to fetch meeting ${meetingId}:`,
        fetchError
      );
      return;
    }

    // Build update object - only include fields that are currently null
    // Use Json type for attendees to satisfy Supabase types
    const updateData: {
      attendees?: Json;
      meeting_link?: string;
      description?: string;
    } = {};

    // Only update attendees if currently null and we have attendees from calendar
    if (
      !currentMeeting.attendees &&
      metadata.attendees &&
      metadata.attendees.length > 0
    ) {
      updateData.attendees = metadata.attendees as unknown as Json;
    }

    // Only update meeting_link if currently null
    if (!currentMeeting.meeting_link && metadata.meetingLink) {
      updateData.meeting_link = metadata.meetingLink;
    }

    // Only update description if currently null
    if (!currentMeeting.description && metadata.description) {
      updateData.description = metadata.description;
    }

    // Only update if we have something to add
    if (Object.keys(updateData).length === 0) {
      console.log(
        `[calendar-lookup] No enrichment data to add for meeting ${meetingId} (fields already populated)`
      );
      return;
    }

    console.log(`[calendar-lookup] Updating meeting ${meetingId} with:`, {
      hasAttendees: !!updateData.attendees,
      attendeeCount: metadata.attendees?.length || 0,
      hasMeetingLink: !!updateData.meeting_link,
      hasDescription: !!updateData.description,
    });

    const { error } = await supabase
      .from('meetings')
      .update(updateData)
      .eq('id', meetingId);

    if (error) {
      console.error(
        `[calendar-lookup] Failed to update meeting ${meetingId}:`,
        error
      );
    } else {
      console.log(
        `[calendar-lookup] Successfully enriched meeting ${meetingId}`
      );
    }
  } catch (error) {
    console.error(
      `[calendar-lookup] Error enriching meeting ${meetingId}:`,
      error
    );
  }
}
