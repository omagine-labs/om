/**
 * SpeakerAssignmentControls Component
 *
 * Renders the UI controls for assigning speaker identities:
 * - "This is me" button
 * - "Assign name" / "Edit name" button
 * - "Unassign" button (to remove speaker assignment)
 * - Name input field with save/cancel actions
 */

'use client';

interface SpeakerAssignmentControlsProps {
  isMe: boolean;
  isAssigned: boolean;
  isEditing: boolean;
  isAssigning: boolean;
  customName: string;
  displayName: string;
  showUnassign: boolean;
  onAssignToMe: () => void;
  onStartEditing: () => void;
  onStartEditingExisting: () => void;
  onUnassign: () => void;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function SpeakerAssignmentControls({
  isMe,
  isAssigned,
  isEditing,
  isAssigning,
  customName,
  displayName: _displayName,
  showUnassign,
  onAssignToMe,
  onStartEditing,
  onStartEditingExisting,
  onUnassign,
  onNameChange,
  onSave,
  onCancel,
}: SpeakerAssignmentControlsProps) {
  return (
    <>
      {/* Action buttons - hide when editing to avoid cluttered UI */}
      {!isEditing && (
        <div className="flex items-center gap-2">
          {!isMe && !isAssigned && (
            <>
              <button
                onClick={onAssignToMe}
                disabled={isAssigning}
                className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAssigning ? 'Assigning...' : 'This is me'}
              </button>
              <button
                onClick={onStartEditing}
                disabled={isAssigning}
                className="text-xs px-3 py-1.5 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Assign name
              </button>
            </>
          )}
          {!isMe && isAssigned && (
            <>
              <button
                onClick={onStartEditingExisting}
                disabled={isAssigning}
                className="text-xs px-3 py-1.5 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Edit name
              </button>
              {showUnassign && (
                <button
                  onClick={onUnassign}
                  disabled={isAssigning}
                  className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Unassign
                </button>
              )}
            </>
          )}
          {isMe && showUnassign && (
            <button
              onClick={onUnassign}
              disabled={isAssigning}
              className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Unassign
            </button>
          )}
        </div>
      )}

      {/* Name input field */}
      {isEditing && (
        <div className="mb-3 p-3 bg-white border border-gray-200 rounded-md">
          <label className="block text-xs text-gray-700 mb-2">
            Enter speaker name:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customName}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSave();
                } else if (e.key === 'Escape') {
                  onCancel();
                }
              }}
              placeholder="e.g., John Smith"
              className="flex-1 text-xs px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
            <button
              onClick={onSave}
              disabled={!customName.trim() || isAssigning}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
            <button
              onClick={onCancel}
              disabled={isAssigning}
              className="text-xs px-3 py-1.5 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
