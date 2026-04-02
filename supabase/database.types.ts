export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      anonymous_uploads: {
        Row: {
          access_token: string | null
          claimed_at: string | null
          claimed_by_user_id: string | null
          created_at: string | null
          email: string
          email_sent_at: string | null
          email_status: string | null
          file_hash: string | null
          id: string
          ip_address: string | null
          meeting_id: string | null
          normalized_email: string
          rate_limit_key: string | null
          updated_at: string | null
          uploaded_at: string | null
          user_agent: string | null
        }
        Insert: {
          access_token?: string | null
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string | null
          email: string
          email_sent_at?: string | null
          email_status?: string | null
          file_hash?: string | null
          id?: string
          ip_address?: string | null
          meeting_id?: string | null
          normalized_email: string
          rate_limit_key?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
          user_agent?: string | null
        }
        Update: {
          access_token?: string | null
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string | null
          email?: string
          email_sent_at?: string | null
          email_status?: string | null
          file_hash?: string | null
          id?: string
          ip_address?: string | null
          meeting_id?: string | null
          normalized_email?: string
          rate_limit_key?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anonymous_uploads_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_users: {
        Row: {
          allowed_uploads: number | null
          created_at: string | null
          email: string
          id: string
          normalized_email: string
          notes: string | null
          updated_at: string | null
          uploads_used: number | null
        }
        Insert: {
          allowed_uploads?: number | null
          created_at?: string | null
          email: string
          id?: string
          normalized_email: string
          notes?: string | null
          updated_at?: string | null
          uploads_used?: number | null
        }
        Update: {
          allowed_uploads?: number | null
          created_at?: string | null
          email?: string
          id?: string
          normalized_email?: string
          notes?: string | null
          updated_at?: string | null
          uploads_used?: number | null
        }
        Relationships: []
      }
      daily_topics: {
        Row: {
          created_at: string
          id: string
          topic_date: string
          topic_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          topic_date: string
          topic_name: string
        }
        Update: {
          created_at?: string
          id?: string
          topic_date?: string
          topic_name?: string
        }
        Relationships: []
      }
      email_signups: {
        Row: {
          created_at: string | null
          email: string
          id: string
          ip_address: string | null
          normalized_email: string
          signup_source: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          ip_address?: string | null
          normalized_email: string
          signup_source?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          ip_address?: string | null
          normalized_email?: string
          signup_source?: string | null
        }
        Relationships: []
      }
      games: {
        Row: {
          access_token: string
          audio_storage_path: string
          clarity_score: number | null
          confidence_score: number | null
          created_at: string | null
          id: string
          processing_error: string | null
          recording_duration_seconds: number | null
          recording_size_mb: number | null
          shareable_quote: string | null
          slide_ids: Json | null
          status: string
          tips: Json | null
          title: string
          topic_date: string | null
          transcript: string | null
          updated_at: string | null
          user_id: string | null
          video_storage_path: string | null
          word_count: number | null
          words_per_minute: number | null
        }
        Insert: {
          access_token?: string
          audio_storage_path: string
          clarity_score?: number | null
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          processing_error?: string | null
          recording_duration_seconds?: number | null
          recording_size_mb?: number | null
          shareable_quote?: string | null
          slide_ids?: Json | null
          status?: string
          tips?: Json | null
          title?: string
          topic_date?: string | null
          transcript?: string | null
          updated_at?: string | null
          user_id?: string | null
          video_storage_path?: string | null
          word_count?: number | null
          words_per_minute?: number | null
        }
        Update: {
          access_token?: string
          audio_storage_path?: string
          clarity_score?: number | null
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          processing_error?: string | null
          recording_duration_seconds?: number | null
          recording_size_mb?: number | null
          shareable_quote?: string | null
          slide_ids?: Json | null
          status?: string
          tips?: Json | null
          title?: string
          topic_date?: string | null
          transcript?: string | null
          updated_at?: string | null
          user_id?: string | null
          video_storage_path?: string | null
          word_count?: number | null
          words_per_minute?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "games_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_analysis: {
        Row: {
          apologies_breakdown: Json | null
          apologies_total: number | null
          assigned_user_id: string | null
          attunement_explanation: string | null
          attunement_score: number | null
          avg_response_latency_seconds: number | null
          avg_topics_per_segment: number | null
          behavioral_insights: Json | null
          clarity_explanation: string | null
          clarity_score: number | null
          communication_tips: Json | null
          confidence_explanation: string | null
          confidence_score: number | null
          connection_pillar_score: number | null
          content_pillar_score: number | null
          created_at: string | null
          created_by: string
          custom_speaker_name: string | null
          filler_words_breakdown: Json | null
          filler_words_per_minute: number | null
          filler_words_total: number | null
          general_overview: string | null
          hedge_phrases_breakdown: Json | null
          hedge_phrases_per_minute: number | null
          hedge_phrases_total: number | null
          id: string
          identification_confidence: number | null
          incomplete_thoughts_count: number | null
          incomplete_thoughts_percentage: number | null
          interruption_rate: number | null
          job_id: string | null
          key_point_position: number | null
          key_point_summary: string | null
          longest_segment_seconds: number | null
          max_topics_in_segment: number | null
          meeting_id: string | null
          poise_pillar_score: number | null
          quick_responses_percentage: number | null
          response_count: number | null
          segments_count: number
          signposting_breakdown: Json | null
          signposting_per_segment: number | null
          signposting_total: number | null
          softeners_breakdown: Json | null
          softeners_per_minute: number | null
          softeners_total: number | null
          speaker_label: string
          specificity_details: Json | null
          specificity_score: number | null
          summary: string | null
          talk_time_percentage: number
          talk_time_seconds: number
          talk_time_status:
            | Database["public"]["Enums"]["talk_time_status"]
            | null
          talk_time_vs_expected: number | null
          times_interrupted: number | null
          times_interrupting: number | null
          turn_taking_balance: number | null
          updated_at: string | null
          verbosity: number | null
          word_count: number
          words_per_minute: number | null
        }
        Insert: {
          apologies_breakdown?: Json | null
          apologies_total?: number | null
          assigned_user_id?: string | null
          attunement_explanation?: string | null
          attunement_score?: number | null
          avg_response_latency_seconds?: number | null
          avg_topics_per_segment?: number | null
          behavioral_insights?: Json | null
          clarity_explanation?: string | null
          clarity_score?: number | null
          communication_tips?: Json | null
          confidence_explanation?: string | null
          confidence_score?: number | null
          connection_pillar_score?: number | null
          content_pillar_score?: number | null
          created_at?: string | null
          created_by: string
          custom_speaker_name?: string | null
          filler_words_breakdown?: Json | null
          filler_words_per_minute?: number | null
          filler_words_total?: number | null
          general_overview?: string | null
          hedge_phrases_breakdown?: Json | null
          hedge_phrases_per_minute?: number | null
          hedge_phrases_total?: number | null
          id?: string
          identification_confidence?: number | null
          incomplete_thoughts_count?: number | null
          incomplete_thoughts_percentage?: number | null
          interruption_rate?: number | null
          job_id?: string | null
          key_point_position?: number | null
          key_point_summary?: string | null
          longest_segment_seconds?: number | null
          max_topics_in_segment?: number | null
          meeting_id?: string | null
          poise_pillar_score?: number | null
          quick_responses_percentage?: number | null
          response_count?: number | null
          segments_count: number
          signposting_breakdown?: Json | null
          signposting_per_segment?: number | null
          signposting_total?: number | null
          softeners_breakdown?: Json | null
          softeners_per_minute?: number | null
          softeners_total?: number | null
          speaker_label: string
          specificity_details?: Json | null
          specificity_score?: number | null
          summary?: string | null
          talk_time_percentage: number
          talk_time_seconds: number
          talk_time_status?:
            | Database["public"]["Enums"]["talk_time_status"]
            | null
          talk_time_vs_expected?: number | null
          times_interrupted?: number | null
          times_interrupting?: number | null
          turn_taking_balance?: number | null
          updated_at?: string | null
          verbosity?: number | null
          word_count: number
          words_per_minute?: number | null
        }
        Update: {
          apologies_breakdown?: Json | null
          apologies_total?: number | null
          assigned_user_id?: string | null
          attunement_explanation?: string | null
          attunement_score?: number | null
          avg_response_latency_seconds?: number | null
          avg_topics_per_segment?: number | null
          behavioral_insights?: Json | null
          clarity_explanation?: string | null
          clarity_score?: number | null
          communication_tips?: Json | null
          confidence_explanation?: string | null
          confidence_score?: number | null
          connection_pillar_score?: number | null
          content_pillar_score?: number | null
          created_at?: string | null
          created_by?: string
          custom_speaker_name?: string | null
          filler_words_breakdown?: Json | null
          filler_words_per_minute?: number | null
          filler_words_total?: number | null
          general_overview?: string | null
          hedge_phrases_breakdown?: Json | null
          hedge_phrases_per_minute?: number | null
          hedge_phrases_total?: number | null
          id?: string
          identification_confidence?: number | null
          incomplete_thoughts_count?: number | null
          incomplete_thoughts_percentage?: number | null
          interruption_rate?: number | null
          job_id?: string | null
          key_point_position?: number | null
          key_point_summary?: string | null
          longest_segment_seconds?: number | null
          max_topics_in_segment?: number | null
          meeting_id?: string | null
          poise_pillar_score?: number | null
          quick_responses_percentage?: number | null
          response_count?: number | null
          segments_count?: number
          signposting_breakdown?: Json | null
          signposting_per_segment?: number | null
          signposting_total?: number | null
          softeners_breakdown?: Json | null
          softeners_per_minute?: number | null
          softeners_total?: number | null
          speaker_label?: string
          specificity_details?: Json | null
          specificity_score?: number | null
          summary?: string | null
          talk_time_percentage?: number
          talk_time_seconds?: number
          talk_time_status?:
            | Database["public"]["Enums"]["talk_time_status"]
            | null
          talk_time_vs_expected?: number | null
          times_interrupted?: number | null
          times_interrupting?: number | null
          turn_taking_balance?: number | null
          updated_at?: string | null
          verbosity?: number | null
          word_count?: number
          words_per_minute?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_analysis_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_analysis_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_analysis_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "processing_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_analysis_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_type_benchmarks: {
        Row: {
          created_at: string | null
          guidance_text: string | null
          id: string
          ideal_talk_time_max: number
          ideal_talk_time_min: number
          meeting_type: string
          participant_count_max: number | null
          participant_count_min: number | null
          typical_talk_time_mean: number
          typical_talk_time_std_dev: number | null
          user_role: string
        }
        Insert: {
          created_at?: string | null
          guidance_text?: string | null
          id?: string
          ideal_talk_time_max: number
          ideal_talk_time_min: number
          meeting_type: string
          participant_count_max?: number | null
          participant_count_min?: number | null
          typical_talk_time_mean: number
          typical_talk_time_std_dev?: number | null
          user_role: string
        }
        Update: {
          created_at?: string | null
          guidance_text?: string | null
          id?: string
          ideal_talk_time_max?: number
          ideal_talk_time_min?: number
          meeting_type?: string
          participant_count_max?: number | null
          participant_count_min?: number | null
          typical_talk_time_mean?: number
          typical_talk_time_std_dev?: number | null
          user_role?: string
        }
        Relationships: []
      }
      meetings: {
        Row: {
          alternative_speakers: string[] | null
          attendees: Json | null
          audio_storage_path: string | null
          created_at: string | null
          description: string | null
          end_time: string | null
          id: string
          meeting_link: string | null
          meeting_type: Database["public"]["Enums"]["meeting_type"] | null
          mic_audio_path: string | null
          off_record_periods: Json | null
          participant_count: number | null
          recording_available_until: string | null
          recording_duration_seconds: number | null
          recording_filename: string | null
          recording_size_mb: number | null
          shared_mic_detected: boolean | null
          start_time: string
          title: string
          updated_at: string | null
          user_id: string
          user_role: Database["public"]["Enums"]["user_role"] | null
          user_speaker_label: string | null
          video_storage_path: string | null
        }
        Insert: {
          alternative_speakers?: string[] | null
          attendees?: Json | null
          audio_storage_path?: string | null
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          meeting_link?: string | null
          meeting_type?: Database["public"]["Enums"]["meeting_type"] | null
          mic_audio_path?: string | null
          off_record_periods?: Json | null
          participant_count?: number | null
          recording_available_until?: string | null
          recording_duration_seconds?: number | null
          recording_filename?: string | null
          recording_size_mb?: number | null
          shared_mic_detected?: boolean | null
          start_time: string
          title: string
          updated_at?: string | null
          user_id: string
          user_role?: Database["public"]["Enums"]["user_role"] | null
          user_speaker_label?: string | null
          video_storage_path?: string | null
        }
        Update: {
          alternative_speakers?: string[] | null
          attendees?: Json | null
          audio_storage_path?: string | null
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          meeting_link?: string | null
          meeting_type?: Database["public"]["Enums"]["meeting_type"] | null
          mic_audio_path?: string | null
          off_record_periods?: Json | null
          participant_count?: number | null
          recording_available_until?: string | null
          recording_duration_seconds?: number | null
          recording_filename?: string | null
          recording_size_mb?: number | null
          shared_mic_detected?: boolean | null
          start_time?: string
          title?: string
          updated_at?: string | null
          user_id?: string
          user_role?: Database["public"]["Enums"]["user_role"] | null
          user_speaker_label?: string | null
          video_storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_alerts: {
        Row: {
          alert_details: Json | null
          alert_type: string
          created_at: string
          id: string
          sent_at: string
        }
        Insert: {
          alert_details?: Json | null
          alert_type: string
          created_at?: string
          id?: string
          sent_at?: string
        }
        Update: {
          alert_details?: Json | null
          alert_type?: string
          created_at?: string
          id?: string
          sent_at?: string
        }
        Relationships: []
      }
      oauth_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          expires_at: string | null
          id: string
          provider: string
          refresh_token: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          provider: string
          refresh_token?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          provider?: string
          refresh_token?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payment_history: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          status: string
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          status: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          status?: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_jobs: {
        Row: {
          created_at: string | null
          id: string
          meeting_id: string | null
          processing_error: string | null
          processing_priority: string | null
          processing_type: Database["public"]["Enums"]["processing_type"] | null
          python_job_id: string | null
          status: Database["public"]["Enums"]["job_status"]
          triggered_by: Database["public"]["Enums"]["triggered_by"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          meeting_id?: string | null
          processing_error?: string | null
          processing_priority?: string | null
          processing_type?:
            | Database["public"]["Enums"]["processing_type"]
            | null
          python_job_id?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          triggered_by?: Database["public"]["Enums"]["triggered_by"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          meeting_id?: string | null
          processing_error?: string | null
          processing_priority?: string | null
          processing_type?:
            | Database["public"]["Enums"]["processing_type"]
            | null
          python_job_id?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          triggered_by?: Database["public"]["Enums"]["triggered_by"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processing_jobs_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      slides: {
        Row: {
          created_at: string
          id: string
          image_url: string
          metadata: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          metadata?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          discount_amount_off: number | null
          discount_duration: string | null
          discount_duration_months: number | null
          discount_end: string | null
          discount_percent_off: number | null
          id: string
          plan_type: Database["public"]["Enums"]["plan_type"]
          product_type: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_coupon_id: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          trial_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          discount_amount_off?: number | null
          discount_duration?: string | null
          discount_duration_months?: number | null
          discount_end?: string | null
          discount_percent_off?: number | null
          id?: string
          plan_type: Database["public"]["Enums"]["plan_type"]
          product_type?: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_coupon_id?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          discount_amount_off?: number | null
          discount_duration?: string | null
          discount_duration_months?: number | null
          discount_end?: string | null
          discount_percent_off?: number | null
          id?: string
          plan_type?: Database["public"]["Enums"]["plan_type"]
          product_type?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_coupon_id?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      transcripts: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          full_text: string | null
          id: string
          language: string | null
          meeting_id: string
          num_speakers: number | null
          provider: string | null
          segments: Json
          speakers: string[]
          updated_at: string | null
          word_count: number | null
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          full_text?: string | null
          id?: string
          language?: string | null
          meeting_id: string
          num_speakers?: number | null
          provider?: string | null
          segments: Json
          speakers: string[]
          updated_at?: string | null
          word_count?: number | null
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          full_text?: string | null
          id?: string
          language?: string | null
          meeting_id?: string
          num_speakers?: number | null
          provider?: string | null
          segments?: Json
          speakers?: string[]
          updated_at?: string | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      user_baselines: {
        Row: {
          avg_baseline_connection_pillar_score: number | null
          avg_baseline_content_pillar_score: number | null
          avg_baseline_poise_pillar_score: number | null
          baseline_apologies_per_meeting: number | null
          baseline_attunement_score: number | null
          baseline_clarity_score: number | null
          baseline_confidence_score: number | null
          baseline_end_date: string
          baseline_filler_words_per_minute: number | null
          baseline_hedge_phrases_per_minute: number | null
          baseline_incomplete_thoughts_percentage: number | null
          baseline_interrupted_std_dev: number | null
          baseline_interrupting_std_dev: number | null
          baseline_interruption_rate: number
          baseline_interruption_rate_std_dev: number | null
          baseline_key_point_position: number | null
          baseline_longest_segment_seconds: number | null
          baseline_response_latency_seconds: number | null
          baseline_response_latency_std_dev: number | null
          baseline_signposting_per_segment: number | null
          baseline_softeners_per_minute: number | null
          baseline_specificity_score: number | null
          baseline_start_date: string
          baseline_talk_time_percentage: number
          baseline_talk_time_std_dev: number | null
          baseline_times_interrupted_per_meeting: number
          baseline_times_interrupting_per_meeting: number
          baseline_topics_per_segment: number | null
          baseline_turn_taking_balance: number | null
          baseline_turn_taking_balance_std_dev: number | null
          baseline_type: string
          baseline_words_per_minute: number
          baseline_words_per_segment: number | null
          baseline_wpm_std_dev: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          meetings_included: number
          supersedes_baseline_id: string | null
          user_id: string
          weeks_included: number
        }
        Insert: {
          avg_baseline_connection_pillar_score?: number | null
          avg_baseline_content_pillar_score?: number | null
          avg_baseline_poise_pillar_score?: number | null
          baseline_apologies_per_meeting?: number | null
          baseline_attunement_score?: number | null
          baseline_clarity_score?: number | null
          baseline_confidence_score?: number | null
          baseline_end_date: string
          baseline_filler_words_per_minute?: number | null
          baseline_hedge_phrases_per_minute?: number | null
          baseline_incomplete_thoughts_percentage?: number | null
          baseline_interrupted_std_dev?: number | null
          baseline_interrupting_std_dev?: number | null
          baseline_interruption_rate: number
          baseline_interruption_rate_std_dev?: number | null
          baseline_key_point_position?: number | null
          baseline_longest_segment_seconds?: number | null
          baseline_response_latency_seconds?: number | null
          baseline_response_latency_std_dev?: number | null
          baseline_signposting_per_segment?: number | null
          baseline_softeners_per_minute?: number | null
          baseline_specificity_score?: number | null
          baseline_start_date: string
          baseline_talk_time_percentage: number
          baseline_talk_time_std_dev?: number | null
          baseline_times_interrupted_per_meeting: number
          baseline_times_interrupting_per_meeting: number
          baseline_topics_per_segment?: number | null
          baseline_turn_taking_balance?: number | null
          baseline_turn_taking_balance_std_dev?: number | null
          baseline_type: string
          baseline_words_per_minute: number
          baseline_words_per_segment?: number | null
          baseline_wpm_std_dev?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          meetings_included: number
          supersedes_baseline_id?: string | null
          user_id: string
          weeks_included: number
        }
        Update: {
          avg_baseline_connection_pillar_score?: number | null
          avg_baseline_content_pillar_score?: number | null
          avg_baseline_poise_pillar_score?: number | null
          baseline_apologies_per_meeting?: number | null
          baseline_attunement_score?: number | null
          baseline_clarity_score?: number | null
          baseline_confidence_score?: number | null
          baseline_end_date?: string
          baseline_filler_words_per_minute?: number | null
          baseline_hedge_phrases_per_minute?: number | null
          baseline_incomplete_thoughts_percentage?: number | null
          baseline_interrupted_std_dev?: number | null
          baseline_interrupting_std_dev?: number | null
          baseline_interruption_rate?: number
          baseline_interruption_rate_std_dev?: number | null
          baseline_key_point_position?: number | null
          baseline_longest_segment_seconds?: number | null
          baseline_response_latency_seconds?: number | null
          baseline_response_latency_std_dev?: number | null
          baseline_signposting_per_segment?: number | null
          baseline_softeners_per_minute?: number | null
          baseline_specificity_score?: number | null
          baseline_start_date?: string
          baseline_talk_time_percentage?: number
          baseline_talk_time_std_dev?: number | null
          baseline_times_interrupted_per_meeting?: number
          baseline_times_interrupting_per_meeting?: number
          baseline_topics_per_segment?: number | null
          baseline_turn_taking_balance?: number | null
          baseline_turn_taking_balance_std_dev?: number | null
          baseline_type?: string
          baseline_words_per_minute?: number
          baseline_words_per_segment?: number | null
          baseline_wpm_std_dev?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          meetings_included?: number
          supersedes_baseline_id?: string | null
          user_id?: string
          weeks_included?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_baselines_supersedes_baseline_id_fkey"
            columns: ["supersedes_baseline_id"]
            isOneToOne: false
            referencedRelation: "user_baselines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_baselines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_event_log: {
        Row: {
          created_at: string | null
          event_name: string
          id: number
          payload: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_name: string
          id?: number
          payload?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_name?: string
          id?: number
          payload?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      user_weekly_rollups: {
        Row: {
          avg_apologies_per_meeting: number | null
          avg_attunement_score: number | null
          avg_clarity_score: number | null
          avg_confidence_score: number | null
          avg_filler_words_per_minute: number | null
          avg_hedge_phrases_per_minute: number | null
          avg_incomplete_thoughts_percentage: number | null
          avg_interruption_rate: number | null
          avg_key_point_position: number | null
          avg_longest_segment_seconds: number | null
          avg_meeting_duration_seconds: number | null
          avg_response_latency_seconds: number | null
          avg_signposting_per_segment: number | null
          avg_softeners_per_minute: number | null
          avg_specificity_score: number | null
          avg_talk_time_percentage: number | null
          avg_times_interrupted_per_meeting: number | null
          avg_times_interrupting_per_meeting: number | null
          avg_topics_per_segment: number | null
          avg_turn_taking_balance: number | null
          avg_words_per_minute: number | null
          avg_words_per_segment: number | null
          calculated_at: string | null
          filler_words_breakdown: Json | null
          id: string
          max_longest_segment_seconds: number | null
          median_attunement_score: number | null
          median_clarity_score: number | null
          median_collaboration_score: number | null
          median_confidence_score: number | null
          median_response_latency_seconds: number | null
          median_talk_time_percentage: number | null
          median_turn_taking_balance: number | null
          median_words_per_minute: number | null
          meetings_count: number
          quick_responses_percentage: number | null
          total_apologies: number | null
          total_filler_words: number | null
          total_meeting_duration_seconds: number
          total_talk_time_seconds: number
          total_times_interrupted: number
          total_times_interrupting: number
          total_words_spoken: number
          updated_at: string | null
          user_id: string
          week_end_date: string
          week_start_date: string
          weekly_connection_pillar_score: number | null
          weekly_content_pillar_score: number | null
          weekly_poise_pillar_score: number | null
        }
        Insert: {
          avg_apologies_per_meeting?: number | null
          avg_attunement_score?: number | null
          avg_clarity_score?: number | null
          avg_confidence_score?: number | null
          avg_filler_words_per_minute?: number | null
          avg_hedge_phrases_per_minute?: number | null
          avg_incomplete_thoughts_percentage?: number | null
          avg_interruption_rate?: number | null
          avg_key_point_position?: number | null
          avg_longest_segment_seconds?: number | null
          avg_meeting_duration_seconds?: number | null
          avg_response_latency_seconds?: number | null
          avg_signposting_per_segment?: number | null
          avg_softeners_per_minute?: number | null
          avg_specificity_score?: number | null
          avg_talk_time_percentage?: number | null
          avg_times_interrupted_per_meeting?: number | null
          avg_times_interrupting_per_meeting?: number | null
          avg_topics_per_segment?: number | null
          avg_turn_taking_balance?: number | null
          avg_words_per_minute?: number | null
          avg_words_per_segment?: number | null
          calculated_at?: string | null
          filler_words_breakdown?: Json | null
          id?: string
          max_longest_segment_seconds?: number | null
          median_attunement_score?: number | null
          median_clarity_score?: number | null
          median_collaboration_score?: number | null
          median_confidence_score?: number | null
          median_response_latency_seconds?: number | null
          median_talk_time_percentage?: number | null
          median_turn_taking_balance?: number | null
          median_words_per_minute?: number | null
          meetings_count?: number
          quick_responses_percentage?: number | null
          total_apologies?: number | null
          total_filler_words?: number | null
          total_meeting_duration_seconds?: number
          total_talk_time_seconds?: number
          total_times_interrupted?: number
          total_times_interrupting?: number
          total_words_spoken?: number
          updated_at?: string | null
          user_id: string
          week_end_date: string
          week_start_date: string
          weekly_connection_pillar_score?: number | null
          weekly_content_pillar_score?: number | null
          weekly_poise_pillar_score?: number | null
        }
        Update: {
          avg_apologies_per_meeting?: number | null
          avg_attunement_score?: number | null
          avg_clarity_score?: number | null
          avg_confidence_score?: number | null
          avg_filler_words_per_minute?: number | null
          avg_hedge_phrases_per_minute?: number | null
          avg_incomplete_thoughts_percentage?: number | null
          avg_interruption_rate?: number | null
          avg_key_point_position?: number | null
          avg_longest_segment_seconds?: number | null
          avg_meeting_duration_seconds?: number | null
          avg_response_latency_seconds?: number | null
          avg_signposting_per_segment?: number | null
          avg_softeners_per_minute?: number | null
          avg_specificity_score?: number | null
          avg_talk_time_percentage?: number | null
          avg_times_interrupted_per_meeting?: number | null
          avg_times_interrupting_per_meeting?: number | null
          avg_topics_per_segment?: number | null
          avg_turn_taking_balance?: number | null
          avg_words_per_minute?: number | null
          avg_words_per_segment?: number | null
          calculated_at?: string | null
          filler_words_breakdown?: Json | null
          id?: string
          max_longest_segment_seconds?: number | null
          median_attunement_score?: number | null
          median_clarity_score?: number | null
          median_collaboration_score?: number | null
          median_confidence_score?: number | null
          median_response_latency_seconds?: number | null
          median_talk_time_percentage?: number | null
          median_turn_taking_balance?: number | null
          median_words_per_minute?: number | null
          meetings_count?: number
          quick_responses_percentage?: number | null
          total_apologies?: number | null
          total_filler_words?: number | null
          total_meeting_duration_seconds?: number
          total_talk_time_seconds?: number
          total_times_interrupted?: number
          total_times_interrupting?: number
          total_words_spoken?: number
          updated_at?: string | null
          user_id?: string
          week_end_date?: string
          week_start_date?: string
          weekly_connection_pillar_score?: number | null
          weekly_content_pillar_score?: number | null
          weekly_poise_pillar_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_weekly_rollups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          app_access: string[] | null
          app_version: string | null
          avatar_url: string | null
          created_at: string | null
          email: string
          first_login_completed: boolean
          full_name: string | null
          has_active_subscription: boolean
          id: string
          is_system_guest: boolean | null
          stripe_customer_id: string | null
          subscription_status: string | null
          trial_used: boolean
          updated_at: string | null
          username: string | null
        }
        Insert: {
          app_access?: string[] | null
          app_version?: string | null
          avatar_url?: string | null
          created_at?: string | null
          email: string
          first_login_completed?: boolean
          full_name?: string | null
          has_active_subscription?: boolean
          id: string
          is_system_guest?: boolean | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          trial_used?: boolean
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          app_access?: string[] | null
          app_version?: string | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          first_login_completed?: boolean
          full_name?: string | null
          has_active_subscription?: boolean
          id?: string
          is_system_guest?: boolean | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          trial_used?: boolean
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_user_lock: { Args: { p_user_id: string }; Returns: boolean }
      calculate_initial_baseline: {
        Args: { p_user_id: string }
        Returns: string
      }
      calculate_rolling_baseline: {
        Args: { p_user_id: string }
        Returns: string
      }
      calculate_user_weekly_rollup: {
        Args: { p_user_id: string; p_week_start: string }
        Returns: string
      }
      claim_anonymous_meetings: {
        Args: {
          p_email: string
          p_selected_speaker?: string
          p_user_id: string
        }
        Returns: {
          meeting_id: string
          meeting_title: string
          speaker_assigned: boolean
        }[]
      }
      cleanup_test_data: { Args: { p_user_email: string }; Returns: undefined }
      get_random_slides: {
        Args: { count: number }
        Returns: {
          created_at: string
          id: string
          image_url: string
          metadata: Json | null
        }[]
        SetofOptions: {
          from: "*"
          to: "slides"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      normalize_email: { Args: { email: string }; Returns: string }
      update_current_baseline: { Args: { p_user_id: string }; Returns: string }
    }
    Enums: {
      job_status:
        | "uploading"
        | "pending"
        | "processing"
        | "completed"
        | "failed"
      meeting_type:
        | "one_on_one"
        | "small_group"
        | "large_group"
        | "presentation"
        | "interview"
        | "unknown"
        | "powerpoint_karaoke"
      plan_type: "monthly" | "annual" | "internal_free"
      processing_type: "initial" | "retry"
      subscription_status:
        | "trialing"
        | "active"
        | "canceled"
        | "past_due"
        | "incomplete"
        | "incomplete_expired"
        | "unpaid"
      talk_time_status:
        | "too_low"
        | "below_ideal"
        | "ideal"
        | "above_ideal"
        | "too_high"
        | "unknown"
      triggered_by: "auto" | "manual"
      user_role:
        | "presenter"
        | "participant"
        | "interviewer"
        | "interviewee"
        | "facilitator"
        | "unknown"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          format: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          format?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          format?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          level: number | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          level?: number | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          level?: number | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      prefixes: {
        Row: {
          bucket_id: string
          created_at: string | null
          level: number
          name: string
          updated_at: string | null
        }
        Insert: {
          bucket_id: string
          created_at?: string | null
          level?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          bucket_id?: string
          created_at?: string | null
          level?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prefixes_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_prefixes: {
        Args: { _bucket_id: string; _name: string }
        Returns: undefined
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      delete_leaf_prefixes: {
        Args: { bucket_ids: string[]; names: string[] }
        Returns: undefined
      }
      delete_prefix: {
        Args: { _bucket_id: string; _name: string }
        Returns: boolean
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_level: { Args: { name: string }; Returns: number }
      get_prefix: { Args: { name: string }; Returns: string }
      get_prefixes: { Args: { name: string }; Returns: string[] }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          start_after?: string
        }
        Returns: {
          id: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      lock_top_prefixes: {
        Args: { bucket_ids: string[]; names: string[] }
        Returns: undefined
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_legacy_v1: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v1_optimised: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      job_status: ["uploading", "pending", "processing", "completed", "failed"],
      meeting_type: [
        "one_on_one",
        "small_group",
        "large_group",
        "presentation",
        "interview",
        "unknown",
        "powerpoint_karaoke",
      ],
      plan_type: ["monthly", "annual", "internal_free"],
      processing_type: ["initial", "retry"],
      subscription_status: [
        "trialing",
        "active",
        "canceled",
        "past_due",
        "incomplete",
        "incomplete_expired",
        "unpaid",
      ],
      talk_time_status: [
        "too_low",
        "below_ideal",
        "ideal",
        "above_ideal",
        "too_high",
        "unknown",
      ],
      triggered_by: ["auto", "manual"],
      user_role: [
        "presenter",
        "participant",
        "interviewer",
        "interviewee",
        "facilitator",
        "unknown",
      ],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS"],
    },
  },
} as const

