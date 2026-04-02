/**
 * API Proxy Service
 *
 * All Supabase queries go through main process for centralized auth management.
 * Renderer process makes zero direct Supabase calls - everything via IPC.
 */

import { authService } from './auth';
import * as Sentry from '@sentry/electron/main';
import type { PostgrestError } from '@supabase/supabase-js';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * Base API proxy class
 * Handles auth checks, error handling, and Sentry logging
 */
class ApiProxyService {
  /**
   * Ensure auth is ready before making API call
   * Waits for auth service to finish loading state
   */
  protected async ensureAuth(): Promise<void> {
    const state = authService.getState();

    // If already authenticated or unauthenticated, we're ready
    if (state === 'authenticated' || state === 'unauthenticated') {
      return;
    }

    // If loading, wait for auth to be ready (with timeout)
    if (state === 'loading') {
      const startTime = Date.now();
      const timeoutMs = 10000;

      while (authService.getState() === 'loading') {
        if (Date.now() - startTime > timeoutMs) {
          throw new Error(`Auth timeout: still loading after ${timeoutMs}ms`);
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * Execute a Supabase query with error handling
   */
  protected async execute<T>(
    operationName: string,
    operation: () => Promise<{ data: T | null; error: PostgrestError | null }>
  ): Promise<ApiResponse<T>> {
    try {
      // Ensure auth is ready
      await this.ensureAuth();

      const startTime = Date.now();
      const result = await operation();
      const duration = Date.now() - startTime;

      if (result.error) {
        console.error(`[API Proxy] ${operationName} error:`, result.error);

        // Log to Sentry
        Sentry.captureMessage(`API Error: ${operationName}`, {
          level: 'error',
          tags: {
            component: 'api_proxy',
            operation: operationName,
            error_code: result.error.code,
          },
          extra: {
            error: result.error,
            duration,
          },
        });

        return {
          success: false,
          error: result.error.message,
          code: result.error.code,
        };
      }

      console.log(`[API Proxy] ${operationName} success (${duration}ms)`);

      // Log slow queries
      if (duration > 2000) {
        Sentry.captureMessage(`Slow API Query: ${operationName}`, {
          level: 'warning',
          tags: {
            component: 'api_proxy',
            operation: operationName,
          },
          extra: { duration },
        });
      }

      return {
        success: true,
        data: result.data as T,
      };
    } catch (error) {
      console.error(`[API Proxy] ${operationName} exception:`, error);

      Sentry.captureException(error, {
        tags: {
          component: 'api_proxy',
          operation: operationName,
        },
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute an RPC call with error handling
   */
  protected async executeRpc<T>(
    operationName: string,
    rpcName: string,
    params?: Record<string, any>
  ): Promise<ApiResponse<T>> {
    try {
      await this.ensureAuth();

      const startTime = Date.now();
      const supabase = authService.getClient();
      const result = await supabase.rpc(rpcName, params);
      const duration = Date.now() - startTime;

      if (result.error) {
        console.error(`[API Proxy] ${operationName} RPC error:`, result.error);

        Sentry.captureMessage(`API RPC Error: ${operationName}`, {
          level: 'error',
          tags: {
            component: 'api_proxy',
            operation: operationName,
            rpc_name: rpcName,
          },
          extra: {
            error: result.error,
            params,
            duration,
          },
        });

        return {
          success: false,
          error: result.error.message,
        };
      }

      console.log(`[API Proxy] ${operationName} RPC success (${duration}ms)`);

      return {
        success: true,
        data: result.data as T,
      };
    } catch (error) {
      console.error(`[API Proxy] ${operationName} RPC exception:`, error);

      Sentry.captureException(error, {
        tags: {
          component: 'api_proxy',
          operation: operationName,
          rpc_name: rpcName,
        },
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Dashboard API
 * Queries for weekly dashboard data
 */
export class DashboardApi extends ApiProxyService {
  /**
   * Calculate weekly rollup for user
   */
  async calculateWeeklyRollup(
    userId: string,
    weekStart: string
  ): Promise<ApiResponse<void>> {
    return this.executeRpc(
      'calculateWeeklyRollup',
      'calculate_user_weekly_rollup',
      {
        p_user_id: userId,
        p_week_start: weekStart,
      }
    );
  }

  /**
   * Get weekly dashboard data
   */
  async getWeeklyData(
    userId: string,
    weekStart?: string
  ): Promise<ApiResponse<any>> {
    return this.execute('getWeeklyData', async () => {
      const supabase = authService.getClient();

      let query = supabase
        .from('user_weekly_rollups')
        .select('*')
        .eq('user_id', userId);

      if (weekStart) {
        // Filter by specific week
        query = query.eq('week_start_date', weekStart);
      } else {
        // Get most recent week
        query = query.order('week_start_date', { ascending: false }).limit(1);
      }

      // Use maybeSingle() to return null instead of error when no row found
      return query.maybeSingle();
    });
  }

  /**
   * Get weekly metrics (for charts)
   */
  async getWeeklyMetrics(userId: string): Promise<ApiResponse<any[]>> {
    return this.execute('getWeeklyMetrics', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('user_weekly_rollups')
        .select('*')
        .eq('user_id', userId)
        .order('week_start_date', { ascending: false })
        .limit(8);
    });
  }

  /**
   * Get meeting analysis data for a week (for fallback calculation when no rollup)
   * Uses user_speaker_label to find the user's speaker data
   */
  async getMeetingAnalysisForWeek(
    userId: string,
    weekStart: string,
    weekEndPlusOne: string
  ): Promise<ApiResponse<any[]>> {
    return this.execute('getMeetingAnalysisForWeek', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('meeting_analysis')
        .select(
          `
          speaker_label,
          talk_time_percentage,
          words_per_minute,
          word_count,
          segments_count,
          times_interrupted,
          times_interrupting,
          turn_taking_balance,
          clarity_score,
          confidence_score,
          attunement_score,
          meeting_id,
          meetings!inner(start_time, user_speaker_label)
        `
        )
        .eq('meetings.user_id', userId)
        .not('meetings.user_speaker_label', 'is', null)
        .gte('meetings.start_time', weekStart)
        .lt('meetings.start_time', weekEndPlusOne);
    });
  }

  /**
   * Get user baseline data
   */
  async getBaseline(
    userId: string,
    baselineType: 'current' | 'initial'
  ): Promise<ApiResponse<any>> {
    return this.execute('getBaseline', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('user_baselines')
        .select(
          'baseline_talk_time_percentage, baseline_words_per_minute, baseline_words_per_segment, baseline_interruption_rate, baseline_times_interrupted_per_meeting, baseline_times_interrupting_per_meeting, baseline_filler_words_per_minute, baseline_turn_taking_balance, meetings_included, baseline_type, baseline_clarity_score, baseline_confidence_score, baseline_attunement_score, avg_baseline_content_pillar_score, avg_baseline_poise_pillar_score, avg_baseline_connection_pillar_score'
        )
        .eq('user_id', userId)
        .eq('baseline_type', baselineType)
        .eq('is_active', true)
        .maybeSingle();
    });
  }

  /**
   * Get count of meetings where user is identified as a speaker
   * Uses user_speaker_label (not assigned_user_id) as the source of truth
   */
  async getMeetingCountForUser(userId: string): Promise<ApiResponse<any[]>> {
    return this.execute('getMeetingCountForUser', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('meetings')
        .select('id')
        .eq('user_id', userId)
        .not('user_speaker_label', 'is', null);
    });
  }

  /**
   * Get earliest meeting date where user is identified as a speaker
   * Uses user_speaker_label (not assigned_user_id) as the source of truth
   */
  async getEarliestMeetingDate(userId: string): Promise<ApiResponse<any>> {
    return this.execute('getEarliestMeetingDate', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('meetings')
        .select('start_time')
        .eq('user_id', userId)
        .not('user_speaker_label', 'is', null)
        .order('start_time', { ascending: true })
        .limit(1)
        .maybeSingle();
    });
  }

  /**
   * Get meetings for a week where user is identified as a speaker
   * Uses user_speaker_label (not assigned_user_id) as the source of truth
   */
  async getAssignedMeetingsForWeek(
    userId: string,
    weekStart: string,
    weekEnd: string
  ): Promise<ApiResponse<any[]>> {
    return this.execute('getAssignedMeetingsForWeek', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('meeting_analysis')
        .select(
          `
          job_id,
          meeting_id,
          speaker_label,
          meetings!inner(
            id,
            title,
            start_time,
            recording_filename,
            user_speaker_label
          )
        `
        )
        .eq('meetings.user_id', userId)
        .not('meetings.user_speaker_label', 'is', null)
        .gte('meetings.start_time', weekStart)
        .lte('meetings.start_time', weekEnd);
    });
  }

  /**
   * Get unassigned meeting IDs for a week
   * Also fetches auto-identification fields so caller can filter out auto-identified meetings
   */
  async getUnassignedMeetingsForWeek(
    userId: string,
    weekStart: string,
    weekEnd: string
  ): Promise<ApiResponse<any[]>> {
    return this.execute('getUnassignedMeetingsForWeek', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('meeting_analysis')
        .select(
          `
          job_id,
          assigned_user_id,
          meeting_id,
          meetings!inner(
            id,
            title,
            user_id,
            start_time,
            recording_filename,
            user_speaker_label
          )
        `
        )
        .eq('meetings.user_id', userId)
        .is('assigned_user_id', null)
        .gte('meetings.start_time', weekStart)
        .lte('meetings.start_time', weekEnd);
    });
  }

  /**
   * Get meeting-level metrics for charting
   * Uses user_speaker_label (not assigned_user_id) as the source of truth
   */
  async getMeetingLevelMetrics(
    userId: string,
    column: string,
    startDate: string,
    endDate: string
  ): Promise<ApiResponse<any[]>> {
    return this.execute('getMeetingLevelMetrics', async () => {
      const supabase = authService.getClient();

      const selectQuery = `
        meeting_id,
        speaker_label,
        ${column},
        meetings!inner(
          id,
          title,
          start_time,
          user_speaker_label
        )
      `;

      return supabase
        .from('meeting_analysis')
        .select(selectQuery)
        .eq('meetings.user_id', userId)
        .not('meetings.user_speaker_label', 'is', null)
        .gte('meetings.start_time', startDate)
        .lte('meetings.start_time', endDate);
    });
  }

  /**
   * Get dashboard stats for header display
   * Returns: total meetings, hours analyzed, meetings this month
   */
  async getDashboardStats(userId: string): Promise<
    ApiResponse<{
      totalMeetings: number;
      hoursAnalyzed: string;
      thisMonth: number;
    }>
  > {
    try {
      await this.ensureAuth();

      const supabase = authService.getClient();
      const startTime = Date.now();

      // Fetch meetings where user owns the meeting AND has identified themselves as a speaker
      const { data: meetings, error: meetingsError } = await supabase
        .from('meetings')
        .select('id, recording_duration_seconds, created_at')
        .eq('user_id', userId)
        .not('user_speaker_label', 'is', null);

      if (meetingsError) {
        console.error(
          '[API Proxy] getDashboardStats meetings error:',
          meetingsError
        );
        return { success: false, error: meetingsError.message };
      }

      if (!meetings || meetings.length === 0) {
        return {
          success: true,
          data: {
            totalMeetings: 0,
            hoursAnalyzed: '0:00',
            thisMonth: 0,
          },
        };
      }

      // Total meetings is the count of meetings returned
      const totalMeetings = meetings.length;

      // Calculate total hours analyzed
      let totalSeconds = 0;
      meetings.forEach((meeting: any) => {
        totalSeconds += meeting.recording_duration_seconds || 0;
      });

      // Format as H:MM
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.round((totalSeconds % 3600) / 60);
      const hoursAnalyzed = `${hours}:${minutes.toString().padStart(2, '0')}`;

      // Calculate meetings this month
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisMonth = meetings.filter((meeting: any) => {
        if (!meeting.created_at) return false;
        const createdAt = new Date(meeting.created_at);
        return createdAt >= firstDayOfMonth;
      }).length;

      const duration = Date.now() - startTime;
      console.log(`[API Proxy] getDashboardStats success (${duration}ms)`);

      return {
        success: true,
        data: {
          totalMeetings,
          hoursAnalyzed,
          thisMonth,
        },
      };
    } catch (error) {
      console.error('[API Proxy] getDashboardStats exception:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get global count of unassigned meetings (meetings without speaker identification)
   * Returns count + first meeting ID for navigation
   */
  async getGlobalUnassignedMeetings(userId: string): Promise<
    ApiResponse<{
      count: number;
      firstMeetingId: string | null;
    }>
  > {
    try {
      await this.ensureAuth();
      const supabase = authService.getClient();
      const startTime = Date.now();

      // Query meetings where:
      // 1. User owns the meeting
      // 2. Has a completed processing job
      // 3. user_speaker_label IS NULL (speaker not identified)
      const { data, error } = await supabase
        .from('meetings')
        .select(
          `
          id,
          start_time,
          processing_jobs!inner(status)
        `
        )
        .eq('user_id', userId)
        .is('user_speaker_label', null)
        .eq('processing_jobs.status', 'completed')
        .order('start_time', { ascending: false });

      if (error) {
        console.error('[API Proxy] getGlobalUnassignedMeetings error:', error);
        return { success: false, error: error.message };
      }

      const duration = Date.now() - startTime;
      console.log(
        `[API Proxy] getGlobalUnassignedMeetings success (${duration}ms) - found ${data?.length || 0} meetings`
      );

      return {
        success: true,
        data: {
          count: data?.length || 0,
          firstMeetingId: data?.[0]?.id || null,
        },
      };
    } catch (error) {
      console.error(
        '[API Proxy] getGlobalUnassignedMeetings exception:',
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Meetings API
 * Queries for meeting data
 */
export class MeetingsApi extends ApiProxyService {
  /**
   * Get user's meetings
   */
  async getMeetings(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      weekStart?: string;
    }
  ): Promise<ApiResponse<any[]>> {
    return this.execute('getMeetings', async () => {
      const supabase = authService.getClient();

      let query = supabase
        .from('meetings')
        .select(
          `
          *,
          meeting_analysis (
            overall_communication_score,
            pace_rating,
            clarity_rating,
            energy_rating,
            engagement_rating,
            analysis_complete
          )
        `
        )
        .eq('user_id', userId)
        .order('meeting_date', { ascending: false });

      if (options?.weekStart) {
        const weekEnd = new Date(options.weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        query = query
          .gte('meeting_date', options.weekStart)
          .lt('meeting_date', weekEnd.toISOString().split('T')[0]);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.range(
          options.offset,
          options.offset + (options.limit || 10) - 1
        );
      }

      return query;
    });
  }

  /**
   * Get single meeting by ID
   */
  async getMeeting(meetingId: string): Promise<ApiResponse<any>> {
    return this.execute('getMeeting', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('meetings')
        .select(
          `
          *,
          meeting_analysis (*),
          meeting_participants (*),
          transcripts (*)
        `
        )
        .eq('id', meetingId)
        .single();
    });
  }

  /**
   * Get meeting transcript from dedicated transcripts table
   */
  async getTranscript(meetingId: string): Promise<ApiResponse<any>> {
    return this.execute('getTranscript', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('transcripts')
        .select('*')
        .eq('meeting_id', meetingId)
        .single();
    });
  }

  /**
   * Delete meeting
   */
  async deleteMeeting(meetingId: string): Promise<ApiResponse<void>> {
    return this.execute('deleteMeeting', async () => {
      const supabase = authService.getClient();
      return supabase.from('meetings').delete().eq('id', meetingId);
    });
  }

  /**
   * Update meeting title
   */
  async updateMeetingTitle(
    meetingId: string,
    title: string
  ): Promise<ApiResponse<any>> {
    return this.execute('updateMeetingTitle', async () => {
      const supabase = authService.getClient();
      return supabase
        .from('meetings')
        .update({ title })
        .eq('id', meetingId)
        .select()
        .single();
    });
  }

  /**
   * Get meetings with analysis data for a user
   * Comprehensive fetch for useMeetingData hook
   */
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
    try {
      await this.ensureAuth();

      const supabase = authService.getClient();
      const startTime = Date.now();

      const limit = options?.limit ?? 10;
      const offset = options?.offset ?? 0;

      // Fetch meetings with pagination (fetch limit + 1 to detect if more exist)
      const { data: meetings, error: meetingsError } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_id', userId)
        .order('start_time', { ascending: false })
        .range(offset, offset + limit);

      if (meetingsError) {
        console.error(
          '[API Proxy] getMeetingsWithAnalysis meetings error:',
          meetingsError
        );
        return { success: false, error: meetingsError.message };
      }

      // Determine if there are more meetings
      const hasMore = (meetings?.length || 0) > limit;
      const meetingsToReturn = hasMore ? meetings?.slice(0, limit) : meetings;
      const userMeetingIds = meetingsToReturn?.map((m) => m.id) || [];

      // Fetch jobs for user's meetings
      const {
        data: jobs,
        error: jobsError,
      }: { data: any[] | null; error: any } =
        userMeetingIds.length > 0
          ? await supabase
              .from('processing_jobs')
              .select('*')
              .in('meeting_id', userMeetingIds)
              .order('created_at', { ascending: false })
          : { data: [], error: null };

      if (jobsError) {
        console.error(
          '[API Proxy] getMeetingsWithAnalysis jobs error:',
          jobsError
        );
        return { success: false, error: jobsError.message };
      }

      // Fetch analyses for user's meetings
      const {
        data: analyses,
        error: analysesError,
      }: { data: any[] | null; error: any } =
        userMeetingIds.length > 0
          ? await supabase
              .from('meeting_analysis')
              .select(
                'meeting_id, job_id, speaker_label, assigned_user_id, custom_speaker_name, clarity_score, confidence_score, attunement_score'
              )
              .in('meeting_id', userMeetingIds)
          : { data: [], error: null };

      if (analysesError) {
        console.error(
          '[API Proxy] getMeetingsWithAnalysis analyses error:',
          analysesError
        );
        return { success: false, error: analysesError.message };
      }

      const duration = Date.now() - startTime;
      console.log(
        `[API Proxy] getMeetingsWithAnalysis success (${duration}ms)`
      );

      return {
        success: true,
        data: {
          meetings: meetingsToReturn || [],
          jobs: jobs || [],
          analyses: analyses || [],
          hasMore,
        },
      };
    } catch (error) {
      console.error('[API Proxy] getMeetingsWithAnalysis exception:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create a new meeting
   */
  async createMeeting(meetingData: {
    user_id: string;
    title: string;
    start_time: string;
    end_time?: string;
    source?: string;
  }): Promise<ApiResponse<any>> {
    return this.execute('createMeeting', async () => {
      const supabase = authService.getClient();
      return supabase.from('meetings').insert(meetingData).select().single();
    });
  }

  /**
   * Update an existing meeting
   */
  async updateMeeting(
    meetingId: string,
    updates: {
      title?: string;
      start_time?: string;
      end_time?: string | null;
    }
  ): Promise<ApiResponse<any>> {
    return this.execute('updateMeeting', async () => {
      const supabase = authService.getClient();
      return supabase
        .from('meetings')
        .update(updates)
        .eq('id', meetingId)
        .select()
        .single();
    });
  }

  /**
   * Check if a meeting exists (for deletion check)
   */
  async meetingExists(meetingId: string): Promise<ApiResponse<boolean>> {
    try {
      await this.ensureAuth();
      const supabase = authService.getClient();

      const { data, error } = await supabase
        .from('meetings')
        .select('id')
        .eq('id', meetingId)
        .maybeSingle();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: !!data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get meeting data for reprocess verification
   * Returns meeting with processing_jobs for reprocess checks
   */
  async getMeetingForReprocess(
    meetingId: string,
    userId: string
  ): Promise<ApiResponse<any>> {
    return this.execute('getMeetingForReprocess', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('meetings')
        .select(
          `
          id,
          user_id,
          title,
          audio_storage_path,
          recording_filename,
          processing_jobs (
            id,
            status,
            processing_error
          )
        `
        )
        .eq('id', meetingId)
        .eq('user_id', userId)
        .single();
    });
  }

  /**
   * Get full meeting data for analysis page
   * Batches meeting, job, analysis, transcript, and user data in one call
   */
  async getMeetingAnalysisPageData(meetingId: string): Promise<
    ApiResponse<{
      meeting: any;
      job: any;
      analyses: any[];
      transcript: {
        segments: any[];
        speakers: string[];
        duration_seconds: number;
      } | null;
      userFullName: string | null;
    }>
  > {
    try {
      await this.ensureAuth();

      const supabase = authService.getClient();
      const startTime = Date.now();

      // Fetch meeting
      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', meetingId)
        .single();

      if (meetingError) {
        return { success: false, error: meetingError.message };
      }

      // Fetch most recent job for this meeting
      const { data: job, error: jobError } = await supabase
        .from('processing_jobs')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (jobError) {
        return { success: false, error: jobError.message };
      }

      // Fetch analyses (without transcript_segments - now in transcripts table)
      const {
        data: analyses,
        error: analysesError,
      }: { data: any[] | null; error: any } = job
        ? await supabase
            .from('meeting_analysis')
            .select(
              'id, job_id, meeting_id, created_by, speaker_label, assigned_user_id, custom_speaker_name, identification_confidence, summary, general_overview, talk_time_seconds, talk_time_percentage, word_count, words_per_minute, segments_count, avg_response_latency_seconds, response_count, quick_responses_percentage, times_interrupted, times_interrupting, interruption_rate, turn_taking_balance, communication_tips, behavioral_insights, clarity_score, clarity_explanation, confidence_score, confidence_explanation, attunement_score, attunement_explanation, created_at, updated_at'
            )
            .eq('job_id', job.id)
        : { data: [], error: null };

      if (analysesError) {
        return { success: false, error: analysesError.message };
      }

      // Fetch transcript from dedicated transcripts table
      const { data: transcript, error: transcriptError } = await supabase
        .from('transcripts')
        .select('segments, speakers, duration_seconds')
        .eq('meeting_id', meetingId)
        .maybeSingle();

      if (transcriptError) {
        console.error(
          '[API Proxy] getMeetingAnalysisPageData transcript error:',
          transcriptError
        );
        // Don't fail the whole request if transcript is missing
      }

      // Fetch user's full name
      let userFullName: string | null = null;
      if (meeting.user_id) {
        const { data: userData } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', meeting.user_id)
          .single();

        if (userData?.full_name) {
          userFullName = userData.full_name;
        }
      }

      const duration = Date.now() - startTime;
      console.log(
        `[API Proxy] getMeetingAnalysisPageData success (${duration}ms)`
      );

      return {
        success: true,
        data: {
          meeting,
          job,
          analyses: analyses || [],
          transcript: transcript || null,
          userFullName,
        },
      };
    } catch (error) {
      console.error('[API Proxy] getMeetingAnalysisPageData exception:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get analysis panel data by job ID
   * Used by AnalysisPanel component - bundles job, meeting, transcript, and analysis data
   */
  async getAnalysisPanelData(jobId: string): Promise<
    ApiResponse<{
      job: any;
      meeting: any;
      speakerRecords: any[];
      transcript: any;
      userFullName: string | null;
    }>
  > {
    try {
      await this.ensureAuth();

      const supabase = authService.getClient();
      const startTime = Date.now();

      // Fetch job data
      const { data: job, error: jobError } = await supabase
        .from('processing_jobs')
        .select('id, meeting_id, created_at')
        .eq('id', jobId)
        .single();

      if (jobError) {
        return { success: false, error: jobError.message };
      }

      // Fetch meeting metadata if job has meeting_id
      let meeting = null;
      let transcript = null;
      if (job?.meeting_id) {
        const { data: meetingData, error: meetingError } = await supabase
          .from('meetings')
          .select('id, created_at, title, off_record_periods, attendees')
          .eq('id', job.meeting_id)
          .single();

        if (!meetingError) {
          meeting = meetingData;
        }

        // Fetch transcript from dedicated transcripts table
        const { data: transcriptData, error: transcriptError } = await supabase
          .from('transcripts')
          .select('segments, speakers, duration_seconds')
          .eq('meeting_id', job.meeting_id)
          .single();

        if (!transcriptError) {
          transcript = transcriptData;
        }
      }

      // Fetch speaker analysis records (without transcript_segments - now in transcripts table)
      const { data: speakerRecords, error: analysisError } = await supabase
        .from('meeting_analysis')
        .select(
          'id, job_id, created_by, speaker_label, assigned_user_id, custom_speaker_name, identification_confidence, summary, general_overview, talk_time_seconds, talk_time_percentage, word_count, words_per_minute, segments_count, avg_response_latency_seconds, response_count, quick_responses_percentage, times_interrupted, times_interrupting, interruption_rate, turn_taking_balance, communication_tips, behavioral_insights, clarity_score, clarity_explanation, confidence_score, confidence_explanation, attunement_score, attunement_explanation, created_at'
        )
        .eq('job_id', jobId);

      if (analysisError) {
        return { success: false, error: analysisError.message };
      }

      // Get current user's full name from session
      const { data: sessionData } = await supabase.auth.getSession();
      let userFullName: string | null = null;

      if (sessionData?.session?.user?.id) {
        const { data: userData } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', sessionData.session.user.id)
          .single();

        userFullName = userData?.full_name || null;
      }

      const duration = Date.now() - startTime;
      console.log(`[API Proxy] getAnalysisPanelData success (${duration}ms)`);

      return {
        success: true,
        data: {
          job,
          meeting,
          speakerRecords: speakerRecords || [],
          transcript,
          userFullName,
        },
      };
    } catch (error) {
      console.error('[API Proxy] getAnalysisPanelData exception:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * User API
 * User profile and subscription data
 */
export class UserApi extends ApiProxyService {
  /**
   * Get user profile
   */
  async getProfile(userId: string): Promise<ApiResponse<any>> {
    return this.execute('getProfile', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();
    });
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    updates: Record<string, any>
  ): Promise<ApiResponse<any>> {
    return this.execute('updateProfile', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
    });
  }

  /**
   * Get subscription status
   */
  async getSubscription(userId: string): Promise<ApiResponse<any>> {
    return this.execute('getSubscription', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .single();
    });
  }

  /**
   * Get current user's subscription from subscriptions table
   * Used by subscriptionApi.getCurrent in the dashboard
   */
  async getCurrentSubscription(userId: string): Promise<ApiResponse<any>> {
    try {
      await this.ensureAuth();

      const supabase = authService.getClient();

      // Fetch subscription from database
      const { data: subscriptions, error: dbError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (dbError) {
        console.error('[API Proxy] getCurrentSubscription error:', dbError);
        return { success: false, error: dbError.message };
      }

      // If no subscriptions found
      if (!subscriptions || subscriptions.length === 0) {
        return { success: true, data: null };
      }

      const subscription = subscriptions[0];

      // Build discount info from DB fields if available
      const discount =
        subscription.discount_percent_off !== null ||
        subscription.discount_amount_off !== null
          ? {
              couponId: subscription.stripe_coupon_id || '',
              percentOff: subscription.discount_percent_off,
              amountOff: subscription.discount_amount_off,
              currency: null as string | null,
              duration: subscription.discount_duration,
              durationInMonths: subscription.discount_duration_months,
              validUntil: subscription.discount_end,
            }
          : null;

      // Return subscription data in SubscriptionResponse format
      return {
        success: true,
        data: {
          id: subscription.id,
          user_id: subscription.user_id,
          stripe_subscription_id: subscription.stripe_subscription_id || '',
          stripe_customer_id: subscription.stripe_customer_id || '',
          planType: subscription.plan_type,
          status: subscription.status,
          currentPeriodStart: subscription.current_period_start || '',
          currentPeriodEnd: subscription.current_period_end || '',
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          trialStart: subscription.trial_start,
          trialEnd: subscription.trial_end,
          canceledAt: subscription.canceled_at,
          created_at: subscription.created_at,
          updated_at: subscription.updated_at,
          discount,
          upcomingInvoice: null,
        },
      };
    } catch (error) {
      console.error('[API Proxy] getCurrentSubscription exception:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get user's full name from users table
   */
  async getUserFullName(userId: string): Promise<ApiResponse<string | null>> {
    try {
      await this.ensureAuth();

      const supabase = authService.getClient();

      const { data, error } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('[API Proxy] getUserFullName error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data?.full_name || null };
    } catch (error) {
      console.error('[API Proxy] getUserFullName exception:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Analysis API
 * Queries for meeting analysis and speaker assignment
 */
export class AnalysisApi extends ApiProxyService {
  /**
   * Get meeting analysis records by job ID
   */
  async getMeetingAnalysisByJobId(jobId: string): Promise<ApiResponse<any[]>> {
    return this.execute('getMeetingAnalysisByJobId', async () => {
      const supabase = authService.getClient();

      return supabase.from('meeting_analysis').select('*').eq('job_id', jobId);
    });
  }

  /**
   * Get meeting analysis records by meeting ID
   */
  async getMeetingAnalysisByMeetingId(
    meetingId: string
  ): Promise<ApiResponse<any[]>> {
    return this.execute('getMeetingAnalysisByMeetingId', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('meeting_analysis')
        .select('*')
        .eq('meeting_id', meetingId);
    });
  }

  /**
   * Get the Monday (ISO week start) for a given date string
   */
  private getWeekStart(dateString: string): string {
    const date = new Date(dateString);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    const year = monday.getFullYear();
    const month = String(monday.getMonth() + 1).padStart(2, '0');
    const dayStr = String(monday.getDate()).padStart(2, '0');
    return `${year}-${month}-${dayStr}`;
  }

  /**
   * Get meeting info from a processing job ID
   */
  private async getMeetingInfo(jobId: string): Promise<{
    id: string;
    start_time: string;
    user_speaker_label: string | null;
  } | null> {
    const supabase = authService.getClient();
    const { data, error } = await supabase
      .from('processing_jobs')
      .select('meetings!inner(id, start_time, user_speaker_label)')
      .eq('id', jobId)
      .single();

    if (error || !data) {
      console.error('[API Proxy] Failed to get meeting info:', error);
      return null;
    }

    // The join returns meetings as an object (due to !inner single relation)
    const meetings = data.meetings as unknown as {
      id: string;
      start_time: string;
      user_speaker_label: string | null;
    } | null;
    return meetings || null;
  }

  /**
   * Clear auto-identification from meetings table if the speaker label matches
   */
  private async clearAutoIdentification(
    meetingId: string,
    speakerLabel: string,
    userSpeakerLabel: string | null
  ): Promise<void> {
    if (userSpeakerLabel && speakerLabel === userSpeakerLabel) {
      const supabase = authService.getClient();
      const { error } = await supabase
        .from('meetings')
        .update({
          user_speaker_label: null,
        })
        .eq('id', meetingId);

      if (error) {
        console.error(
          '[API Proxy] Failed to clear auto-identification:',
          error
        );
      }
    }
  }

  /**
   * Recalculate weekly rollup for a user after assignment changes
   */
  private async recalculateRollup(
    userId: string,
    meetingStartTime: string
  ): Promise<void> {
    const supabase = authService.getClient();
    const weekStart = this.getWeekStart(meetingStartTime);
    const { error } = await supabase.rpc('calculate_user_weekly_rollup', {
      p_user_id: userId,
      p_week_start: weekStart,
    });

    if (error) {
      console.error('[API Proxy] Failed to recalculate weekly rollup:', error);
    }
  }

  /**
   * Assign a speaker to a user ("This is me" functionality)
   */
  async assignSpeaker(
    jobId: string,
    speakerLabel: string,
    userId: string
  ): Promise<ApiResponse<void>> {
    return this.execute('assignSpeaker', async () => {
      const supabase = authService.getClient();

      // Get meeting info first
      const meetingInfo = await this.getMeetingInfo(jobId);
      if (!meetingInfo) {
        return { error: { message: 'Meeting not found' } };
      }

      const result = await supabase
        .from('meeting_analysis')
        .update({
          assigned_user_id: userId,
          custom_speaker_name: null,
        })
        .eq('job_id', jobId)
        .eq('speaker_label', speakerLabel);

      if (!result.error) {
        // Also update user_speaker_label on the meeting so it becomes the single source of truth
        const { error: meetingUpdateError } = await supabase
          .from('meetings')
          .update({
            user_speaker_label: speakerLabel,
          })
          .eq('id', meetingInfo.id);

        if (meetingUpdateError) {
          console.error(
            '[API Proxy] Failed to update user_speaker_label:',
            meetingUpdateError
          );
        }

        // Recalculate weekly rollup for the newly assigned user
        await this.recalculateRollup(userId, meetingInfo.start_time);
      }

      return result;
    });
  }

  /**
   * Assign a custom name to a speaker
   */
  async assignCustomName(
    jobId: string,
    speakerLabel: string,
    name: string
  ): Promise<ApiResponse<void>> {
    return this.execute('assignCustomName', async () => {
      const supabase = authService.getClient();

      // Get the current assignment before clearing (to recalculate their rollup)
      const { data: currentData } = await supabase
        .from('meeting_analysis')
        .select('assigned_user_id')
        .eq('job_id', jobId)
        .eq('speaker_label', speakerLabel)
        .single();

      const previousUserId = currentData?.assigned_user_id;

      const result = await supabase
        .from('meeting_analysis')
        .update({
          custom_speaker_name: name,
          assigned_user_id: null,
        })
        .eq('job_id', jobId)
        .eq('speaker_label', speakerLabel);

      // Get meeting info for rollup recalculation and auto-identification clearing
      if (!result.error) {
        const meetingInfo = await this.getMeetingInfo(jobId);
        if (meetingInfo) {
          // Clear auto-identification if this speaker was auto-identified as the user
          await this.clearAutoIdentification(
            meetingInfo.id,
            speakerLabel,
            meetingInfo.user_speaker_label
          );

          // Recalculate weekly rollup for the previously assigned user (if any)
          if (previousUserId) {
            await this.recalculateRollup(
              previousUserId,
              meetingInfo.start_time
            );
          }
        }
      }

      return result;
    });
  }

  /**
   * Unassign a speaker (clear both user assignment and custom name)
   */
  async unassignSpeaker(
    jobId: string,
    speakerLabel: string
  ): Promise<ApiResponse<void>> {
    return this.execute('unassignSpeaker', async () => {
      const supabase = authService.getClient();

      // Get the current assignment before clearing (to recalculate their rollup)
      const { data: currentData } = await supabase
        .from('meeting_analysis')
        .select('assigned_user_id')
        .eq('job_id', jobId)
        .eq('speaker_label', speakerLabel)
        .single();

      const previousUserId = currentData?.assigned_user_id;

      const result = await supabase
        .from('meeting_analysis')
        .update({
          assigned_user_id: null,
          custom_speaker_name: null,
        })
        .eq('job_id', jobId)
        .eq('speaker_label', speakerLabel);

      // Get meeting info for rollup recalculation and auto-identification clearing
      if (!result.error) {
        const meetingInfo = await this.getMeetingInfo(jobId);
        if (meetingInfo) {
          // Clear auto-identification if this speaker was auto-identified as the user
          await this.clearAutoIdentification(
            meetingInfo.id,
            speakerLabel,
            meetingInfo.user_speaker_label
          );

          // Recalculate weekly rollup for the previously assigned user
          if (previousUserId) {
            await this.recalculateRollup(
              previousUserId,
              meetingInfo.start_time
            );
          }
        }
      }

      return result;
    });
  }

  /**
   * Auto-assign speaker to user based on confidence threshold
   */
  async autoAssignSpeaker(
    analysisId: string,
    userId: string
  ): Promise<ApiResponse<void>> {
    return this.execute('autoAssignSpeaker', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('meeting_analysis')
        .update({ assigned_user_id: userId })
        .eq('id', analysisId);
    });
  }

  /**
   * Get weekly analysis records for a user (for WeeklyMetricsOverview)
   */
  async getWeeklyAnalysisRecords(
    userId: string,
    sinceDate: string
  ): Promise<ApiResponse<any[]>> {
    return this.execute('getWeeklyAnalysisRecords', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('meeting_analysis')
        .select(
          `
          talk_time_percentage,
          words_per_minute,
          avg_response_latency_seconds,
          times_interrupting,
          communication_tips,
          created_at
        `
        )
        .eq('assigned_user_id', userId)
        .gte('created_at', sinceDate);
    });
  }

  /**
   * Claim anonymous meetings for a user (RPC call)
   */
  async claimAnonymousMeetings(
    userId: string,
    email: string,
    selectedSpeaker?: string
  ): Promise<ApiResponse<any[]>> {
    return this.executeRpc(
      'claimAnonymousMeetings',
      'claim_anonymous_meetings',
      {
        p_user_id: userId,
        p_email: email,
        p_selected_speaker: selectedSpeaker || undefined,
      }
    );
  }
}

/**
 * Analytics API
 * Logs events to user_event_log table
 */
export class AnalyticsApi extends ApiProxyService {
  /**
   * Log an analytics event to the database
   */
  async logEvent(
    userId: string,
    eventName: string,
    payload?: Record<string, any>
  ): Promise<ApiResponse<void>> {
    return this.execute('logEvent', async () => {
      const supabase = authService.getClient();

      return supabase.from('user_event_log').insert({
        user_id: userId,
        event_name: eventName,
        payload: payload || null,
      });
    });
  }
}

/**
 * Processing Jobs API
 * Queries for job status and processing operations
 */
export class ProcessingJobsApi extends ApiProxyService {
  /**
   * Get job by job ID
   */
  async getJobById(jobId: string): Promise<ApiResponse<any>> {
    return this.execute('getJobById', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('processing_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
    });
  }

  /**
   * Get job by meeting ID
   */
  async getJobByMeetingId(meetingId: string): Promise<ApiResponse<any>> {
    return this.execute('getJobByMeetingId', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('processing_jobs')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
    });
  }

  /**
   * Get jobs by meeting IDs (for batch operations)
   */
  async getJobsByMeetingIds(meetingIds: string[]): Promise<ApiResponse<any[]>> {
    return this.execute('getJobsByMeetingIds', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('processing_jobs')
        .select('*')
        .in('meeting_id', meetingIds)
        .order('created_at', { ascending: false });
    });
  }

  /**
   * Poll job status by meeting IDs (lightweight - only returns status)
   */
  async pollJobStatus(
    meetingIds: string[]
  ): Promise<
    ApiResponse<{ id: string; meeting_id: string; status: string }[]>
  > {
    return this.execute('pollJobStatus', async () => {
      const supabase = authService.getClient();

      return supabase
        .from('processing_jobs')
        .select('id, meeting_id, status')
        .in('meeting_id', meetingIds)
        .order('created_at', { ascending: false });
    });
  }

  /**
   * Update job status (for reprocessing)
   */
  async updateJobStatus(
    jobId: string,
    status: string,
    errorMessage?: string
  ): Promise<ApiResponse<void>> {
    return this.execute('updateJobStatus', async () => {
      const supabase = authService.getClient();

      const updates: any = { status };
      if (errorMessage !== undefined) {
        updates.error_message = errorMessage;
      }

      return supabase.from('processing_jobs').update(updates).eq('id', jobId);
    });
  }

  /**
   * Delete jobs by IDs
   */
  async deleteJobsByIds(jobIds: string[]): Promise<ApiResponse<void>> {
    return this.execute('deleteJobsByIds', async () => {
      const supabase = authService.getClient();

      return supabase.from('processing_jobs').delete().in('id', jobIds);
    });
  }
}

/**
 * Storage API
 * File storage operations
 */
export class StorageApi extends ApiProxyService {
  /**
   * Delete a recording file from storage
   */
  async deleteRecording(storagePath: string): Promise<ApiResponse<void>> {
    try {
      await this.ensureAuth();

      const supabase = authService.getClient();
      const { error } = await supabase.storage
        .from('recordings')
        .remove([storagePath]);

      if (error) {
        console.error('[API Proxy] deleteRecording error:', error);
        return {
          success: false,
          error: error.message,
        };
      }

      return { success: true };
    } catch (error) {
      console.error('[API Proxy] deleteRecording exception:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Export singleton instances
export const dashboardApi = new DashboardApi();
export const meetingsApi = new MeetingsApi();
export const userApi = new UserApi();
export const analysisApi = new AnalysisApi();
export const analyticsProxyApi = new AnalyticsApi();
export const processingJobsApi = new ProcessingJobsApi();
export const storageApi = new StorageApi();
