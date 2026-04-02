/**
 * Server-side Intercom API client for updating user attributes and triggering events
 * Used in API routes and webhooks (not browser-side)
 *
 * Uses Intercom REST API v2.0: https://developers.intercom.com/docs/references/rest-api/
 */

import type {
  IntercomUpdateResponse,
  IntercomUserAttributes,
  IntercomOperationResult,
} from '@/types/intercom';

/**
 * Update Intercom user/contact with custom attributes
 *
 * @param userId - User ID (matches Supabase user ID)
 * @param attributes - Custom attributes to update
 * @returns Success status
 */
export async function updateIntercomUser(
  userId: string,
  attributes: IntercomUserAttributes
): Promise<IntercomOperationResult> {
  const apiToken = process.env.INTERCOM_API_TOKEN;

  if (!apiToken) {
    console.error('[Intercom API] INTERCOM_API_TOKEN not configured');
    return { success: false, error: 'API token not configured' };
  }

  try {
    // Search for the contact by user_id first
    const searchResponse = await fetch(
      'https://api.intercom.io/contacts/search',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          'Intercom-Version': '2.11',
        },
        body: JSON.stringify({
          query: {
            field: 'user_id',
            operator: '=',
            value: userId,
          },
        }),
      }
    );

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('[Intercom API] Search failed:', errorText);
      return {
        success: false,
        error: `Search failed: ${searchResponse.status}`,
      };
    }

    const searchData = await searchResponse.json();

    if (!searchData.data || searchData.data.length === 0) {
      console.warn('[Intercom API] User not found in Intercom:', userId);
      // User hasn't been identified in Intercom yet - this is OK during onboarding
      return { success: true }; // Return success to not block webhook processing
    }

    const contactId = searchData.data[0].id;

    // Update the contact with new attributes
    const updateResponse = await fetch(
      `https://api.intercom.io/contacts/${contactId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          'Intercom-Version': '2.11',
        },
        body: JSON.stringify({
          custom_attributes: attributes,
        }),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('[Intercom API] Update failed:', errorText);
      return {
        success: false,
        error: `Update failed: ${updateResponse.status}`,
      };
    }

    const updateData: IntercomUpdateResponse = await updateResponse.json();

    if (process.env.NODE_ENV === 'development') {
      console.log('[Intercom API] User updated successfully:', {
        userId,
        contactId: updateData.id,
        attributes,
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error('[Intercom API] Exception updating user:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Track a custom event in Intercom
 *
 * @param userId - User ID (matches Supabase user ID)
 * @param eventName - Event name
 * @param metadata - Event metadata
 * @returns Success status
 */
export async function trackIntercomEvent(
  userId: string,
  eventName: string,
  metadata?: Record<string, any>
): Promise<IntercomOperationResult> {
  const apiToken = process.env.INTERCOM_API_TOKEN;

  if (!apiToken) {
    console.error('[Intercom API] INTERCOM_API_TOKEN not configured');
    return { success: false, error: 'API token not configured' };
  }

  try {
    const response = await fetch('https://api.intercom.io/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'Intercom-Version': '2.11',
      },
      body: JSON.stringify({
        event_name: eventName,
        user_id: userId,
        created_at: Math.floor(Date.now() / 1000),
        metadata: metadata || {},
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Intercom API] Event tracking failed:', errorText);
      return {
        success: false,
        error: `Event tracking failed: ${response.status}`,
      };
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[Intercom API] Event tracked successfully:', {
        userId,
        eventName,
        metadata,
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error('[Intercom API] Exception tracking event:', error);
    return { success: false, error: error.message };
  }
}
