export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          answer: string
          answer_status: string | null
          companion_version: number
          context: string
          created_at: string
          episode_number: number | null
          evidence: Json
          id: string
          media_type: string
          position_seconds: number | null
          question: string
          season_number: number | null
          timestamp: string | null
          title_id: number
          used_coins: number
          user_id: string
        }
        Insert: {
          answer: string
          answer_status?: string | null
          companion_version?: number
          context: string
          created_at?: string
          episode_number?: number | null
          evidence?: Json
          id?: string
          media_type: string
          position_seconds?: number | null
          question: string
          season_number?: number | null
          timestamp?: string | null
          title_id: number
          used_coins?: number
          user_id: string
        }
        Update: {
          answer?: string
          answer_status?: string | null
          companion_version?: number
          context?: string
          created_at?: string
          episode_number?: number | null
          evidence?: Json
          id?: string
          media_type?: string
          position_seconds?: number | null
          question?: string
          season_number?: number | null
          timestamp?: string | null
          title_id?: number
          used_coins?: number
          user_id?: string
        }
        Relationships: []
      }
      apple_production_notifications: {
        Row: {
          notification_id: string
          original_id: string
          received_at: string
        }
        Insert: {
          notification_id: string
          original_id: string
          received_at?: string
        }
        Update: {
          notification_id?: string
          original_id?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "apple_production_notifications_original_id_fkey"
            columns: ["original_id"]
            isOneToOne: false
            referencedRelation: "apple_production_owners"
            referencedColumns: ["original_id"]
          },
        ]
      }
      apple_production_owners: {
        Row: {
          account_token: string
          kind: string
          original_id: string
          user_id: string | null
        }
        Insert: {
          account_token: string
          kind: string
          original_id: string
          user_id?: string | null
        }
        Update: {
          account_token?: string
          kind?: string
          original_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      apple_production_policy: {
        Row: {
          enabled: boolean
          id: boolean
          sales_enabled: boolean
        }
        Insert: {
          enabled?: boolean
          id?: boolean
          sales_enabled?: boolean
        }
        Update: {
          enabled?: boolean
          id?: boolean
          sales_enabled?: boolean
        }
        Relationships: []
      }
      apple_production_recovery: {
        Row: {
          cursor: string
          id: boolean
          last_attempt: string | null
          last_success: string | null
          lease: string | null
          lease_until: string | null
        }
        Insert: {
          cursor?: string
          id?: boolean
          last_attempt?: string | null
          last_success?: string | null
          lease?: string | null
          lease_until?: string | null
        }
        Update: {
          cursor?: string
          id?: boolean
          last_attempt?: string | null
          last_success?: string | null
          lease?: string | null
          lease_until?: string | null
        }
        Relationships: []
      }
      apple_production_transactions: {
        Row: {
          expires_at: string | null
          original_id: string
          original_purchased_at: string
          product_id: string
          purchased_at: string
          reconciled_at: string
          revoked_at: string | null
          signed_at: string
          subscription_status: number | null
          transaction_id: string
          upgraded: boolean
        }
        Insert: {
          expires_at?: string | null
          original_id: string
          original_purchased_at: string
          product_id: string
          purchased_at: string
          reconciled_at: string
          revoked_at?: string | null
          signed_at: string
          subscription_status?: number | null
          transaction_id: string
          upgraded: boolean
        }
        Update: {
          expires_at?: string | null
          original_id?: string
          original_purchased_at?: string
          product_id?: string
          purchased_at?: string
          reconciled_at?: string
          revoked_at?: string | null
          signed_at?: string
          subscription_status?: number | null
          transaction_id?: string
          upgraded?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "apple_production_transactions_original_id_fkey"
            columns: ["original_id"]
            isOneToOne: false
            referencedRelation: "apple_production_owners"
            referencedColumns: ["original_id"]
          },
        ]
      }
      apple_review_entitlements: {
        Row: {
          anchor: string
          plan: string
          revoked: boolean
          user_id: string
          valid_until: string
          verified_transaction_id: string
        }
        Insert: {
          anchor: string
          plan: string
          revoked?: boolean
          user_id: string
          valid_until: string
          verified_transaction_id: string
        }
        Update: {
          anchor?: string
          plan?: string
          revoked?: boolean
          user_id?: string
          valid_until?: string
          verified_transaction_id?: string
        }
        Relationships: []
      }
      apple_review_notifications: {
        Row: {
          notification_id: string
          original_id: string
          received_at: string
        }
        Insert: {
          notification_id: string
          original_id: string
          received_at?: string
        }
        Update: {
          notification_id?: string
          original_id?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "apple_review_notifications_original_id_fkey"
            columns: ["original_id"]
            isOneToOne: false
            referencedRelation: "apple_review_owners"
            referencedColumns: ["original_id"]
          },
        ]
      }
      apple_review_owners: {
        Row: {
          account_token: string
          kind: string
          original_id: string
          user_id: string | null
        }
        Insert: {
          account_token: string
          kind: string
          original_id: string
          user_id?: string | null
        }
        Update: {
          account_token?: string
          kind?: string
          original_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      apple_review_policy: {
        Row: {
          enabled: boolean
          id: boolean
          sales_enabled: boolean
        }
        Insert: {
          enabled?: boolean
          id?: boolean
          sales_enabled?: boolean
        }
        Update: {
          enabled?: boolean
          id?: boolean
          sales_enabled?: boolean
        }
        Relationships: []
      }
      apple_review_recovery: {
        Row: {
          cursor: string
          id: boolean
          last_attempt: string | null
          last_success: string | null
          lease: string | null
          lease_until: string | null
        }
        Insert: {
          cursor?: string
          id?: boolean
          last_attempt?: string | null
          last_success?: string | null
          lease?: string | null
          lease_until?: string | null
        }
        Update: {
          cursor?: string
          id?: boolean
          last_attempt?: string | null
          last_success?: string | null
          lease?: string | null
          lease_until?: string | null
        }
        Relationships: []
      }
      apple_review_testers: {
        Row: {
          expires_at: string
          starts_at: string
          user_id: string
        }
        Insert: {
          expires_at: string
          starts_at?: string
          user_id: string
        }
        Update: {
          expires_at?: string
          starts_at?: string
          user_id?: string
        }
        Relationships: []
      }
      apple_review_transactions: {
        Row: {
          expires_at: string | null
          original_id: string
          original_purchased_at: string
          product_id: string
          purchased_at: string
          reconciled_at: string
          revoked_at: string | null
          signed_at: string
          subscription_status: number | null
          transaction_id: string
          upgraded: boolean
        }
        Insert: {
          expires_at?: string | null
          original_id: string
          original_purchased_at: string
          product_id: string
          purchased_at: string
          reconciled_at: string
          revoked_at?: string | null
          signed_at: string
          subscription_status?: number | null
          transaction_id: string
          upgraded: boolean
        }
        Update: {
          expires_at?: string | null
          original_id?: string
          original_purchased_at?: string
          product_id?: string
          purchased_at?: string
          reconciled_at?: string
          revoked_at?: string | null
          signed_at?: string
          subscription_status?: number | null
          transaction_id?: string
          upgraded?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "apple_review_transactions_original_id_fkey"
            columns: ["original_id"]
            isOneToOne: false
            referencedRelation: "apple_review_owners"
            referencedColumns: ["original_id"]
          },
        ]
      }
      cinegeek_ai_permissions: {
        Row: {
          allowed: boolean
          feature: string
          notice_version: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed: boolean
          feature: string
          notice_version: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          feature?: string
          notice_version?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cinegeek_games: {
        Row: {
          awarded: number
          expires_at: string
          id: string
          proof: Json | null
          start_actor: number
          started_at: string
          status: string
          submitted_at: string | null
          target_actor: number
          user_id: string
          verification_token: string | null
          verification_until: string | null
        }
        Insert: {
          awarded?: number
          expires_at?: string
          id: string
          proof?: Json | null
          start_actor: number
          started_at?: string
          status?: string
          submitted_at?: string | null
          target_actor: number
          user_id: string
          verification_token?: string | null
          verification_until?: string | null
        }
        Update: {
          awarded?: number
          expires_at?: string
          id?: string
          proof?: Json | null
          start_actor?: number
          started_at?: string
          status?: string
          submitted_at?: string | null
          target_actor?: number
          user_id?: string
          verification_token?: string | null
          verification_until?: string | null
        }
        Relationships: []
      }
      cinegeek_private_monthly_grants: {
        Row: {
          expires_at: string
          reason: string
          revoked: boolean
          starts_at: string
          user_id: string
        }
        Insert: {
          expires_at: string
          reason: string
          revoked?: boolean
          starts_at: string
          user_id: string
        }
        Update: {
          expires_at?: string
          reason?: string
          revoked?: boolean
          starts_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cinegeek_unlocks: {
        Row: {
          earned_at: string
          item: string
          kind: string
          user_id: string
        }
        Insert: {
          earned_at?: string
          item: string
          kind: string
          user_id: string
        }
        Update: {
          earned_at?: string
          item?: string
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      cinegeek_xp: {
        Row: {
          available: number
          daily_earned: number
          lifetime: number
          reward_day: string
          spin_earned_day: string | null
          spin_used_day: string | null
          user_id: string
        }
        Insert: {
          available?: number
          daily_earned?: number
          lifetime?: number
          reward_day?: string
          spin_earned_day?: string | null
          spin_used_day?: string | null
          user_id: string
        }
        Update: {
          available?: number
          daily_earned?: number
          lifetime?: number
          reward_day?: string
          spin_earned_day?: string | null
          spin_used_day?: string | null
          user_id?: string
        }
        Relationships: []
      }
      cinegeek_xp_events: {
        Row: {
          amount: number
          created_at: string
          details: Json
          id: string
          kind: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          details?: Json
          id: string
          kind: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      companion_episode_recaps: {
        Row: {
          chapter: Json
          episode_number: number
          prepared_at: string
          revision: string
          season_number: number
          tmdb_id: number
        }
        Insert: {
          chapter: Json
          episode_number: number
          prepared_at?: string
          revision: string
          season_number: number
          tmdb_id: number
        }
        Update: {
          chapter?: Json
          episode_number?: number
          prepared_at?: string
          revision?: string
          season_number?: number
          tmdb_id?: number
        }
        Relationships: []
      }
      companion_pro_entitlements: {
        Row: {
          anchor: string
          plan: string
          revoked: boolean
          user_id: string
          valid_until: string
          verified_transaction_id: string
        }
        Insert: {
          anchor: string
          plan: string
          revoked?: boolean
          user_id: string
          valid_until: string
          verified_transaction_id: string
        }
        Update: {
          anchor?: string
          plan?: string
          revoked?: boolean
          user_id?: string
          valid_until?: string
          verified_transaction_id?: string
        }
        Relationships: []
      }
      companion_question_calls: {
        Row: {
          call_id: string
          request_id: string
        }
        Insert: {
          call_id: string
          request_id: string
        }
        Update: {
          call_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "companion_question_calls_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "companion_sol_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companion_question_calls_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "companion_question_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companion_question_calls_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "companion_spending_questions"
            referencedColumns: ["request_id"]
          },
        ]
      }
      companion_question_packs: {
        Row: {
          created_at: string
          questions: number
          transaction_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          questions: number
          transaction_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          questions?: number
          transaction_id?: string
          user_id?: string
        }
        Relationships: []
      }
      companion_question_requests: {
        Row: {
          attempt: string
          budget_block_reason: string | null
          budget_month: string
          committed_micro_usd: number
          created_at: string
          id: string
          lease_until: string
          period_end: string | null
          period_start: string | null
          provider_call_limit: number | null
          scope: Json
          source: string
          spend_limit_micro_usd: number | null
          status: string
          user_id: string
        }
        Insert: {
          attempt: string
          budget_block_reason?: string | null
          budget_month: string
          committed_micro_usd?: number
          created_at?: string
          id: string
          lease_until: string
          period_end?: string | null
          period_start?: string | null
          provider_call_limit?: number | null
          scope: Json
          source: string
          spend_limit_micro_usd?: number | null
          status: string
          user_id: string
        }
        Update: {
          attempt?: string
          budget_block_reason?: string | null
          budget_month?: string
          committed_micro_usd?: number
          created_at?: string
          id?: string
          lease_until?: string
          period_end?: string | null
          period_start?: string | null
          provider_call_limit?: number | null
          scope?: Json
          source?: string
          spend_limit_micro_usd?: number | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "companion_question_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "companion_usage_accounts"
            referencedColumns: ["user_id"]
          },
        ]
      }
      companion_scene_notes: {
        Row: {
          episode_number: number | null
          id: string
          media_type: string
          note: Json
          reveal_seconds: number
          season_number: number | null
          tmdb_id: number
        }
        Insert: {
          episode_number?: number | null
          id: string
          media_type?: string
          note: Json
          reveal_seconds?: number
          season_number?: number | null
          tmdb_id?: number
        }
        Update: {
          episode_number?: number | null
          id?: string
          media_type?: string
          note?: Json
          reveal_seconds?: number
          season_number?: number | null
          tmdb_id?: number
        }
        Relationships: []
      }
      companion_sol_budget: {
        Row: {
          committed_micro_usd: number
          enabled: boolean
          halted_reason: string | null
          id: string
          limit_micro_usd: number
          updated_at: string
        }
        Insert: {
          committed_micro_usd?: number
          enabled?: boolean
          halted_reason?: string | null
          id: string
          limit_micro_usd?: number
          updated_at?: string
        }
        Update: {
          committed_micro_usd?: number
          enabled?: boolean
          halted_reason?: string | null
          id?: string
          limit_micro_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
      companion_sol_calls: {
        Row: {
          actual_micro_usd: number | null
          created_at: string
          generation_id: string | null
          id: string
          request_id: string
          reserved_micro_usd: number
          settled_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          actual_micro_usd?: number | null
          created_at?: string
          generation_id?: string | null
          id: string
          request_id: string
          reserved_micro_usd: number
          settled_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          actual_micro_usd?: number | null
          created_at?: string
          generation_id?: string | null
          id?: string
          request_id?: string
          reserved_micro_usd?: number
          settled_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      companion_subtitle_unavailability: {
        Row: {
          episode_number: number
          ingestion_version: number
          retry_after: string
          season_number: number
          tmdb_id: number
        }
        Insert: {
          episode_number: number
          ingestion_version: number
          retry_after: string
          season_number: number
          tmdb_id: number
        }
        Update: {
          episode_number?: number
          ingestion_version?: number
          retry_after?: string
          season_number?: number
          tmdb_id?: number
        }
        Relationships: []
      }
      companion_usage_accounts: {
        Row: {
          pack_questions: number
          user_id: string
        }
        Insert: {
          pack_questions?: number
          user_id: string
        }
        Update: {
          pack_questions?: number
          user_id?: string
        }
        Relationships: []
      }
      companion_usage_policy: {
        Row: {
          enabled: boolean
          id: boolean
          question_call_limit: number
          question_limit_micro_usd: number
          user_day_limit_micro_usd: number | null
          user_month_limit_micro_usd: number
        }
        Insert: {
          enabled?: boolean
          id?: boolean
          question_call_limit?: number
          question_limit_micro_usd?: number
          user_day_limit_micro_usd?: number | null
          user_month_limit_micro_usd?: number
        }
        Update: {
          enabled?: boolean
          id?: boolean
          question_call_limit?: number
          question_limit_micro_usd?: number
          user_day_limit_micro_usd?: number | null
          user_month_limit_micro_usd?: number
        }
        Relationships: []
      }
      companion_visual_notes: {
        Row: {
          episode_number: number | null
          id: string
          media_type: string
          note: Json
          reveal_seconds: number
          season_number: number | null
          tmdb_id: number
        }
        Insert: {
          episode_number?: number | null
          id: string
          media_type?: string
          note: Json
          reveal_seconds?: number
          season_number?: number | null
          tmdb_id?: number
        }
        Update: {
          episode_number?: number | null
          id?: string
          media_type?: string
          note?: Json
          reveal_seconds?: number
          season_number?: number | null
          tmdb_id?: number
        }
        Relationships: []
      }
      season_summaries: {
        Row: {
          created_at: string
          embedding: string | null
          episode_summaries: Json | null
          id: string
          overview: string | null
          season_name: string | null
          season_number: number
          tmdb_id: number
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          episode_summaries?: Json | null
          id?: string
          overview?: string | null
          season_name?: string | null
          season_number: number
          tmdb_id: number
        }
        Update: {
          created_at?: string
          embedding?: string | null
          episode_summaries?: Json | null
          id?: string
          overview?: string | null
          season_name?: string | null
          season_number?: number
          tmdb_id?: number
        }
        Relationships: []
      }
      smart_list_interpretations: {
        Row: {
          created_at: string
          id: string
          request_hash: string
          result: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          request_hash: string
          result?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          request_hash?: string
          result?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      subtitle_chunks: {
        Row: {
          cache_key: string | null
          chunk_index: number
          content: string
          created_at: string
          cues: Json
          embedding: string | null
          end_seconds: number
          episode_number: number | null
          id: string
          ingestion_version: number
          media_type: string
          season_number: number | null
          source_file_id: number | null
          start_seconds: number
          tmdb_id: number
        }
        Insert: {
          cache_key?: string | null
          chunk_index: number
          content: string
          created_at?: string
          cues?: Json
          embedding?: string | null
          end_seconds: number
          episode_number?: number | null
          id?: string
          ingestion_version?: number
          media_type: string
          season_number?: number | null
          source_file_id?: number | null
          start_seconds: number
          tmdb_id: number
        }
        Update: {
          cache_key?: string | null
          chunk_index?: number
          content?: string
          created_at?: string
          cues?: Json
          embedding?: string | null
          end_seconds?: number
          episode_number?: number | null
          id?: string
          ingestion_version?: number
          media_type?: string
          season_number?: number | null
          source_file_id?: number | null
          start_seconds?: number
          tmdb_id?: number
        }
        Relationships: []
      }
      user_ai_usage: {
        Row: {
          created_at: string
          id: string
          last_reset_date: string
          questions_today: number
          total_questions: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_reset_date?: string
          questions_today?: number
          total_questions?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_reset_date?: string
          questions_today?: number
          total_questions?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_collection: {
        Row: {
          collected_at: string
          id: string
          person_id: number
          person_name: string
          person_type: string
          profile_path: string
          user_id: string
        }
        Insert: {
          collected_at?: string
          id?: string
          person_id: number
          person_name: string
          person_type: string
          profile_path: string
          user_id: string
        }
        Update: {
          collected_at?: string
          id?: string
          person_id?: number
          person_name?: string
          person_type?: string
          profile_path?: string
          user_id?: string
        }
        Relationships: []
      }
      user_packs: {
        Row: {
          decision: string | null
          earned_at: string
          id: string
          is_opened: boolean
          opened_at: string | null
          pack_tier: string
          pack_type: string
          replaced_card_id: string | null
          reveal_token: string | null
          reveal_until: string | null
          revealed_person: Json | null
          user_id: string
        }
        Insert: {
          decision?: string | null
          earned_at?: string
          id?: string
          is_opened?: boolean
          opened_at?: string | null
          pack_tier?: string
          pack_type: string
          replaced_card_id?: string | null
          reveal_token?: string | null
          reveal_until?: string | null
          revealed_person?: Json | null
          user_id: string
        }
        Update: {
          decision?: string | null
          earned_at?: string
          id?: string
          is_opened?: boolean
          opened_at?: string | null
          pack_tier?: string
          pack_type?: string
          replaced_card_id?: string | null
          reveal_token?: string | null
          reveal_until?: string | null
          revealed_person?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      user_stats: {
        Row: {
          cards_sold: number
          coins: number
          created_at: string
          id: string
          packs_opened: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cards_sold?: number
          coins?: number
          created_at?: string
          id?: string
          packs_opened?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cards_sold?: number
          coins?: number
          created_at?: string
          id?: string
          packs_opened?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_titles: {
        Row: {
          created_at: string
          id: string
          list_type: string
          poster_path: string
          progress: number | null
          tags: string[] | null
          title: string
          title_id: number
          type: string
          user_id: string
          year: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          list_type: string
          poster_path: string
          progress?: number | null
          tags?: string[] | null
          title: string
          title_id: number
          type: string
          user_id: string
          year?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          list_type?: string
          poster_path?: string
          progress?: number | null
          tags?: string[] | null
          title?: string
          title_id?: number
          type?: string
          user_id?: string
          year?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      companion_spending_daily: {
        Row: {
          committed_micro_usd: number | null
          day: string | null
          known_micro_usd: number | null
          provider_calls: number | null
          unknown_calls: number | null
          unresolved_micro_usd: number | null
          user_id: string | null
        }
        Relationships: []
      }
      companion_spending_questions: {
        Row: {
          budget_block_reason: string | null
          committed_micro_usd: number | null
          created_at: string | null
          known_micro_usd: number | null
          provider_call_limit: number | null
          provider_calls: number | null
          request_id: string | null
          source: string | null
          spend_limit_micro_usd: number | null
          status: string | null
          unresolved_micro_usd: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companion_question_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "companion_usage_accounts"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Functions: {
      active_companion_entitlement: {
        Args: { p_user_id: string }
        Returns: {
          anchor: string
          grant_source: string
          plan: string
          user_id: string
          valid_until: string
        }[]
      }
      apple_production_can_deliver: {
        Args: { p_user: string }
        Returns: boolean
      }
      apple_production_claim_recovery: { Args: never; Returns: Json }
      apple_production_deliver: {
        Args: { p_notification?: string; p_user: string; p_verified: Json }
        Returns: Json
      }
      apple_production_finish_recovery: {
        Args: {
          p_complete: boolean
          p_cursor: string
          p_lease: string
          p_previous: string
          p_successful: boolean
        }
        Returns: boolean
      }
      apple_production_reconcile_batch: {
        Args: { p_after?: string; p_limit?: number }
        Returns: {
          transaction_id: string
          user_id: string
        }[]
      }
      apple_review_can_deliver: { Args: { p_user: string }; Returns: boolean }
      apple_review_claim_recovery: { Args: never; Returns: Json }
      apple_review_deliver: {
        Args: { p_notification?: string; p_user: string; p_verified: Json }
        Returns: Json
      }
      apple_review_finish_recovery: {
        Args: {
          p_complete: boolean
          p_cursor: string
          p_lease: string
          p_previous: string
          p_successful: boolean
        }
        Returns: boolean
      }
      apple_review_reconcile_batch: {
        Args: { p_after?: string; p_limit?: number }
        Returns: {
          transaction_id: string
          user_id: string
        }[]
      }
      begin_companion_question: {
        Args: {
          p_attempt: string
          p_request_id: string
          p_scope: Json
          p_user_id: string
        }
        Returns: Json
      }
      begin_companion_question_before_spending: {
        Args: {
          p_attempt: string
          p_request_id: string
          p_scope: Json
          p_user_id: string
        }
        Returns: Json
      }
      cinegeek_account_privacy_ready: { Args: never; Returns: string }
      cinegeek_ai_allowed: {
        Args: { p_feature: string; p_user: string; p_version: string }
        Returns: boolean
      }
      cinegeek_game_access: {
        Args: { p_game: string; p_user: string }
        Returns: boolean
      }
      cinegeek_lock_wallet: { Args: { p_user: string }; Returns: undefined }
      cinegeek_plan: { Args: { p_user: string }; Returns: string }
      claim_cinegeek_pack: {
        Args: { p_pack: string; p_token: string; p_user: string }
        Returns: Json
      }
      claim_cinegeek_win: {
        Args: { p_game: string; p_proof: Json; p_token: string; p_user: string }
        Returns: Json
      }
      companion_allowance_for: { Args: { p_user_id: string }; Returns: Json }
      companion_answer_revision: {
        Args: { episode: number; media: string; season: number; title: number }
        Returns: number
      }
      companion_month_window: {
        Args: { p_anchor: string; p_now: string }
        Returns: {
          period_end: string
          period_start: string
        }[]
      }
      companion_usage_enabled: { Args: never; Returns: boolean }
      decide_cinegeek_pack: {
        Args: { p_keep: boolean; p_pack: string; p_replace?: string }
        Returns: Json
      }
      end_cinegeek_game: { Args: { p_game: string }; Returns: undefined }
      end_companion_question_attempt: {
        Args: {
          p_attempt: string
          p_pause: boolean
          p_request_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      finish_cinegeek_win: {
        Args: {
          p_game: string
          p_token: string
          p_user: string
          p_valid: boolean
        }
        Returns: Json
      }
      finish_companion_question: {
        Args: {
          p_attempt: string
          p_charge: boolean
          p_conversation: Json
          p_user_id: string
        }
        Returns: Json
      }
      finish_companion_question_before_spending: {
        Args: {
          p_attempt: string
          p_charge: boolean
          p_conversation: Json
          p_user_id: string
        }
        Returns: Json
      }
      get_ai_privacy_choices: { Args: never; Returns: Json }
      get_apple_purchase_configuration: { Args: never; Returns: Json }
      get_apple_review_configuration: { Args: never; Returns: Json }
      get_cinegeek_access: { Args: never; Returns: Json }
      get_companion_allowance: { Args: never; Returns: Json }
      grant_companion_question_pack: {
        Args: {
          p_questions: number
          p_transaction_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      match_companion_chunks: {
        Args: {
          p_current_episode: number
          p_current_season: number
          p_embedding?: string
          p_max_seconds: number
          p_media_type: string
          p_question: string
          p_tmdb_id: number
        }
        Returns: {
          cache_key: string | null
          chunk_index: number
          content: string
          created_at: string
          cues: Json
          embedding: string | null
          end_seconds: number
          episode_number: number | null
          id: string
          ingestion_version: number
          media_type: string
          season_number: number | null
          source_file_id: number | null
          start_seconds: number
          tmdb_id: number
        }[]
        SetofOptions: {
          from: "*"
          to: "subtitle_chunks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      match_season_summaries: {
        Args: {
          match_count?: number
          p_max_season: number
          p_tmdb_id: number
          query_embedding: string
        }
        Returns: {
          episode_summaries: Json
          id: string
          overview: string
          season_name: string
          season_number: number
          similarity: number
          tmdb_id: number
        }[]
      }
      match_subtitle_chunks: {
        Args: {
          match_count?: number
          p_current_episode: number
          p_current_season: number
          p_max_seconds: number
          p_media_type: string
          p_tmdb_id: number
          query_embedding: string
        }
        Returns: {
          chunk_index: number
          content: string
          end_seconds: number
          episode_number: number
          id: string
          media_type: string
          season_number: number
          similarity: number
          start_seconds: number
          tmdb_id: number
        }[]
      }
      record_companion_answer: {
        Args: { p_charge: boolean; p_conversation: Json; p_user_id: string }
        Returns: Json
      }
      record_companion_answer_legacy: {
        Args: { p_charge: boolean; p_conversation: Json; p_user_id: string }
        Returns: Json
      }
      redeem_cinegeek_xp: {
        Args: { p_item: string; p_request: string }
        Returns: Json
      }
      reserve_companion_question_call: {
        Args: {
          p_attempt: string
          p_call_id: string
          p_micro_usd: number
          p_request_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      reserve_companion_sol_call: {
        Args: {
          p_call_id: string
          p_micro_usd: number
          p_request_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      reserve_companion_sol_call_legacy: {
        Args: {
          p_call_id: string
          p_micro_usd: number
          p_request_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      reserve_smart_list_interpretation: {
        Args: { p_call: string; p_hash: string; p_user: string }
        Returns: Json
      }
      reserve_smart_list_interpretation_legacy: {
        Args: { p_call: string; p_hash: string; p_user: string }
        Returns: Json
      }
      set_ai_privacy_choice: {
        Args: { p_allowed: boolean; p_feature: string; p_version: string }
        Returns: Json
      }
      settle_companion_sol_call: {
        Args: {
          p_call_id: string
          p_generation_id: string
          p_halt_reason: string
          p_micro_usd: number
        }
        Returns: boolean
      }
      settle_companion_sol_call_legacy: {
        Args: {
          p_call_id: string
          p_generation_id: string
          p_halt_reason: string
          p_micro_usd: number
        }
        Returns: boolean
      }
      spin_cinegeek_reward: { Args: never; Returns: Json }
      start_cinegeek_game: {
        Args: { p_game: string; p_start: number; p_target: number }
        Returns: Json
      }
      store_cinegeek_reveal: {
        Args: {
          p_pack: string
          p_person: Json
          p_token: string
          p_user: string
        }
        Returns: Json
      }
      store_companion_episode_recap: {
        Args: {
          p_chapter: Json
          p_episode: number
          p_revision: string
          p_season: number
          p_title: number
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
