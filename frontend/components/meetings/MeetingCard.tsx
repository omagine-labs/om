'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import type { Tables } from '@/supabase/database.types';
import { Toast } from '@/components/ui/Toast';
import { getScoreColors } from '@/components/ui/ScoreSquare';
import AttendeeTooltip from './AttendeeTooltip';
import type { SpeakerAssignmentInfo, Meeting } from '@/hooks/useMeetingData';

type ProcessingJob = Tables<'processing_jobs'>;

interface MiniScoreSquareProps {
  score: number | null;
  title: string;
}

function MiniScoreSquare({ score, title }: MiniScoreSquareProps) {
  const colors = score !== null ? getScoreColors(score) : null;

  return (
    <div
      className={`group relative w-9 h-9 rounded-[6px] overflow-hidden hover:translate-y-[-1px] text-slate-800 text-sm font-bold flex items-center justify-center cursor-default transition-all ${colors?.bgColor ?? 'bg-slate-100'}`}
      title={title}
    >
      {score !== null && colors && (
        <div
          className={`absolute bottom-0 left-0 right-0 ${colors.fillColor} ${colors.hoverFillColor} rounded-b-[4px] animate-scoreFill`}
          style={{ height: `${(score / 10) * 100}%` }}
        />
      )}
      <span className="relative z-10">
        {score !== null ? Math.round(score) : '–'}
      </span>
    </div>
  );
}

interface MeetingCardProps {
  meeting: Meeting;
  recording?: ProcessingJob;
  speakerAssignments?: SpeakerAssignmentInfo[];
  currentUserId?: string | null;
  isUploading: boolean;
  uploadProgress: number;
  isDragOver: boolean;
  animationIndex?: number;
  onReprocess: (meeting: Meeting) => void;
  onDelete: (meeting: Meeting) => void;
  onIdentifySpeaker?: (meetingId: string) => void;
  onDragEnter?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
}

export default function MeetingCard({
  meeting,
  recording,
  speakerAssignments,
  currentUserId,
  isUploading,
  uploadProgress,
  isDragOver,
  animationIndex = 0,
  onReprocess,
  onDelete,
  onIdentifySpeaker,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
}: MeetingCardProps) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);

  // State for inline editing
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(meeting.title);
  const [isSaving, setIsSaving] = useState(false);

  // Toast state for error notifications
  const [toast, setToast] = useState<{
    message: string;
    type: 'error' | 'success';
  } | null>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Handle save title
  const handleSaveTitle = async () => {
    const trimmedTitle = editedTitle.trim();

    // Validation
    if (!trimmedTitle) {
      setToast({
        message: 'Meeting title cannot be empty',
        type: 'error',
      });
      setEditedTitle(meeting.title);
      setIsEditing(false);
      return;
    }

    if (trimmedTitle.length > 255) {
      setToast({
        message: 'Meeting title is too long (max 255 characters)',
        type: 'error',
      });
      setEditedTitle(meeting.title);
      setIsEditing(false);
      return;
    }

    // No change
    if (trimmedTitle === meeting.title) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('meetings')
        .update({ title: trimmedTitle })
        .eq('id', meeting.id);

      if (error) throw error;

      // Update local meeting object (optimistic update)
      meeting.title = trimmedTitle;
      setIsEditing(false);
      setToast({
        message: 'Meeting title updated',
        type: 'success',
      });
    } catch (error) {
      console.error('Failed to update meeting title:', error);
      setToast({
        message: 'Failed to update meeting title. Please try again.',
        type: 'error',
      });
      // Revert to original title
      setEditedTitle(meeting.title);
    } finally {
      setIsSaving(false);
      setIsEditing(false);
    }
  };

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditedTitle(meeting.title);
      setIsEditing(false);
    }
  };

  // Handle click on title to enter edit mode
  const handleTitleClick = () => {
    if (!isEditing && !isUploading) {
      setIsEditing(true);
    }
  };

  // Check if the current user needs to assign themselves to a speaker
  // Only show indicator when: recording is completed, there are speakers, and user hasn't assigned themselves
  const hasCompletedRecording = recording?.status === 'completed';
  const hasSpeakers = speakerAssignments && speakerAssignments.length > 0;

  // user_speaker_label is the single source of truth for identifying the user's speaker
  const userSpeakerLabel = meeting.user_speaker_label;

  // Show "Identify Yourself" only if speaker not yet identified
  const needsSpeakerAssignment =
    hasCompletedRecording && hasSpeakers && !userSpeakerLabel;

  // Get user's pillar scores from their identified speaker
  let userScores = null;
  if (userSpeakerLabel && speakerAssignments) {
    const userSpeaker = speakerAssignments.find(
      (sa) => sa.speakerLabel === userSpeakerLabel
    );
    if (userSpeaker) {
      userScores = {
        clarity: userSpeaker.clarityScore,
        confidence: userSpeaker.confidenceScore,
        attunement: userSpeaker.attunementScore,
      };
    }
  }

  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`relative overflow-hidden bg-white p-5 rounded-xl transition-all outline-1 outline-stone-500/5 duration-200 hover:shadow-sm hover:-translate-y-0.5 animate-fadeInUp ${
        isDragOver ? 'ring-2 ring-teal-500 bg-teal-50' : ''
      }`}
      style={{ animationDelay: `${animationIndex * 50}ms` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={handleKeyDown}
                disabled={isSaving}
                className="font-semibold text-gray-900 border border-teal-500 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
                maxLength={255}
              />
            ) : (
              <h4
                className="text-lg font-semibold -ml-1 text-slate-700 hover:cursor-text hover:bg-gray-100 px-1 rounded transition-colors w-fit"
                onClick={handleTitleClick}
                title="Click to edit title"
              >
                {meeting.title}
              </h4>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1 cursor-default">
            {new Date(meeting.start_time).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}{' '}
            {meeting.end_time && (
              <>
                -{' '}
                {new Date(meeting.end_time).toLocaleTimeString(undefined, {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </>
            )}
          </p>
          {/* Meeting metadata row */}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {/* Attendees display with hover tooltip */}
            {(meeting.attendees || speakerAssignments) && (
              <AttendeeTooltip
                attendees={meeting.attendees}
                speakerAssignments={speakerAssignments}
                currentUserId={currentUserId}
              />
            )}
          </div>
          {isUploading && (
            <div className="mt-3">
              <div className="w-48">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-teal-700 font-medium">
                    Uploading...
                  </span>
                  <span className="text-xs text-teal-600">
                    {uploadProgress}%
                  </span>
                </div>
                <div className="w-full bg-teal-100 rounded-full h-2">
                  <div
                    className="bg-teal-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="ml-4 flex items-center gap-3">
          {/* Score preview - shown when completed AND user has identified themselves */}
          {!isUploading && recording?.status === 'completed' && userScores && (
            <div className="flex items-center gap-1.5">
              <MiniScoreSquare score={userScores.clarity} title="Clarity" />
              <MiniScoreSquare
                score={userScores.confidence}
                title="Confidence"
              />
              <MiniScoreSquare
                score={userScores.attunement}
                title={
                  userScores.attunement !== null
                    ? 'Attunement'
                    : 'Attunement (N/A for solo recordings)'
                }
              />
            </div>
          )}

          {/* Status chip - shown for processing/failed states, or completed but waiting for speaker data */}
          {!isUploading &&
            (recording?.status === 'pending' ||
              recording?.status === 'processing' ||
              (recording?.status === 'completed' && !hasSpeakers)) && (
              <span className="inline-flex items-center px-2.5 py-1 text-sm font-medium rounded-full bg-slate-100 text-slate-600">
                Processing...
              </span>
            )}
          {!isUploading && recording?.status === 'failed' && (
            <span className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full bg-orange-100 text-orange-950">
              Processing failed
            </span>
          )}

          {/* Vertical divider */}
          <div className="h-6 w-px bg-slate-200" />

          {/* Delete button - ghost style */}
          <button
            onClick={() => onDelete(meeting)}
            className="p-2.5 text-slate-400 hover:text-orange-500 bg-transparent hover:bg-red-50 active:bg-red-100 rounded-lg transition-colors"
            title="Delete meeting and all recordings"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>

          {/* Action button - Identify Yourself, View Analysis, or Reprocess */}
          {!isUploading &&
            recording?.status === 'completed' &&
            hasSpeakers &&
            needsSpeakerAssignment && (
              <button
                onClick={() => onIdentifySpeaker?.(meeting.id)}
                className="px-5 py-2.5 text-white text-sm rounded-lg font-medium transition-colors whitespace-nowrap bg-amber-500 hover:bg-amber-600 active:bg-amber-700"
              >
                Identify Yourself
              </button>
            )}
          {!isUploading &&
            recording?.status === 'completed' &&
            hasSpeakers &&
            !needsSpeakerAssignment && (
              <Link
                href={`/meetings/${meeting.id}/analysis`}
                className="px-5 py-2.5 text-white text-sm rounded-lg font-medium transition-colors whitespace-nowrap bg-teal-600/80 hover:bg-teal-600 active:bg-teal-700"
              >
                View Analysis
              </Link>
            )}
          {!isUploading &&
            recording?.status === 'failed' &&
            (meeting.audio_storage_path ? (
              <button
                onClick={() => onReprocess(meeting)}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm rounded-lg font-medium transition-colors whitespace-nowrap"
              >
                Reprocess
              </button>
            ) : (
              <span className="text-sm text-gray-500">Recording expired</span>
            ))}
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
