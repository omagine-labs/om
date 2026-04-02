import { ipcMain } from 'electron';
import type { MeetingOrchestrator } from '../services/meeting-orchestrator';

/**
 * Register meeting orchestrator IPC handlers
 */
export function registerOrchestratorHandlers(
  meetingOrchestrator: MeetingOrchestrator
): void {
  ipcMain.handle('orchestrator:get-current-session', () => {
    try {
      const session = meetingOrchestrator.getCurrentSession();

      // Serialize dates for IPC (structured clone doesn't preserve Date objects)
      if (session) {
        return {
          success: true,
          data: {
            ...session,
            startTime: session.startTime.toISOString(),
            endTime: session.endTime?.toISOString(),
            metadata: {
              ...session.metadata,
              startTime: session.metadata.startTime.toISOString(),
              endTime: session.metadata.endTime?.toISOString(),
            },
          },
        };
      }

      return { success: true, data: null };
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error(
        '[Orchestrator] Error getting current session:',
        errorMessage
      );
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('orchestrator:manual-stop', async () => {
    try {
      return await meetingOrchestrator.manualStop();
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error('[Orchestrator] Error in manual stop:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  // Control bar IPC handlers
  ipcMain.handle('control-bar-start-recording', async () => {
    try {
      return await meetingOrchestrator.manualStart();
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error('[ControlBar] Error starting recording:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('control-bar-stop-recording', async () => {
    try {
      return await meetingOrchestrator.manualStop();
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error('[ControlBar] Error stopping recording:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  // New handlers for on/off record functionality
  ipcMain.handle('orchestrator:toggle-record', async () => {
    try {
      return await meetingOrchestrator.toggleRecord();
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error('[Orchestrator] Error toggling record:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('orchestrator:end-meeting', async () => {
    try {
      return await meetingOrchestrator.endMeeting();
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error('[Orchestrator] Error ending meeting:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  // Manual recording handlers
  ipcMain.handle(
    'start-manual-recording',
    async (
      _event,
      sourceId: string,
      sourceName: string,
      displayId?: string
    ) => {
      try {
        console.log('[IPC] Starting manual recording:', {
          sourceId,
          sourceName,
          displayId,
        });
        return await meetingOrchestrator.startManualRecording(
          sourceId,
          sourceName,
          displayId
        );
      } catch (error) {
        const errorMessage = (error as Error).message;
        console.error('[IPC] Error starting manual recording:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle('close-screen-picker', async () => {
    // Screen picker is now part of the main window, no separate window to close
    // The renderer will handle navigation back to home
  });
}
