/**
 * API IPC Handlers
 *
 * IPC handlers for API proxy service.
 * Routes renderer API calls to main process Supabase queries.
 * Note: Auth handlers are in auth-handlers.ts
 */

import { ipcMain } from 'electron';
import {
  dashboardApi,
  meetingsApi,
  userApi,
  analysisApi,
  analyticsProxyApi,
  processingJobsApi,
  storageApi,
} from '../lib/api-proxy';

/**
 * Register all API IPC handlers
 */
export function registerApiHandlers(): void {
  console.log('[IPC] Registering API handlers');

  // ==================
  // Dashboard API
  // ==================

  ipcMain.handle(
    'api:calculateWeeklyRollup',
    async (_event, userId: string, weekStart: string) => {
      return dashboardApi.calculateWeeklyRollup(userId, weekStart);
    }
  );

  ipcMain.handle(
    'api:getWeeklyData',
    async (_event, userId: string, weekStart?: string) => {
      return dashboardApi.getWeeklyData(userId, weekStart);
    }
  );

  ipcMain.handle('api:getWeeklyMetrics', async (_event, userId: string) => {
    return dashboardApi.getWeeklyMetrics(userId);
  });

  ipcMain.handle(
    'api:getMeetingAnalysisForWeek',
    async (
      _event,
      userId: string,
      weekStart: string,
      weekEndPlusOne: string
    ) => {
      return dashboardApi.getMeetingAnalysisForWeek(
        userId,
        weekStart,
        weekEndPlusOne
      );
    }
  );

  ipcMain.handle(
    'api:getBaseline',
    async (_event, userId: string, baselineType: 'current' | 'initial') => {
      return dashboardApi.getBaseline(userId, baselineType);
    }
  );

  ipcMain.handle(
    'api:getMeetingCountForUser',
    async (_event, userId: string) => {
      return dashboardApi.getMeetingCountForUser(userId);
    }
  );

  ipcMain.handle(
    'api:getEarliestMeetingDate',
    async (_event, userId: string) => {
      return dashboardApi.getEarliestMeetingDate(userId);
    }
  );

  ipcMain.handle(
    'api:getAssignedMeetingsForWeek',
    async (_event, userId: string, weekStart: string, weekEnd: string) => {
      return dashboardApi.getAssignedMeetingsForWeek(
        userId,
        weekStart,
        weekEnd
      );
    }
  );

  ipcMain.handle(
    'api:getUnassignedMeetingsForWeek',
    async (_event, userId: string, weekStart: string, weekEnd: string) => {
      return dashboardApi.getUnassignedMeetingsForWeek(
        userId,
        weekStart,
        weekEnd
      );
    }
  );

  ipcMain.handle(
    'api:getMeetingLevelMetrics',
    async (
      _event,
      userId: string,
      column: string,
      startDate: string,
      endDate: string
    ) => {
      return dashboardApi.getMeetingLevelMetrics(
        userId,
        column,
        startDate,
        endDate
      );
    }
  );

  ipcMain.handle('api:getDashboardStats', async (_event, userId: string) => {
    return dashboardApi.getDashboardStats(userId);
  });

  ipcMain.handle(
    'api:getGlobalUnassignedMeetings',
    async (_event, userId: string) => {
      return dashboardApi.getGlobalUnassignedMeetings(userId);
    }
  );

  // ==================
  // Meetings API
  // ==================

  ipcMain.handle(
    'api:getMeetings',
    async (_event, userId: string, options?: any) => {
      return meetingsApi.getMeetings(userId, options);
    }
  );

  ipcMain.handle('api:getMeeting', async (_event, meetingId: string) => {
    return meetingsApi.getMeeting(meetingId);
  });

  ipcMain.handle('api:getTranscript', async (_event, meetingId: string) => {
    return meetingsApi.getTranscript(meetingId);
  });

  ipcMain.handle('api:deleteMeeting', async (_event, meetingId: string) => {
    return meetingsApi.deleteMeeting(meetingId);
  });

  // ==================
  // User API
  // ==================

  ipcMain.handle('api:getProfile', async (_event, userId: string) => {
    return userApi.getProfile(userId);
  });

  ipcMain.handle(
    'api:updateProfile',
    async (_event, userId: string, updates: Record<string, any>) => {
      return userApi.updateProfile(userId, updates);
    }
  );

  ipcMain.handle('api:getSubscription', async (_event, userId: string) => {
    return userApi.getSubscription(userId);
  });

  ipcMain.handle('api:getUserFullName', async (_event, userId: string) => {
    return userApi.getUserFullName(userId);
  });

  ipcMain.handle(
    'api:getCurrentSubscription',
    async (_event, userId: string) => {
      return userApi.getCurrentSubscription(userId);
    }
  );

  // ==================
  // Extended Meetings API
  // ==================

  ipcMain.handle(
    'api:updateMeetingTitle',
    async (_event, meetingId: string, title: string) => {
      return meetingsApi.updateMeetingTitle(meetingId, title);
    }
  );

  ipcMain.handle(
    'api:getMeetingsWithAnalysis',
    async (
      _event,
      userId: string,
      options?: { limit?: number; offset?: number }
    ) => {
      return meetingsApi.getMeetingsWithAnalysis(userId, options);
    }
  );

  ipcMain.handle('api:createMeeting', async (_event, meetingData: any) => {
    return meetingsApi.createMeeting(meetingData);
  });

  ipcMain.handle(
    'api:updateMeeting',
    async (_event, meetingId: string, updates: any) => {
      return meetingsApi.updateMeeting(meetingId, updates);
    }
  );

  ipcMain.handle('api:meetingExists', async (_event, meetingId: string) => {
    return meetingsApi.meetingExists(meetingId);
  });

  ipcMain.handle(
    'api:getMeetingAnalysisPageData',
    async (_event, meetingId: string) => {
      return meetingsApi.getMeetingAnalysisPageData(meetingId);
    }
  );

  ipcMain.handle(
    'api:getMeetingForReprocess',
    async (_event, meetingId: string, userId: string) => {
      return meetingsApi.getMeetingForReprocess(meetingId, userId);
    }
  );

  ipcMain.handle('api:getAnalysisPanelData', async (_event, jobId: string) => {
    return meetingsApi.getAnalysisPanelData(jobId);
  });

  // ==================
  // Analysis API
  // ==================

  ipcMain.handle(
    'api:getMeetingAnalysisByJobId',
    async (_event, jobId: string) => {
      return analysisApi.getMeetingAnalysisByJobId(jobId);
    }
  );

  ipcMain.handle(
    'api:getMeetingAnalysisByMeetingId',
    async (_event, meetingId: string) => {
      return analysisApi.getMeetingAnalysisByMeetingId(meetingId);
    }
  );

  ipcMain.handle(
    'api:assignSpeaker',
    async (_event, jobId: string, speakerLabel: string, userId: string) => {
      return analysisApi.assignSpeaker(jobId, speakerLabel, userId);
    }
  );

  ipcMain.handle(
    'api:assignCustomName',
    async (_event, jobId: string, speakerLabel: string, name: string) => {
      return analysisApi.assignCustomName(jobId, speakerLabel, name);
    }
  );

  ipcMain.handle(
    'api:unassignSpeaker',
    async (_event, jobId: string, speakerLabel: string) => {
      return analysisApi.unassignSpeaker(jobId, speakerLabel);
    }
  );

  ipcMain.handle(
    'api:autoAssignSpeaker',
    async (_event, analysisId: string, userId: string) => {
      return analysisApi.autoAssignSpeaker(analysisId, userId);
    }
  );

  ipcMain.handle(
    'api:getWeeklyAnalysisRecords',
    async (_event, userId: string, sinceDate: string) => {
      return analysisApi.getWeeklyAnalysisRecords(userId, sinceDate);
    }
  );

  ipcMain.handle(
    'api:claimAnonymousMeetings',
    async (_event, userId: string, email: string, selectedSpeaker?: string) => {
      return analysisApi.claimAnonymousMeetings(userId, email, selectedSpeaker);
    }
  );

  // ==================
  // Processing Jobs API
  // ==================

  ipcMain.handle('api:getJobById', async (_event, jobId: string) => {
    return processingJobsApi.getJobById(jobId);
  });

  ipcMain.handle('api:getJobByMeetingId', async (_event, meetingId: string) => {
    return processingJobsApi.getJobByMeetingId(meetingId);
  });

  ipcMain.handle(
    'api:getJobsByMeetingIds',
    async (_event, meetingIds: string[]) => {
      return processingJobsApi.getJobsByMeetingIds(meetingIds);
    }
  );

  ipcMain.handle('api:pollJobStatus', async (_event, meetingIds: string[]) => {
    return processingJobsApi.pollJobStatus(meetingIds);
  });

  ipcMain.handle(
    'api:updateJobStatus',
    async (_event, jobId: string, status: string, errorMessage?: string) => {
      return processingJobsApi.updateJobStatus(jobId, status, errorMessage);
    }
  );

  ipcMain.handle('api:deleteJobsByIds', async (_event, jobIds: string[]) => {
    return processingJobsApi.deleteJobsByIds(jobIds);
  });

  // ==================
  // Storage API
  // ==================

  ipcMain.handle('api:deleteRecording', async (_event, storagePath: string) => {
    return storageApi.deleteRecording(storagePath);
  });

  // ==================
  // Analytics API
  // ==================

  ipcMain.handle(
    'api:logEvent',
    async (
      _event,
      userId: string,
      eventName: string,
      payload?: Record<string, any>
    ) => {
      return analyticsProxyApi.logEvent(userId, eventName, payload);
    }
  );

  console.log('[IPC] API handlers registered');
}
