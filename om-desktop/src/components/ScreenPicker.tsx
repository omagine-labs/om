import React, { useState, useEffect } from 'react';
import { DesktopSource } from '../types/electron';
import './ScreenPicker.css';

interface ScreenPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSourceSelected: (sourceId: string, source: DesktopSource) => void;
}

/**
 * ScreenPicker - Modal component for selecting a screen or window to record
 *
 * Features:
 * - Displays thumbnail previews of all available screens and windows
 * - Shows app icons for window sources
 * - Automatically loads sources when opened
 * - Supports keyboard (Escape) to close
 *
 * Usage:
 * ```tsx
 * <ScreenPicker
 *   isOpen={showPicker}
 *   onClose={() => setShowPicker(false)}
 *   onSourceSelected={(sourceId, source) => {
 *     console.log('Selected:', source.name);
 *     startRecording(sourceId);
 *   }}
 * />
 * ```
 */
export function ScreenPicker({
  isOpen,
  onClose,
  onSourceSelected,
}: ScreenPickerProps) {
  const [sources, setSources] = useState<DesktopSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load sources when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const loadSources = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const availableSources = await window.electronAPI.getSources();
        setSources(availableSources);

        // Pre-select first source
        if (availableSources.length > 0) {
          setSelectedSourceId(availableSources[0].id);
        }
      } catch (err) {
        console.error('[ScreenPicker] Error loading sources:', err);
        setError('Failed to load available screens and windows');
      } finally {
        setIsLoading(false);
      }
    };

    loadSources();
  }, [isOpen]);

  // Handle Escape key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleSourceClick = (sourceId: string) => {
    const source = sources.find((s) => s.id === sourceId);
    if (!source) return;

    setSelectedSourceId(sourceId);
    onSourceSelected(sourceId, source);
  };

  if (!isOpen) return null;

  return (
    <div className="screen-picker-overlay" onClick={onClose}>
      <div
        className="screen-picker-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="screen-picker-header">
          <h2>Select Screen or Window to Record</h2>
          <button
            className="screen-picker-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="screen-picker-error">
            <strong>Error:</strong> {error}
          </div>
        )}

        {isLoading ? (
          <div className="screen-picker-loading">
            Loading available sources...
          </div>
        ) : (
          <>
            <div className="screen-picker-grid">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className={`screen-picker-item ${selectedSourceId === source.id ? 'selected' : ''}`}
                  onClick={() => handleSourceClick(source.id)}
                >
                  <div className="screen-picker-preview">
                    <img src={source.thumbnail} alt={source.name} />
                    {source.appIcon && (
                      <div className="screen-picker-app-icon">
                        <img src={source.appIcon} alt="" />
                      </div>
                    )}
                  </div>
                  <div className="screen-picker-name">{source.name}</div>
                </div>
              ))}
            </div>

            <div className="screen-picker-hint">
              <strong>✅ Audio Capture Enabled:</strong>
              <ul>
                <li>
                  <strong>All system audio</strong> is automatically captured
                  (Zoom, Meet, Spotify, YouTube, etc.)
                </li>
                <li>
                  <strong>Your microphone</strong> is always included
                </li>
                <li>No additional setup required!</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
