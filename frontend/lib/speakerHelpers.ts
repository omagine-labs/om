/**
 * Speaker Helper Functions
 *
 * Utility functions for working with speaker records.
 */

interface SpeakerRecord {
  speaker_label: string;
  assigned_user_id: string | null;
  custom_speaker_name: string | null;
}

/**
 * Get the display name for a speaker
 * Priority: "You" (if userSpeakerLabel matches) > custom name > speaker label
 *
 * @param userSpeakerLabel - The speaker label from meetings.user_speaker_label (source of truth)
 */
export function getSpeakerDisplayName(
  speakerLabel: string,
  speakerRecords: SpeakerRecord[],
  userSpeakerLabel: string | null,
  currentUserName: string = 'You'
): string {
  // Check if this is the current user's speaker (source of truth: user_speaker_label)
  if (userSpeakerLabel && speakerLabel === userSpeakerLabel) {
    return currentUserName;
  }

  const speakerRecord = speakerRecords.find(
    (r) => r.speaker_label === speakerLabel
  );

  if (!speakerRecord) return speakerLabel.replace(/_/g, ' ');

  // Check for custom name
  if (speakerRecord.custom_speaker_name) {
    return speakerRecord.custom_speaker_name;
  }

  // Default to humanized speaker label (e.g., "SPEAKER_A" -> "Speaker A")
  return speakerLabel.replace(/_/g, ' ');
}

/**
 * Check if a speaker is assigned to the current user
 *
 * @param userSpeakerLabel - The speaker label from meetings.user_speaker_label (source of truth)
 */
export function isSpeakerAssignedToMe(
  speakerLabel: string,
  userSpeakerLabel: string | null
): boolean {
  return !!userSpeakerLabel && speakerLabel === userSpeakerLabel;
}

/**
 * Check if a speaker has any assignment (to current user via userSpeakerLabel, or custom name)
 *
 * @param userSpeakerLabel - The speaker label from meetings.user_speaker_label (source of truth)
 */
export function isSpeakerAssigned(
  speakerLabel: string,
  speakerRecords: SpeakerRecord[],
  userSpeakerLabel: string | null
): boolean {
  // Check if this is the current user's speaker
  if (userSpeakerLabel && speakerLabel === userSpeakerLabel) {
    return true;
  }

  // Check for custom name
  const speakerRecord = speakerRecords.find(
    (r) => r.speaker_label === speakerLabel
  );
  return !!speakerRecord && !!speakerRecord.custom_speaker_name;
}
