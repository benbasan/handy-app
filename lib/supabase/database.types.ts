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
      bids: {
        Row: {
          created_at: string
          eta_minutes: number
          expires_at: string
          id: string
          job_id: string
          note: string | null
          price: number
          pro_id: string
          status: string
        }
        Insert: {
          created_at?: string
          eta_minutes: number
          expires_at?: string
          id?: string
          job_id: string
          note?: string | null
          price: number
          pro_id: string
          status?: string
        }
        Update: {
          created_at?: string
          eta_minutes?: number
          expires_at?: string
          id?: string
          job_id?: string
          note?: string | null
          price?: number
          pro_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bids_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name_he: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name_he: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name_he?: string
          slug?: string
        }
        Relationships: []
      }
      commission_charges: {
        Row: {
          base_price: number
          charged_at: string
          commission_amount: number
          id: string
          job_id: string
          payment_method: string
          pro_id: string
          total_price: number
        }
        Insert: {
          base_price: number
          charged_at?: string
          commission_amount: number
          id?: string
          job_id: string
          payment_method: string
          pro_id: string
          total_price: number
        }
        Update: {
          base_price?: number
          charged_at?: string
          commission_amount?: number
          id?: string
          job_id?: string
          payment_method?: string
          pro_id?: string
          total_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_charges_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_charges_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      disputes: {
        Row: {
          created_at: string
          credit_amount: number | null
          id: string
          job_id: string
          opened_by: string
          reason: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          credit_amount?: number | null
          id?: string
          job_id: string
          opened_by: string
          reason: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          credit_amount?: number | null
          id?: string
          job_id?: string
          opened_by?: string
          reason?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          address_text: string
          category_id: string
          created_at: string
          customer_id: string
          description: string
          id: string
          location: unknown
          photo_urls: string[]
          preferred_time: string | null
          selected_bid_id: string | null
          status: string
          video_url: string | null
          voice_note_url: string | null
        }
        Insert: {
          address_text: string
          category_id: string
          created_at?: string
          customer_id: string
          description: string
          id?: string
          location: unknown
          photo_urls?: string[]
          preferred_time?: string | null
          selected_bid_id?: string | null
          status?: string
          video_url?: string | null
          voice_note_url?: string | null
        }
        Update: {
          address_text?: string
          category_id?: string
          created_at?: string
          customer_id?: string
          description?: string
          id?: string
          location?: unknown
          photo_urls?: string[]
          preferred_time?: string | null
          selected_bid_id?: string | null
          status?: string
          video_url?: string | null
          voice_note_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_selected_bid_id_fkey"
            columns: ["selected_bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          job_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          job_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          job_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      price_updates: {
        Row: {
          created_at: string
          decided_at: string | null
          id: string
          job_id: string
          new_price: number
          note: string | null
          original_price: number
          photo_url: string
          pro_id: string
          status: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          id?: string
          job_id: string
          new_price: number
          note?: string | null
          original_price: number
          photo_url: string
          pro_id: string
          status?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          id?: string
          job_id?: string
          new_price?: number
          note?: string | null
          original_price?: number
          photo_url?: string
          pro_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_updates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_updates_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pro_profiles: {
        Row: {
          accepting_jobs: boolean
          bio: string | null
          created_at: string
          jobs_completed_count: number
          profile_strength_pct: number
          radius_km: number
          rating_avg: number | null
          service_point: unknown
          user_id: string
          verification_status: string
        }
        Insert: {
          accepting_jobs?: boolean
          bio?: string | null
          created_at?: string
          jobs_completed_count?: number
          profile_strength_pct?: number
          radius_km?: number
          rating_avg?: number | null
          service_point?: unknown
          user_id: string
          verification_status?: string
        }
        Update: {
          accepting_jobs?: boolean
          bio?: string | null
          created_at?: string
          jobs_completed_count?: number
          profile_strength_pct?: number
          radius_km?: number
          rating_avg?: number | null
          service_point?: unknown
          user_id?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string
          role: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone: string
          role?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string
          role?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          job_id: string
          rating: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          job_id: string
          rating: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          job_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "reviews_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_pros: {
        Row: {
          created_at: string
          customer_id: string
          pro_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          pro_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          pro_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_pros_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_pros_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      verification_documents: {
        Row: {
          created_at: string
          doc_type: string
          file_url: string
          id: string
          pro_id: string
          reviewed_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          doc_type: string
          file_url: string
          id?: string
          pro_id: string
          reviewed_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          file_url?: string
          id?: string
          pro_id?: string
          reviewed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_documents_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_role: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_assigned_pro: { Args: { p_job_id: string }; Returns: boolean }
      is_bidding_pro: { Args: { p_job_id: string }; Returns: boolean }
      is_job_owner: { Args: { p_job_id: string }; Returns: boolean }
      is_verified_pro: { Args: never; Returns: boolean }
      pro_serves_point: { Args: { p_point: unknown }; Returns: boolean }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

