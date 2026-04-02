/**
 * TranscriptView Component
 *
 * Displays meeting transcripts with speaker identification and assignment controls.
 */

'use client';

import { useState, useMemo } from 'react';
import { formatTime, formatDuration } from '@/lib/formatters';
import type { OffRecordPeriod } from '@/types/meetings';

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker: string;
  confidence?: number;
}

interface SpeakerRecord {
  speaker_label: string;
  assigned_user_id: string | null;
  custom_speaker_name: string | null;
}

interface Attendee {
  email: string;
  displayName?: string | null;
  isOrganizer: boolean;
}

interface TranscriptViewProps {
  fullTranscript?: {
    segments: TranscriptSegment[];
    speakers: string[];
  };
  offRecordPeriods?: OffRecordPeriod[];
  speakerRecords?: SpeakerRecord[];
  attendees?: Attendee[];
  isAssignedToMe: (speaker: string) => boolean;
  getDisplayName: (speaker: string) => string;
  isAssigned: (speaker: string) => boolean;
  editingSpeaker: string | null;
  isAssigning: boolean;
  customName: string;
  setEditingSpeaker: (speaker: string | null) => void;
  setCustomName: (name: string) => void;
  handleAssignSpeaker: (speaker: string) => void;
  handleAssignCustomName: (speaker: string, name: string) => void;
  handleUnassignSpeaker: (speaker: string) => void;
}

export function TranscriptView({
  fullTranscript,
  offRecordPeriods,
  speakerRecords: _speakerRecords,
  attendees,
  isAssignedToMe,
  getDisplayName,
  isAssigned,
  editingSpeaker,
  isAssigning,
  customName,
  setEditingSpeaker,
  setCustomName,
  handleAssignSpeaker,
  handleAssignCustomName,
  handleUnassignSpeaker: _handleUnassignSpeaker,
}: TranscriptViewProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Get unique speakers from transcript that are NOT yet assigned
  const unassignedSpeakers = useMemo(() => {
    if (!fullTranscript?.speakers) return [];
    return fullTranscript.speakers.filter(
      (speakerLabel) => !isAssigned(speakerLabel)
    );
  }, [fullTranscript, isAssigned]);

  // Get attendee names for dropdown
  const attendeeNames = useMemo(() => {
    if (!attendees) return [];
    return attendees
      .map((a) => a.displayName || a.email.split('@')[0])
      .filter((name) => name.length > 0);
  }, [attendees]);

  const handleSelectAttendee = (speakerLabel: string, name: string) => {
    handleAssignCustomName(speakerLabel, name);
    setEditingSpeaker(null);
    setCustomName('');
    setShowCustomInput(false);
  };

  const handleStartEditing = (speakerLabel: string) => {
    setEditingSpeaker(speakerLabel);
    setCustomName('');
    setShowCustomInput(false);
  };

  const handleCancel = () => {
    setEditingSpeaker(null);
    setCustomName('');
    setShowCustomInput(false);
  };

  return (
    <div className="space-y-4">
      {/* Speaker Assignment Section - only show when there are unassigned speakers */}
      {unassignedSpeakers.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">
            Identify Speakers
          </h4>
          <div className="space-y-3">
            {unassignedSpeakers.map((speakerLabel) => {
              const displayName = getDisplayName(speakerLabel);
              const isEditingThis = editingSpeaker === speakerLabel;

              return (
                <div
                  key={speakerLabel}
                  className="flex items-center justify-between py-2 px-3 bg-white rounded-md border border-gray-100"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-sm font-medium text-gray-900">
                      {displayName}
                    </span>
                  </div>

                  {/* Assignment Controls */}
                  {!isEditingThis && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAssignSpeaker(speakerLabel)}
                        disabled={isAssigning}
                        className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        This is me
                      </button>
                      <button
                        onClick={() => handleStartEditing(speakerLabel)}
                        disabled={isAssigning}
                        className="text-xs px-3 py-1.5 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50"
                      >
                        Assign name
                      </button>
                    </div>
                  )}

                  {/* Editing UI */}
                  {isEditingThis && (
                    <div className="flex-1 ml-4">
                      {!showCustomInput && attendeeNames.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {attendeeNames.map((name, idx) => (
                              <button
                                key={idx}
                                onClick={() =>
                                  handleSelectAttendee(speakerLabel, name)
                                }
                                disabled={isAssigning}
                                className="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors disabled:opacity-50"
                              >
                                {name}
                              </button>
                            ))}
                            <button
                              onClick={() => setShowCustomInput(true)}
                              className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                            >
                              Other...
                            </button>
                          </div>
                          <button
                            onClick={handleCancel}
                            className="text-xs text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && customName.trim()) {
                                handleAssignCustomName(
                                  speakerLabel,
                                  customName
                                );
                                handleCancel();
                              } else if (e.key === 'Escape') {
                                handleCancel();
                              }
                            }}
                            placeholder="Enter name"
                            className="flex-1 text-xs px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            autoFocus
                          />
                          <button
                            onClick={() => {
                              if (customName.trim()) {
                                handleAssignCustomName(
                                  speakerLabel,
                                  customName
                                );
                                handleCancel();
                              }
                            }}
                            disabled={!customName.trim() || isAssigning}
                            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancel}
                            className="text-xs px-3 py-1.5 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Transcript */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Full Transcript
        </h3>
        {fullTranscript &&
          fullTranscript.segments.map((segment, idx) => {
            const isMe = isAssignedToMe(segment.speaker);
            const nextSegment = fullTranscript.segments[idx + 1];

            // Check if there's an off-record period between this segment and the next
            let offRecordGap: {
              start: number;
              end: number;
              duration: number;
            } | null = null;
            if (offRecordPeriods && nextSegment) {
              const gap = offRecordPeriods.find(
                (p) =>
                  p.placeholderStart >= segment.end &&
                  p.placeholderEnd <= nextSegment.start
              );
              if (gap) {
                offRecordGap = {
                  start: gap.placeholderStart,
                  end: gap.placeholderEnd,
                  duration: gap.actualDuration,
                };
              }
            }

            return (
              <div key={idx}>
                {/* Transcript segment */}
                <div
                  className={`border-l-4 pl-4 py-2 ${
                    isMe ? 'border-green-500 bg-green-50' : 'border-blue-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-sm font-semibold ${
                        isMe ? 'text-green-700' : 'text-blue-600'
                      }`}
                    >
                      {getDisplayName(segment.speaker)}
                      {isMe && (
                        <span className="ml-2 text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full">
                          You
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatTime(segment.start)} - {formatTime(segment.end)}
                    </span>
                  </div>
                  <p className="text-gray-700">{segment.text}</p>
                </div>

                {/* Off-record period indicator */}
                {offRecordGap && (
                  <div className="my-4 flex items-center gap-3 px-4">
                    <div className="flex-1 border-t-2 border-dashed border-amber-300"></div>
                    <div className="bg-amber-100 border border-amber-300 rounded-md px-3 py-1.5 text-center">
                      <span className="text-xs font-medium text-amber-800">
                        ⏸️ Recording paused (
                        {formatDuration(offRecordGap.duration)})
                      </span>
                    </div>
                    <div className="flex-1 border-t-2 border-dashed border-amber-300"></div>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
