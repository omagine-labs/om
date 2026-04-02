/**
 * Meeting-related types
 */

/**
 * Off-record period structure sent by desktop app
 * Tracks pauses in meeting recordings where user went off-record
 */
export interface OffRecordPeriod {
  /** Timestamp in stitched audio where placeholder starts (seconds) */
  placeholderStart: number;
  /** Timestamp in stitched audio where placeholder ends (seconds) */
  placeholderEnd: number;
  /** Real duration the user was off-record (seconds) */
  actualDuration: number;
}
