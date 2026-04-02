import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../database.types';
import { DataAdapter, User, ProcessingJob, MeetingAnalysis } from '../types';

export class SupabaseDataAdapter implements DataAdapter {
  private supabase: SupabaseClient<Database>;

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    options?: { auth?: { persistSession: boolean } }
  ) {
    this.supabase = createClient<Database>(supabaseUrl, supabaseKey, options);
  }

  // ============================================================================
  // Users
  // ============================================================================

  async getUser(id: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching user:', error);
      return null;
    }

    return data;
  }

  async saveUser(user: User): Promise<void> {
    const { error } = await this.supabase.from('users').insert(user);

    if (error) {
      console.error('Error saving user:', error);
      throw error;
    }
  }

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
    const { error } = await this.supabase
      .from('users')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  // ============================================================================
  // Processing Jobs
  // ============================================================================

  async getProcessingJobs(userId?: string): Promise<ProcessingJob[]> {
    let query = this.supabase.from('processing_jobs').select('*');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.order('created_at', {
      ascending: false,
    });

    if (error) {
      console.error('Error fetching processing jobs:', error);
      return [];
    }

    return data.map(this.mapProcessingJobFromDatabase);
  }

  async getProcessingJob(id: string): Promise<ProcessingJob | null> {
    const { data, error } = await this.supabase
      .from('processing_jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching processing job:', error);
      return null;
    }

    return this.mapProcessingJobFromDatabase(data);
  }

  async saveProcessingJob(job: ProcessingJob): Promise<void> {
    const dbJob = this.mapProcessingJobToDatabase(job);
    const { error } = await this.supabase.from('processing_jobs').insert(dbJob);

    if (error) {
      console.error('Error saving processing job:', error);
      throw error;
    }
  }

  async updateProcessingJob(
    id: string,
    updates: Partial<ProcessingJob>
  ): Promise<void> {
    const dbUpdates = this.mapProcessingJobToDatabase(updates as ProcessingJob);
    const { error } = await this.supabase
      .from('processing_jobs')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('Error updating processing job:', error);
      throw error;
    }
  }

  async deleteProcessingJob(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('processing_jobs')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting processing job:', error);
      throw error;
    }
  }

  // ============================================================================
  // Meeting Analysis
  // ============================================================================

  async getMeetingAnalysis(jobId: string): Promise<MeetingAnalysis | null> {
    const { data, error } = await this.supabase
      .from('meeting_analysis')
      .select('*')
      .eq('job_id', jobId)
      .single();

    if (error) {
      console.error('Error fetching meeting analysis:', error);
      return null;
    }

    return data;
  }

  async getMeetingAnalysesByUser(userId: string): Promise<MeetingAnalysis[]> {
    const { data, error } = await this.supabase
      .from('meeting_analysis')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching meeting analyses by user:', error);
      return [];
    }

    return data;
  }

  async saveMeetingAnalysis(analysis: MeetingAnalysis): Promise<void> {
    const { error } = await this.supabase
      .from('meeting_analysis')
      .insert(analysis);

    if (error) {
      console.error('Error saving meeting analysis:', error);
      throw error;
    }
  }

  async deleteMeetingAnalysis(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('meeting_analysis')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting meeting analysis:', error);
      throw error;
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private mapProcessingJobFromDatabase(
    dbJob: Database['public']['Tables']['processing_jobs']['Row']
  ): ProcessingJob {
    return {
      id: dbJob.id,
      storage_path: dbJob.storage_path ?? undefined,
      original_filename: dbJob.original_filename ?? undefined,
      status: dbJob.status,
      processing_error: dbJob.processing_error ?? undefined,
      python_job_id: dbJob.python_job_id ?? undefined,
      user_id: dbJob.user_id,
      file_size_mb: dbJob.file_size_mb ?? undefined,
      duration_seconds: dbJob.duration_seconds ?? undefined,
      delete_after: dbJob.delete_after ?? undefined,
      created_at: dbJob.created_at ?? new Date().toISOString(),
      updated_at: dbJob.updated_at ?? new Date().toISOString(),
    };
  }

  private mapProcessingJobToDatabase(
    job: ProcessingJob
  ): Database['public']['Tables']['processing_jobs']['Insert'] {
    return {
      id: job.id,
      storage_path: job.storage_path ?? null,
      original_filename: job.original_filename ?? null,
      status: job.status,
      processing_error: job.processing_error ?? null,
      python_job_id: job.python_job_id ?? null,
      user_id: job.user_id,
      file_size_mb: job.file_size_mb ?? null,
      duration_seconds: job.duration_seconds ?? null,
      delete_after: job.delete_after ?? null,
      created_at: job.created_at,
      updated_at: job.updated_at,
    };
  }
}
