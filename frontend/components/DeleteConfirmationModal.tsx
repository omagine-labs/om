'use client';

import { useState, useEffect } from 'react';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onConfirm: (options?: { deleteMeeting?: boolean }) => void;
  onCancel: () => void;
  count?: number;
  title?: string;
  message?: string;
  confirmButtonText?: string;
  showMeetingOption?: boolean;
  meetingTitle?: string;
}

export default function DeleteConfirmationModal({
  isOpen,
  onConfirm,
  onCancel,
  count = 1,
  title,
  message,
  confirmButtonText,
  showMeetingOption = false,
  meetingTitle,
}: DeleteConfirmationModalProps) {
  const [deleteMeeting, setDeleteMeeting] = useState(false);

  // Handle escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDeleteMeeting(false);
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const defaultTitle = `Delete Recording${count > 1 ? 's' : ''}`;
  const defaultMessage = `Are you sure you want to delete ${count > 1 ? `${count} recordings` : 'this recording'}? This action cannot be undone and will permanently remove ${count > 1 ? 'these files' : 'this file'} from storage.`;

  const handleConfirm = () => {
    onConfirm(showMeetingOption ? { deleteMeeting } : undefined);
    setDeleteMeeting(false); // Reset for next time
  };

  const handleCancel = () => {
    setDeleteMeeting(false); // Reset for next time
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          {/* Icon */}
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>

          {/* Content */}
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {title || defaultTitle}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {message || defaultMessage}
            </p>

            {/* Optional Meeting Delete Checkbox */}
            {showMeetingOption && meetingTitle && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-900 font-medium mb-3 text-left">
                  This recording is linked to a manual meeting:
                </p>
                <p className="text-sm text-blue-800 mb-3 text-left italic">
                  &ldquo;{meetingTitle}&rdquo;
                </p>
                <label className="flex items-start cursor-pointer text-left">
                  <input
                    type="checkbox"
                    checked={deleteMeeting}
                    onChange={(e) => setDeleteMeeting(e.target.checked)}
                    className="mt-0.5 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-3 text-sm text-gray-700">
                    Also delete the meeting (you can always create it again
                    later)
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex space-x-3">
            <button
              onClick={handleCancel}
              className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              {showMeetingOption && deleteMeeting
                ? 'Delete Both'
                : confirmButtonText || 'Delete Recording'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
