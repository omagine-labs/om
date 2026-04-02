/**
 * API Client for Renderer Process
 *
 * All Supabase queries go through IPC to main process.
 * This client provides a clean async API that mirrors the main process API proxy.
 */

import type { ApiResponse } from '../../lib/api-proxy';
import type { AuthState } from '../../lib/auth';

/**
 * Base API client
 * Handles IPC calls to main process
 */
class BaseApiClient {
  protected async call<T>(
    method: string,
    ...args: any[]
  ): Promise<ApiResponse<T>> {
    if (!window.electronAPI?.invoke) {
      return {
        success: false,
        error: 'Electron API not available',
      };
    }

    try {
      const result = await window.electronAPI.invoke(`api:${method}`, ...args);
      return result as ApiResponse<T>;
    } catch (error) {
      console.error(`[API Client] Error calling ${method}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Dashboard API Client
 */
export class DashboardApiClient extends BaseApiClient {
  async calculateWeeklyRollup(
    userId: string,
    weekStart: string
  ): Promise<ApiResponse<void>> {
    return this.call('calculateWeeklyRollup', userId, weekStart);
  }

  async getWeeklyData(
    userId: string,
    weekStart?: string
  ): Promise<ApiResponse<any>> {
    return this.call('getWeeklyData', userId, weekStart);
  }

  async getWeeklyMetrics(userId: string): Promise<ApiResponse<any[]>> {
    return this.call('getWeeklyMetrics', userId);
  }

  async getMeetingAnalysisForWeek(
    userId: string,
    weekStart: string,
    weekEndPlusOne: string
  ): Promise<ApiResponse<any[]>> {
    return this.call(
      'getMeetingAnalysisForWeek',
      userId,
      weekStart,
      weekEndPlusOne
    );
  }

  async getBaseline(
    userId: string,
    baselineType: 'current' | 'initial'
  ): Promise<ApiResponse<any>> {
    return this.call('getBaseline', userId, baselineType);
  }

  async getMeetingCountForUser(userId: string): Promise<ApiResponse<any[]>> {
    return this.call('getMeetingCountForUser', userId);
  }

  async getEarliestMeetingDate(userId: string): Promise<ApiResponse<any>> {
    return this.call('getEarliestMeetingDate', userId);
  }

  async getAssignedMeetingsForWeek(
    userId: string,
    weekStart: string,
    weekEnd: string
  ): Promise<ApiResponse<any[]>> {
    return this.call('getAssignedMeetingsForWeek', userId, weekStart, weekEnd);
  }

  async getUnassignedMeetingsForWeek(
    userId: string,
    weekStart: string,
    weekEnd: string
  ): Promise<ApiResponse<any[]>> {
    return this.call(
      'getUnassignedMeetingsForWeek',
      userId,
      weekStart,
      weekEnd
    );
  }

  async getMeetingLevelMetrics(
    userId: string,
    column: string,
    startDate: string,
    endDate: string
  ): Promise<ApiResponse<any[]>> {
    return this.call(
      'getMeetingLevelMetrics',
      userId,
      column,
      startDate,
      endDate
    );
  }

  async getDashboardStats(userId: string): Promise<
    ApiResponse<{
      totalMeetings: number;
      hoursAnalyzed: string;
      thisMonth: number;
    }>
  > {
    return this.call('getDashboardStats', userId);
  }

  async getGlobalUnassignedMeetings(userId: string): Promise<
    ApiResponse<{
      count: number;
      firstMeetingId: string | null;
    }>
  > {
    return this.call('getGlobalUnassignedMeetings', userId);
  }
}

/**
 * Meetings API Client
 */
export class MeetingsApiClient extends BaseApiClient {
  async getMeetings(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      weekStart?: string;
    }
  ): Promise<ApiResponse<any[]>> {
    return this.call('getMeetings', userId, options);
  }

  async getMeeting(meetingId: string): Promise<ApiResponse<any>> {
    return this.call('getMeeting', meetingId);
  }

  async getTranscript(meetingId: string): Promise<ApiResponse<any[]>> {
    return this.call('getTranscript', meetingId);
  }

  async deleteMeeting(meetingId: string): Promise<ApiResponse<void>> {
    return this.call('deleteMeeting', meetingId);
  }

  async updateMeetingTitle(
    meetingId: string,
    title: string
  ): Promise<ApiResponse<any>> {
    return this.call('updateMeetingTitle', meetingId, title);
  }

  async getMeetingsWithAnalysis(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<
    ApiResponse<{
      meetings: any[];
      jobs: any[];
      analyses: any[];
      hasMore: boolean;
    }>
  > {
    return this.call('getMeetingsWithAnalysis', userId, options);
  }

  async createMeeting(meetingData: {
    user_id: string;
    title: string;
    start_time: string;
    end_time?: string;
    source?: string;
  }): Promise<ApiResponse<any>> {
    return this.call('createMeeting', meetingData);
  }

  async updateMeeting(
    meetingId: string,
    updates: {
      title?: string;
      start_time?: string;
      end_time?: string | null;
    }
  ): Promise<ApiResponse<any>> {
    return this.call('updateMeeting', meetingId, updates);
  }

  async meetingExists(meetingId: string): Promise<ApiResponse<boolean>> {
    return this.call('meetingExists', meetingId);
  }

  async getMeetingAnalysisPageData(meetingId: string): Promise<
    ApiResponse<{
      meeting: any;
      job: any;
      analyses: any[];
      userFullName: string | null;
    }>
  > {
    return this.call('getMeetingAnalysisPageData', meetingId);
  }

  async getMeetingForReprocess(
    meetingId: string,
    userId: string
  ): Promise<ApiResponse<any>> {
    return this.call('getMeetingForReprocess', meetingId, userId);
  }

  async getAnalysisPanelData(jobId: string): Promise<
    ApiResponse<{
      job: any;
      meeting: any;
      speakerRecords: any[];
      userFullName: string | null;
    }>
  > {
    return this.call('getAnalysisPanelData', jobId);
  }
}

/**
 * User API Client
 */
export class UserApiClient extends BaseApiClient {
  async getProfile(userId: string): Promise<ApiResponse<any>> {
    return this.call('getProfile', userId);
  }

  async updateProfile(
    userId: string,
    updates: Record<string, any>
  ): Promise<ApiResponse<any>> {
    return this.call('updateProfile', userId, updates);
  }

  async getSubscription(userId: string): Promise<ApiResponse<any>> {
    return this.call('getSubscription', userId);
  }

  async getUserFullName(userId: string): Promise<ApiResponse<string | null>> {
    return this.call('getUserFullName', userId);
  }

  async getCurrentSubscription(userId: string): Promise<ApiResponse<any>> {
    return this.call('getCurrentSubscription', userId);
  }
}

/**
 * Analysis API Client
 * Handles speaker assignment operations
 */
export class AnalysisApiClient extends BaseApiClient {
  async getMeetingAnalysisByJobId(jobId: string): Promise<ApiResponse<any[]>> {
    return this.call('getMeetingAnalysisByJobId', jobId);
  }

  async getMeetingAnalysisByMeetingId(
    meetingId: string
  ): Promise<ApiResponse<any[]>> {
    return this.call('getMeetingAnalysisByMeetingId', meetingId);
  }

  async assignSpeaker(
    jobId: string,
    speakerLabel: string,
    userId: string
  ): Promise<ApiResponse<void>> {
    return this.call('assignSpeaker', jobId, speakerLabel, userId);
  }

  async assignCustomName(
    jobId: string,
    speakerLabel: string,
    name: string
  ): Promise<ApiResponse<void>> {
    return this.call('assignCustomName', jobId, speakerLabel, name);
  }

  async unassignSpeaker(
    jobId: string,
    speakerLabel: string
  ): Promise<ApiResponse<void>> {
    return this.call('unassignSpeaker', jobId, speakerLabel);
  }

  async autoAssignSpeaker(
    analysisId: string,
    userId: string
  ): Promise<ApiResponse<void>> {
    return this.call('autoAssignSpeaker', analysisId, userId);
  }

  async getWeeklyAnalysisRecords(
    userId: string,
    sinceDate: string
  ): Promise<ApiResponse<any[]>> {
    return this.call('getWeeklyAnalysisRecords', userId, sinceDate);
  }

  async claimAnonymousMeetings(
    userId: string,
    email: string,
    selectedSpeaker?: string
  ): Promise<ApiResponse<any[]>> {
    return this.call('claimAnonymousMeetings', userId, email, selectedSpeaker);
  }
}

/**
 * Processing Jobs API Client
 * Handles job status and processing operations
 */
export class ProcessingJobsApiClient extends BaseApiClient {
  async getJobById(jobId: string): Promise<ApiResponse<any>> {
    return this.call('getJobById', jobId);
  }

  async getJobByMeetingId(meetingId: string): Promise<ApiResponse<any>> {
    return this.call('getJobByMeetingId', meetingId);
  }

  async getJobsByMeetingIds(meetingIds: string[]): Promise<ApiResponse<any[]>> {
    return this.call('getJobsByMeetingIds', meetingIds);
  }

  async pollJobStatus(
    meetingIds: string[]
  ): Promise<
    ApiResponse<{ id: string; meeting_id: string; status: string }[]>
  > {
    return this.call('pollJobStatus', meetingIds);
  }

  async updateJobStatus(
    jobId: string,
    status: string,
    errorMessage?: string
  ): Promise<ApiResponse<void>> {
    return this.call('updateJobStatus', jobId, status, errorMessage);
  }

  async deleteJobsByIds(jobIds: string[]): Promise<ApiResponse<void>> {
    return this.call('deleteJobsByIds', jobIds);
  }
}

/**
 * Storage API Client
 * Handles file storage operations
 */
export class StorageApiClient extends BaseApiClient {
  async deleteRecording(storagePath: string): Promise<ApiResponse<void>> {
    return this.call('deleteRecording', storagePath);
  }
}

/**
 * Analytics API Client
 * Logs events to user_event_log table
 */
export class AnalyticsApiClient extends BaseApiClient {
  async logEvent(
    userId: string,
    eventName: string,
    payload?: Record<string, any>
  ): Promise<ApiResponse<void>> {
    return this.call('logEvent', userId, eventName, payload);
  }
}

/**
 * Auth API Client
 * Access auth state from main process
 */
export class AuthApiClient extends BaseApiClient {
  /**
   * Get current user from main process
   */
  async getCurrentUser(): Promise<any | null> {
    if (!window.electronAPI?.auth?.getUser) {
      console.error('[Auth API Client] auth.getUser not available');
      return null;
    }

    try {
      return await window.electronAPI.auth.getUser();
    } catch (error) {
      console.error('[Auth API Client] Error getting current user:', error);
      return null;
    }
  }

  /**
   * Get current session from main process
   */
  async getSession(): Promise<any | null> {
    if (!window.electronAPI?.auth?.getSession) {
      console.error('[Auth API Client] auth.getSession not available');
      return null;
    }

    try {
      return await window.electronAPI.auth.getSession();
    } catch (error) {
      console.error('[Auth API Client] Error getting session:', error);
      return null;
    }
  }

  /**
   * Get auth state from main process
   * Returns: 'loading' | 'authenticated' | 'unauthenticated'
   */
  async getAuthState(): Promise<AuthState> {
    if (!window.electronAPI?.invoke) {
      return 'unauthenticated';
    }

    try {
      return await window.electronAPI.invoke('auth:getState');
    } catch (error) {
      console.error('[Auth API Client] Error getting auth state:', error);
      return 'unauthenticated';
    }
  }

  /**
   * Wait for auth to be ready
   */
  async waitForReady(timeoutMs?: number): Promise<void> {
    if (!window.electronAPI?.invoke) {
      throw new Error('Electron API not available');
    }

    await window.electronAPI.invoke('auth:waitForReady', timeoutMs);
  }

  /**
   * Initialize session (usually automatic, but can call manually)
   */
  async initializeSession(): Promise<boolean> {
    if (!window.electronAPI?.invoke) {
      return false;
    }

    try {
      const result = await window.electronAPI.invoke('auth:initialize');
      return result.success === true;
    } catch (error) {
      console.error('[Auth API Client] Error initializing session:', error);
      return false;
    }
  }

  /**
   * Refresh session
   */
  async refreshSession(): Promise<boolean> {
    if (!window.electronAPI?.invoke) {
      return false;
    }

    try {
      const result = await window.electronAPI.invoke('auth:refresh');
      return result.success === true;
    } catch (error) {
      console.error('[Auth API Client] Error refreshing session:', error);
      return false;
    }
  }
}

// Export singleton instances
export const dashboardApi = new DashboardApiClient();
export const meetingsApi = new MeetingsApiClient();
export const userApi = new UserApiClient();
export const authApi = new AuthApiClient();
export const analysisApi = new AnalysisApiClient();
export const analyticsClientApi = new AnalyticsApiClient();
export const processingJobsApi = new ProcessingJobsApiClient();
export const storageApi = new StorageApiClient();

// Export convenience function to get current user
export async function getCurrentUser() {
  return authApi.getCurrentUser();
}

// Export convenience function to wait for auth
export async function waitForAuth(timeoutMs?: number) {
  return authApi.waitForReady(timeoutMs);
}
