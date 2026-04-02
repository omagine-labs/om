/**
 * Core type definitions
 * These types are used across the entire application
 * They are platform-agnostic and will work in both Node.js and Deno
 */

// ============================================================================
// User Types
// ============================================================================

export interface User {
  id: string; // Matches Supabase Auth user ID
  email: string;
  full_name?: string;
  avatar_url?: string;
  first_login_completed: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Recording Types (Enhanced)
// ============================================================================

export type RecordingStatus =
  | 'uploading'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

export interface ProcessingJob {
  id: string;
  storage_path?: string; // Supabase Storage path
  original_filename?: string;
  status: RecordingStatus;
  processing_error?: string;
  python_job_id?: string;
  user_id: string;
  file_size_mb?: number;
  duration_seconds?: number;
  delete_after?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Transcript Types
// ============================================================================

export interface TranscriptSegment {
  start: number; // Start time in seconds
  end: number; // End time in seconds
  text: string; // What was said
  speaker: string; // Speaker identifier (e.g., "Speaker 1")
}

export interface Transcript {
  segments: TranscriptSegment[];
  fullText: string;
  durationSeconds: number;
  speakers: string[]; // List of unique speakers
}

export interface Speaker {
  id: string;
  name: string;
  totalTime: number;
  wordCount: number;
}

export interface TranscriptionResult {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
    speaker?: string;
  }>;
  speakers: Speaker[];
  durationSeconds: number;
  confidence?: number;
}

// ============================================================================
// Intelligence Types
// ============================================================================

export interface ActionItem {
  text: string;
  priority: 'high' | 'medium' | 'low';
}

export interface KeyTopic {
  topic: string;
  relevance: number; // 0-1 score
}

export interface Sentiment {
  overall: 'positive' | 'neutral' | 'negative';
  score: number; // -1 to 1
}

export interface SpeakerStats {
  speaker: string;
  durationSeconds: number;
  wordCount: number;
  percentage: number; // Percentage of total talk time
}

export interface CompanyValue {
  value: string;
  score: number; // 0-1
  examples: string[]; // Quotes from the transcript
}

export interface ResponseDelay {
  afterSpeaker: string;
  delaySeconds: number; // Positive = pause, Negative = interruption
  context?: string; // Optional context from AI
}

export interface CommunicationMetrics {
  talkTimePercentage: number; // User's talk time as %
  speakerBreakdown: SpeakerStats[]; // Breakdown per speaker
  averageResponseDelay: number; // Average in seconds
  responseDelays: ResponseDelay[]; // Individual delays
  interruptions: number; // Count of interruptions
  companyValuesAlignment: {
    overallAlignment: number; // 0-1
    values: CompanyValue[]; // Per-value scores
  };
  insights: string; // AI-generated insights
}

// ============================================================================
// Enhanced Analytics Types
// ============================================================================

export interface BehavioralInsights {
  face_detection?: {
    engagement_score: number;
    eye_contact_percentage: number;
    facial_expressions: {
      positive: number;
      neutral: number;
      negative: number;
    };
  };
  prosody_analysis?: {
    speaking_rate: string;
    pitch_variation: number;
    volume_consistency: number;
    pause_patterns: string;
  };
  gesture_analysis?: {
    hand_gestures: number;
    body_language_confidence: number;
  };
}

export interface EnhancedCommunicationMetrics extends CommunicationMetrics {
  clarity: number;
  empathy: number;
  confidence: number;
  collaboration: number;
  leadership: number;
  listening: number;
  engagement: number;
  assertiveness: number;
  adaptability: number;
  influence: number;
  authenticity: number;
  emotional_intelligence: number;
  decision_making: number;
  overall_score: number;
}

export interface MeetingAnalysis {
  id: string;
  job_id: string;
  user_id: string;
  summary?: string;
  transcript?: Transcript;
  speaker_stats?: SpeakerStats[];
  communication_metrics?: EnhancedCommunicationMetrics;
  behavioral_insights?: BehavioralInsights;
  created_at: string;
}

// ============================================================================
// Storage Adapter Interface
// ============================================================================

export interface StorageAdapter {
  saveFile(
    id: string,
    buffer: Uint8Array,
    contentType: string
  ): Promise<string>;
  getFile(path: string): Promise<Uint8Array>;
  getFileAsArrayBuffer(path: string): Promise<ArrayBuffer>;
  deleteFile(path: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
}

// ============================================================================
// Data Adapter Interface
// ============================================================================

export interface DataAdapter {
  // Users
  getUser(id: string): Promise<User | null>;
  saveUser(user: User): Promise<void>;
  updateUser(id: string, updates: Partial<User>): Promise<void>;

  // Processing Jobs
  getProcessingJobs(userId?: string): Promise<ProcessingJob[]>;
  getProcessingJob(id: string): Promise<ProcessingJob | null>;
  saveProcessingJob(job: ProcessingJob): Promise<void>;
  updateProcessingJob(
    id: string,
    updates: Partial<ProcessingJob>
  ): Promise<void>;
  deleteProcessingJob(id: string): Promise<void>;

  // Meeting Analysis
  getMeetingAnalysis(jobId: string): Promise<MeetingAnalysis | null>;
  getMeetingAnalysesByUser(userId: string): Promise<MeetingAnalysis[]>;
  saveMeetingAnalysis(analysis: MeetingAnalysis): Promise<void>;
  deleteMeetingAnalysis(id: string): Promise<void>;
}
