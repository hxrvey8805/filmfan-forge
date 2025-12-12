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
          context: string
          created_at: string
          episode_number: number | null
          id: string
          media_type: string
          question: string
          season_number: number | null
          timestamp: string | null
          title_id: number
          user_id: string
        }
        Insert: {
          answer: string
          context: string
          created_at?: string
          episode_number?: number | null
          id?: string
          media_type: string
          question: string
          season_number?: number | null
          timestamp?: string | null
          title_id: number
          user_id: string
        }
        Update: {
          answer?: string
          context?: string
          created_at?: string
          episode_number?: number | null
          id?: string
          media_type?: string
          question?: string
          season_number?: number | null
          timestamp?: string | null
          title_id?: number
          user_id?: string
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
      subtitle_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          embedding: string | null
          end_seconds: number
          episode_number: number | null
          id: string
          media_type: string
          season_number: number | null
          start_seconds: number
          tmdb_id: number
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          embedding?: string | null
          end_seconds: number
          episode_number?: number | null
          id?: string
          media_type: string
          season_number?: number | null
          start_seconds: number
          tmdb_id: number
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string | null
          end_seconds?: number
          episode_number?: number | null
          id?: string
          media_type?: string
          season_number?: number | null
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
          earned_at: string
          id: string
          is_opened: boolean
          opened_at: string | null
          pack_tier: string
          pack_type: string
          user_id: string
        }
        Insert: {
          earned_at?: string
          id?: string
          is_opened?: boolean
          opened_at?: string | null
          pack_tier?: string
          pack_type: string
          user_id: string
        }
        Update: {
          earned_at?: string
          id?: string
          is_opened?: boolean
          opened_at?: string | null
          pack_tier?: string
          pack_type?: string
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
      [_ in never]: never
    }
    Functions: {
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
  public: {
    Enums: {},
  },
} as const
