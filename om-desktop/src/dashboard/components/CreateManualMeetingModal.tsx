'use client';

import {
  useState,
  useRef,
  DragEvent,
  ChangeEvent,
  useEffect,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import {
  validateFile,
  formatFileSize,
  FORMAT_DESCRIPTIONS,
  MAX_FILE_SIZE_MB,
} from '@/lib/upload-constants';
import type { Tables } from '@/types/database';

type Meeting = Tables<'meetings'>;

interface ManualMeeting {
  title: string;
  datetime: string;
  endDatetime?: string;
  description?: string;
}

interface CreateManualMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (meeting: ManualMeeting, file: File) => void;
  /** Optional: Pass existing meeting to pre-populate and allow editing */
  existingMeeting?: Meeting;
}

export default function CreateManualMeetingModal({
  isOpen,
  onClose,
  onCreate,
  existingMeeting,
}: CreateManualMeetingModalProps) {
  // Get today's date in the format needed for datetime-local input
  const getTodayDateTime = () => {
    const now = new Date();
    // Format: YYYY-MM-DDTHH:MM
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Convert ISO timestamp to datetime-local format
  const formatDatetimeLocal = (isoString: string) => {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Get datetime 1 hour after the given datetime string
  const getOneHourAfter = useCallback((datetimeStr: string) => {
    const date = new Date(datetimeStr);
    date.setHours(date.getHours() + 1);
    return formatDatetimeLocal(date.toISOString());
  }, []);

  const initialDatetime = getTodayDateTime();
  const [title, setTitle] = useState('');
  const [datetime, setDatetime] = useState(initialDatetime);
  const [endDatetime, setEndDatetime] = useState(
    getOneHourAfter(initialDatetime)
  );
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [meetingDurationMs, setMeetingDurationMs] = useState<number | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-populate form when existingMeeting is provided
  useEffect(() => {
    if (existingMeeting && isOpen) {
      setTitle(existingMeeting.title);
      const startTime = formatDatetimeLocal(existingMeeting.start_time);
      setDatetime(startTime);

      // Calculate duration if end_time exists
      if (existingMeeting.end_time) {
        const duration =
          new Date(existingMeeting.end_time).getTime() -
          new Date(existingMeeting.start_time).getTime();
        setMeetingDurationMs(duration);
        setEndDatetime(formatDatetimeLocal(existingMeeting.end_time));
      } else {
        setMeetingDurationMs(null);
        setEndDatetime(getOneHourAfter(startTime));
      }
      setDescription('');
    } else if (!existingMeeting && isOpen) {
      // Reset to defaults when creating new
      setTitle('');
      const now = getTodayDateTime();
      setDatetime(now);
      setEndDatetime(getOneHourAfter(now));
      setMeetingDurationMs(null);
      setDescription('');
    }
  }, [existingMeeting, isOpen, getOneHourAfter]);

  // Auto-update end time when start time changes (if we have a duration from the file)
  useEffect(() => {
    if (meetingDurationMs !== null && datetime) {
      const startDate = new Date(datetime);
      const endDate = new Date(startDate.getTime() + meetingDurationMs);
      setEndDatetime(formatDatetimeLocal(endDate.toISOString()));
    }
  }, [datetime, meetingDurationMs]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !datetime || !endDatetime || !selectedFile) {
      return;
    }

    onCreate(
      {
        title: title.trim(),
        datetime,
        endDatetime,
        description: description.trim() || undefined,
      },
      selectedFile
    );

    // Reset form
    const now = getTodayDateTime();
    setTitle('');
    setDatetime(now);
    setEndDatetime(getOneHourAfter(now));
    setDescription('');
    setSelectedFile(null);
    setMeetingDurationMs(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const handleCancel = () => {
    const now = getTodayDateTime();
    setTitle('');
    setDatetime(now);
    setEndDatetime(getOneHourAfter(now));
    setDescription('');
    setSelectedFile(null);
    setMeetingDurationMs(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileSelection = (file: File) => {
    setError(null);

    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      setError(validation.error || 'Invalid file');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);

    // Auto-populate title from filename if title is empty
    if (!title.trim()) {
      // Remove file extension and clean up the name
      const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, '');
      setTitle(nameWithoutExtension);
    }

    // Auto-populate datetime from file's last modified date
    // Note: Browser File API only exposes lastModified (not creation time)
    // This is typically the file creation time for recordings that aren't edited
    let startDate: Date | null = null;
    if (file.lastModified) {
      startDate = new Date(file.lastModified);
      const formattedDate = formatDatetimeLocal(startDate.toISOString());
      setDatetime(formattedDate);
    }

    // Get media duration to calculate end time
    const mediaElement = file.type.startsWith('video/')
      ? document.createElement('video')
      : document.createElement('audio');

    mediaElement.preload = 'metadata';
    mediaElement.onloadedmetadata = () => {
      const durationSeconds = mediaElement.duration;
      if (durationSeconds && isFinite(durationSeconds)) {
        const durationMs = durationSeconds * 1000;
        setMeetingDurationMs(durationMs);

        if (startDate) {
          const endDate = new Date(startDate.getTime() + durationMs);
          setEndDatetime(formatDatetimeLocal(endDate.toISOString()));
        }
      }
      // Clean up the object URL
      URL.revokeObjectURL(mediaElement.src);
    };
    mediaElement.onerror = () => {
      // If we can't get duration, fall back to 1 hour and clear duration tracking
      setMeetingDurationMs(null);
      if (startDate) {
        setEndDatetime(
          getOneHourAfter(formatDatetimeLocal(startDate.toISOString()))
        );
      }
      URL.revokeObjectURL(mediaElement.src);
    };
    mediaElement.src = URL.createObjectURL(file);
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setMeetingDurationMs(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Render modal using portal to avoid being clipped by parent containers
  if (typeof window === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop with blur effect */}
      <div
        className="fixed inset-0 backdrop-blur-sm bg-black/20"
        onClick={handleCancel}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Modal Content */}
        <div className="relative bg-white rounded-lg shadow-2xl max-w-md w-full p-6 z-10 animate-fadeInUp">
          {/* Header */}
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {existingMeeting ? 'Upload Recording' : 'Upload Meeting'}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {existingMeeting
                ? 'Edit meeting details and upload your recording'
                : 'Add meeting details for this recording'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* File Upload - Moved to top */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recording File
              </label>
              <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`
                  relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
                  ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
                  ${selectedFile ? 'bg-gray-50' : 'bg-white'}
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileInputChange}
                  accept=".mp4,.mov,.webm,.avi,.mkv,.mp3,.wav,.m4a,.aac,.flac,.ogg"
                  className="hidden"
                />

                {!selectedFile ? (
                  <>
                    <div className="mb-2">
                      <svg
                        className="mx-auto h-10 w-10 text-gray-400"
                        stroke="currentColor"
                        fill="none"
                        viewBox="0 0 48 48"
                        aria-hidden="true"
                      >
                        <path
                          d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-600">
                      <button
                        type="button"
                        onClick={handleBrowseClick}
                        className="font-medium text-blue-600 hover:text-blue-500"
                      >
                        Click to upload
                      </button>{' '}
                      or drag and drop
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {FORMAT_DESCRIPTIONS.all}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Max file size: {MAX_FILE_SIZE_MB}MB
                    </p>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center space-x-2">
                      <svg
                        className="h-6 w-6 text-blue-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm truncate">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-xs text-red-800">{error}</p>
                </div>
              )}
            </div>

            {/* Meeting Title */}
            <div>
              <label
                htmlFor="title"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Meeting Title
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Team Standup, Client Call"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            {/* Start Date & Time */}
            <div>
              <label
                htmlFor="datetime"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Start Date & Time
              </label>
              <input
                type="datetime-local"
                id="datetime"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            {/* End Date & Time */}
            <div>
              <label
                htmlFor="endDatetime"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                End Date & Time
              </label>
              <input
                type="datetime-local"
                id="endDatetime"
                value={endDatetime}
                onChange={(e) => setEndDatetime(e.target.value)}
                min={datetime}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            {/* Description (Optional) */}
            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Description (Optional)
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add notes about this meeting..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Actions */}
            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                disabled={
                  !title.trim() || !datetime || !endDatetime || !selectedFile
                }
              >
                Create & Upload
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
