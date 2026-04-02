/**
 * MeetingCard Component Tests
 *
 * Unit tests for the MeetingCard component, focusing on the
 * display of meeting states and Reprocess button for failed meetings.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MeetingCard from '@/components/meetings/MeetingCard';
import type { Tables } from '@/supabase/database.types';
import type { SpeakerAssignmentInfo } from '@/hooks/useMeetingData';

// Mock Supabase client
jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      update: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  })),
}));

type Meeting = Tables<'meetings'>;
type ProcessingJob = Tables<'processing_jobs'>;

// Mock meeting data factory
const createMockMeeting = (overrides?: Partial<Meeting>): Meeting => ({
  id: 'meeting-123',
  user_id: 'user-123',
  title: 'Test Meeting',
  start_time: '2025-11-11T10:00:00Z',
  end_time: '2025-11-11T11:00:00Z',
  description: null,
  meeting_link: null,
  created_at: '2025-11-11T09:00:00Z',
  updated_at: '2025-11-11T09:00:00Z',
  meeting_type: 'unknown',
  participant_count: null,
  user_role: 'unknown',
  recording_available_until: null,
  recording_filename: null,
  audio_storage_path: null,
  recording_size_mb: null,
  recording_duration_seconds: null,
  attendees: null,
  ...overrides,
});

// Mock processing job factory
const createMockJob = (overrides?: Partial<ProcessingJob>): ProcessingJob => ({
  id: 'job-123',
  meeting_id: 'meeting-123',
  status: 'pending',
  processing_error: null,
  processing_type: 'full',
  python_job_id: null,
  triggered_by: 'user',
  created_at: '2025-11-11T09:00:00Z',
  updated_at: '2025-11-11T09:00:00Z',
  ...overrides,
});

// Mock speaker assignment factory
const createMockSpeakerAssignment = (
  overrides?: Partial<SpeakerAssignmentInfo>
): SpeakerAssignmentInfo => ({
  speakerLabel: 'Speaker A',
  assignedUserId: null,
  customSpeakerName: null,
  clarityScore: null,
  confidenceScore: null,
  attunementScore: null,
  ...overrides,
});

describe('MeetingCard', () => {
  const mockOnReprocess = jest.fn();
  const mockOnDelete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Failed Processing State', () => {
    it('should show Reprocess button when recording exists in storage', () => {
      const meeting = createMockMeeting({
        audio_storage_path: 'user-123/2025/11/recording.mov',
        recording_filename: 'recording.mov',
      });
      const job = createMockJob({
        status: 'failed',
        processing_error: 'Test error',
      });

      render(
        <MeetingCard
          meeting={meeting}
          recording={job}
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('Processing failed')).toBeInTheDocument();
      expect(screen.getByText('Reprocess')).toBeInTheDocument();
    });

    it('should show Recording expired when no recording in storage', () => {
      const meeting = createMockMeeting({
        audio_storage_path: null,
        recording_filename: null,
      });
      const job = createMockJob({
        status: 'failed',
        processing_error: 'Test error',
      });

      render(
        <MeetingCard
          meeting={meeting}
          recording={job}
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('Processing failed')).toBeInTheDocument();
      expect(screen.getByText('Recording expired')).toBeInTheDocument();
      expect(screen.queryByText('Reprocess')).not.toBeInTheDocument();
    });

    it('should call onReprocess when Reprocess button is clicked', () => {
      const meeting = createMockMeeting({
        audio_storage_path: 'user-123/2025/11/recording.mov',
      });
      const job = createMockJob({ status: 'failed' });

      render(
        <MeetingCard
          meeting={meeting}
          recording={job}
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      const reprocessButton = screen.getByText('Reprocess');
      fireEvent.click(reprocessButton);

      expect(mockOnReprocess).toHaveBeenCalledTimes(1);
      expect(mockOnReprocess).toHaveBeenCalledWith(meeting);
    });

    it('should style Reprocess button with teal colors', () => {
      const meeting = createMockMeeting({
        audio_storage_path: 'user-123/2025/11/recording.mov',
      });
      const job = createMockJob({ status: 'failed' });

      render(
        <MeetingCard
          meeting={meeting}
          recording={job}
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      const reprocessButton = screen.getByText('Reprocess');
      expect(reprocessButton).toHaveClass('bg-teal-600');
      expect(reprocessButton).toHaveClass('hover:bg-teal-700');
    });
  });

  describe('Other Processing States', () => {
    it('should show Identify Yourself button when completed but user not assigned', () => {
      const meeting = createMockMeeting({
        recording_filename: 'test.mov',
      });
      const job = createMockJob({ status: 'completed' });
      const speakerAssignments = [createMockSpeakerAssignment()];
      const mockOnIdentifySpeaker = jest.fn();

      render(
        <MeetingCard
          meeting={meeting}
          recording={job}
          speakerAssignments={speakerAssignments}
          currentUserId="user-123"
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
          onIdentifySpeaker={mockOnIdentifySpeaker}
        />
      );

      const identifyButton = screen.getByText('Identify Yourself');
      expect(identifyButton).toBeInTheDocument();
      expect(identifyButton.tagName).toBe('BUTTON');

      // Click the button and verify the callback is called with meeting ID
      identifyButton.click();
      expect(mockOnIdentifySpeaker).toHaveBeenCalledWith('meeting-123');
    });

    it('should show View Analysis when completed and user speaker identified', () => {
      const meeting = createMockMeeting({
        recording_filename: 'test.mov',
        user_speaker_label: 'Speaker A',
      });
      const job = createMockJob({ status: 'completed' });
      const speakerAssignments = [
        createMockSpeakerAssignment({
          speakerLabel: 'Speaker A',
          clarityScore: 7.5,
          confidenceScore: 8.2,
          attunementScore: 6.8,
        }),
      ];

      render(
        <MeetingCard
          meeting={meeting}
          recording={job}
          speakerAssignments={speakerAssignments}
          currentUserId="user-123"
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      const viewLink = screen.getByText('View Analysis');
      expect(viewLink).toBeInTheDocument();
      expect(viewLink.closest('a')).toHaveAttribute(
        'href',
        '/meetings/meeting-123/analysis'
      );
    });

    it('should show Processing status when processing', () => {
      const meeting = createMockMeeting();
      const job = createMockJob({ status: 'processing' });

      render(
        <MeetingCard
          meeting={meeting}
          recording={job}
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('Processing...')).toBeInTheDocument();
      expect(screen.queryByText('Reprocess')).not.toBeInTheDocument();
    });

    it('should show Processing status when completed but no speaker data yet', () => {
      const meeting = createMockMeeting();
      const job = createMockJob({ status: 'completed' });
      // No speakerAssignments provided

      render(
        <MeetingCard
          meeting={meeting}
          recording={job}
          speakerAssignments={undefined}
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      // Should still show "Processing..." until speaker data loads
      expect(screen.getByText('Processing...')).toBeInTheDocument();
      // Button should not appear yet
      expect(screen.queryByText('View Analysis')).not.toBeInTheDocument();
      expect(screen.queryByText('Identify Yourself')).not.toBeInTheDocument();
    });

    it('should show Processing status when completed but speaker array is empty', () => {
      const meeting = createMockMeeting();
      const job = createMockJob({ status: 'completed' });
      const speakerAssignments: SpeakerAssignmentInfo[] = [];

      render(
        <MeetingCard
          meeting={meeting}
          recording={job}
          speakerAssignments={speakerAssignments}
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      // Should still show "Processing..." until speaker data loads
      expect(screen.getByText('Processing...')).toBeInTheDocument();
      // Button should not appear yet
      expect(screen.queryByText('View Analysis')).not.toBeInTheDocument();
      expect(screen.queryByText('Identify Yourself')).not.toBeInTheDocument();
    });

    it('should hide Processing and show button when completed with speaker data', () => {
      const meeting = createMockMeeting();
      const job = createMockJob({ status: 'completed' });
      const speakerAssignments = [createMockSpeakerAssignment()];

      render(
        <MeetingCard
          meeting={meeting}
          recording={job}
          speakerAssignments={speakerAssignments}
          currentUserId="user-123"
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      // Processing should be hidden now that speaker data is available
      expect(screen.queryByText('Processing...')).not.toBeInTheDocument();
      // Button should appear
      expect(screen.getByText('Identify Yourself')).toBeInTheDocument();
    });

    it('should not show any action buttons when no recording', () => {
      const meeting = createMockMeeting();

      render(
        <MeetingCard
          meeting={meeting}
          recording={undefined}
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.queryByText('Reprocess')).not.toBeInTheDocument();
      expect(screen.queryByText('View Analysis')).not.toBeInTheDocument();
      expect(screen.queryByText('Identify Yourself')).not.toBeInTheDocument();
    });
  });

  describe('Pillar Score Preview', () => {
    it('should show pillar scores when user speaker is identified', () => {
      // user_speaker_label is set to Speaker A, so we should see Speaker A's scores
      const meeting = createMockMeeting({
        user_speaker_label: 'Speaker A',
      });
      const job = createMockJob({ status: 'completed' });
      const speakerAssignments = [
        createMockSpeakerAssignment({
          speakerLabel: 'Speaker A',
          clarityScore: 7.5,
          confidenceScore: 8.2,
          attunementScore: 6.8,
        }),
      ];

      render(
        <MeetingCard
          meeting={meeting}
          recording={job}
          speakerAssignments={speakerAssignments}
          currentUserId="user-123"
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      // Check that scores are displayed (single digit, rounded)
      // Use title attribute to distinguish between scores
      expect(screen.getByTitle('Clarity')).toHaveTextContent('8'); // 7.5 rounds to 8
      expect(screen.getByTitle('Confidence')).toHaveTextContent('8'); // 8.2 rounds to 8
      expect(screen.getByTitle('Attunement')).toHaveTextContent('7'); // 6.8 rounds to 7
    });

    it('should show pillar scores from identified speaker in multi-speaker meeting', () => {
      const meeting = createMockMeeting({
        user_speaker_label: 'Speaker B',
      });
      const job = createMockJob({ status: 'completed' });
      const speakerAssignments = [
        createMockSpeakerAssignment({
          speakerLabel: 'Speaker A',
          clarityScore: 5.0,
          confidenceScore: 6.0,
          attunementScore: 5.5,
        }),
        createMockSpeakerAssignment({
          speakerLabel: 'Speaker B',
          clarityScore: 8.3,
          confidenceScore: 7.8,
          attunementScore: 9.1,
        }),
      ];

      render(
        <MeetingCard
          meeting={meeting}
          recording={job}
          speakerAssignments={speakerAssignments}
          currentUserId="user-123"
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      // Should show scores from identified Speaker B
      expect(screen.getByTitle('Clarity')).toHaveTextContent('8'); // 8.3 rounds to 8
      expect(screen.getByTitle('Confidence')).toHaveTextContent('8'); // 7.8 rounds to 8
      expect(screen.getByTitle('Attunement')).toHaveTextContent('9'); // 9.1 rounds to 9
    });

    it('should show scores from the speaker identified by user_speaker_label', () => {
      // user_speaker_label determines which speaker's scores to show
      // (manual assignment updates user_speaker_label to match)
      const meeting = createMockMeeting({
        user_speaker_label: 'Speaker A',
      });
      const job = createMockJob({ status: 'completed' });
      const speakerAssignments = [
        createMockSpeakerAssignment({
          speakerLabel: 'Speaker A',
          clarityScore: 6.0,
          confidenceScore: 7.0,
          attunementScore: 5.5,
        }),
        createMockSpeakerAssignment({
          speakerLabel: 'Speaker B',
          clarityScore: 8.3,
          confidenceScore: 7.8,
          attunementScore: 9.1,
        }),
      ];

      render(
        <MeetingCard
          meeting={meeting}
          recording={job}
          speakerAssignments={speakerAssignments}
          currentUserId="user-123"
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      // Should show scores from Speaker A (as identified by user_speaker_label)
      expect(screen.getByTitle('Clarity')).toHaveTextContent('6');
      expect(screen.getByTitle('Confidence')).toHaveTextContent('7');
      expect(screen.getByTitle('Attunement')).toHaveTextContent('6'); // 5.5 rounds to 6
    });

    it('should not show scores when user not assigned', () => {
      const meeting = createMockMeeting();
      const job = createMockJob({ status: 'completed' });
      const speakerAssignments = [
        createMockSpeakerAssignment({
          assignedUserId: 'other-user',
          clarityScore: 7.5,
          confidenceScore: 8.2,
          attunementScore: 6.8,
        }),
      ];

      render(
        <MeetingCard
          meeting={meeting}
          recording={job}
          speakerAssignments={speakerAssignments}
          currentUserId="user-123"
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      // Scores should not be visible (they belong to another user)
      expect(screen.queryByTitle('Clarity')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Confidence')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Attunement')).not.toBeInTheDocument();
    });

    it('should not show scores when processing', () => {
      const meeting = createMockMeeting({
        user_speaker_label: 'Speaker A',
      });
      const job = createMockJob({ status: 'processing' });
      const speakerAssignments = [
        createMockSpeakerAssignment({
          speakerLabel: 'Speaker A',
          clarityScore: 7.5,
          confidenceScore: 8.2,
          attunementScore: 6.8,
        }),
      ];

      render(
        <MeetingCard
          meeting={meeting}
          recording={job}
          speakerAssignments={speakerAssignments}
          currentUserId="user-123"
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      // Scores should not be visible during processing
      expect(screen.queryByTitle('Clarity')).not.toBeInTheDocument();
    });

    it('should handle null scores gracefully', () => {
      const meeting = createMockMeeting({
        user_speaker_label: 'Speaker A',
      });
      const job = createMockJob({ status: 'completed' });
      const speakerAssignments = [
        createMockSpeakerAssignment({
          speakerLabel: 'Speaker A',
          clarityScore: 7.5,
          confidenceScore: null,
          attunementScore: 6.8,
        }),
      ];

      render(
        <MeetingCard
          meeting={meeting}
          recording={job}
          speakerAssignments={speakerAssignments}
          currentUserId="user-123"
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      // Non-null scores should be displayed (single digit, rounded)
      expect(screen.getByTitle('Clarity')).toHaveTextContent('8'); // 7.5 rounds to 8
      expect(screen.getByTitle('Attunement')).toHaveTextContent('7'); // 6.8 rounds to 7
      // Null scores should display – instead of being hidden
      expect(screen.getByTitle('Confidence')).toHaveTextContent('–');
    });
  });

  describe('Upload Progress', () => {
    it('should show upload progress when uploading', () => {
      const meeting = createMockMeeting();

      render(
        <MeetingCard
          meeting={meeting}
          recording={undefined}
          isUploading={true}
          uploadProgress={45}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('Uploading...')).toBeInTheDocument();
      expect(screen.getByText('45%')).toBeInTheDocument();
    });

    it('should hide buttons when uploading', () => {
      const meeting = createMockMeeting();
      const job = createMockJob({ status: 'failed' });

      render(
        <MeetingCard
          meeting={meeting}
          recording={job}
          isUploading={true}
          uploadProgress={75}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.queryByText('Reprocess')).not.toBeInTheDocument();
      expect(screen.queryByText('View Analysis')).not.toBeInTheDocument();
    });
  });

  describe('Meeting Display', () => {
    it('should display meeting title', () => {
      const meeting = createMockMeeting({ title: 'My Important Meeting' });

      render(
        <MeetingCard
          meeting={meeting}
          recording={undefined}
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('My Important Meeting')).toBeInTheDocument();
    });

    it('should highlight card when drag over', () => {
      const meeting = createMockMeeting();

      const { container } = render(
        <MeetingCard
          meeting={meeting}
          recording={undefined}
          isUploading={false}
          uploadProgress={0}
          isDragOver={true}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('ring-2');
      expect(card).toHaveClass('ring-teal-500');
      expect(card).toHaveClass('bg-teal-50');
    });
  });

  describe('Delete Functionality', () => {
    it('should always show delete button', () => {
      const meeting = createMockMeeting();

      render(
        <MeetingCard
          meeting={meeting}
          recording={undefined}
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      const deleteButton = screen.getByTitle(
        'Delete meeting and all recordings'
      );
      expect(deleteButton).toBeInTheDocument();
    });

    it('should call onDelete when delete button is clicked', () => {
      const meeting = createMockMeeting({ title: 'Meeting to Delete' });

      render(
        <MeetingCard
          meeting={meeting}
          recording={undefined}
          isUploading={false}
          uploadProgress={0}
          isDragOver={false}
          onReprocess={mockOnReprocess}
          onDelete={mockOnDelete}
        />
      );

      const deleteButton = screen.getByTitle(
        'Delete meeting and all recordings'
      );
      fireEvent.click(deleteButton);

      expect(mockOnDelete).toHaveBeenCalledTimes(1);
      expect(mockOnDelete).toHaveBeenCalledWith(meeting);
    });
  });
});
