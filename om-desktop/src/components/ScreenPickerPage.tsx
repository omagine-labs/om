import React, { useState, useEffect } from 'react';
import { DesktopSource } from '../types/electron';
import './ScreenPicker.css';

interface ScreenPickerPageProps {
  onSourceSelected: (sourceId: string, source: DesktopSource) => void;
}

/**
 * ScreenPickerPage - Full-page screen picker without modal overlay
 *
 * This renders the screen picker content directly in a dedicated window,
 * without the modal overlay and close button (since the whole window IS the picker)
 */
export function ScreenPickerPage({ onSourceSelected }: ScreenPickerPageProps) {
  const [sources, setSources] = useState<DesktopSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load sources on mount
  useEffect(() => {
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
        console.error('[ScreenPickerPage] Error loading sources:', err);
        setError('Failed to load available screens and windows');
      } finally {
        setIsLoading(false);
      }
    };

    loadSources();
  }, []);

  // Handle Escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.electronAPI.closeScreenPicker();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const handleSourceClick = (sourceId: string) => {
    const source = sources.find((s) => s.id === sourceId);
    if (!source) return;

    setSelectedSourceId(sourceId);
    onSourceSelected(sourceId, source);
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        backgroundColor: '#1a1a1a',
        padding: '40px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      <div style={{ marginBottom: '30px' }}>
        <h2
          style={{
            color: '#ffffff',
            fontSize: '24px',
            margin: 0,
            fontWeight: 600,
          }}
        >
          Select Screen or Window
        </h2>
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
          {/* Separate screens and windows */}
          {sources.filter((s) => s.id.startsWith('screen:')).length > 0 && (
            <>
              <h3
                style={{
                  color: '#ffffff',
                  fontSize: '16px',
                  margin: '0 0 15px 0',
                  fontWeight: 500,
                }}
              >
                Screens
              </h3>
              <div
                className="screen-picker-grid"
                style={{ marginBottom: '30px' }}
              >
                {sources
                  .filter((s) => s.id.startsWith('screen:'))
                  .map((source) => (
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
            </>
          )}

          {sources.filter((s) => s.id.startsWith('window:')).length > 0 && (
            <>
              <h3
                style={{
                  color: '#ffffff',
                  fontSize: '16px',
                  margin: '0 0 15px 0',
                  fontWeight: 500,
                }}
              >
                Windows
              </h3>
              <div className="screen-picker-grid">
                {sources
                  .filter((s) => s.id.startsWith('window:'))
                  .map((source) => (
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
            </>
          )}
        </>
      )}
    </div>
  );
}
