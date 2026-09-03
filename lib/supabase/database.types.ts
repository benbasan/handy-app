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
      job_dismissals: {
        Row: {
          created_at: string
          job_id: string
          pro_id: string
        }
        Insert: {
          created_at?: string
          job_id: string
          pro_id: string
        }
        Update: {
          created_at?: string
          job_id?: string
          pro_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_dismissals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_dismissals_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      job_locations: {
        Row: {
          accuracy_m: number | null
          eta_minutes: number | null
          job_id: string
          latitude: number | null
          location: unknown
          longitude: number | null
          pro_id: string
          updated_at: string
        }
        Insert: {
          accuracy_m?: number | null
          eta_minutes?: number | null
          job_id: string
          latitude?: number | null
          location: unknown
          longitude?: number | null
          pro_id: string
          updated_at?: string
        }
        Update: {
          accuracy_m?: number | null
          eta_minutes?: number | null
          job_id?: string
          latitude?: number | null
          location?: unknown
          longitude?: number | null
          pro_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_locations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_locations_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["user_id"]
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
          latitude: number | null
          location: unknown
          longitude: number | null
          photo_urls: string[]
          preferred_time: string | null
          search_radius_km: number
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
          latitude?: number | null
          location: unknown
          longitude?: number | null
          photo_urls?: string[]
          preferred_time?: string | null
          search_radius_km?: number
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
          latitude?: number | null
          location?: unknown
          longitude?: number | null
          photo_urls?: string[]
          preferred_time?: string | null
          search_radius_km?: number
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
          pro_id: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          job_id: string
          pro_id: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          job_id?: string
          pro_id?: string
          read_at?: string | null
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
            foreignKeyName: "messages_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["user_id"]
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
      pro_categories: {
        Row: {
          category_id: string
          created_at: string
          pro_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          pro_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          pro_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pro_categories_pro_id_fkey"
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
          onboarding_step: number
          payment_methods: string[]
          payout_account_last4: string | null
          payout_bank_branch: string | null
          payout_bank_name: string | null
          profile_strength_pct: number
          radius_km: number
          rating_avg: number | null
          service_address_text: string | null
          service_point: unknown
          submitted_at: string | null
          user_id: string
          verification_status: string
          work_days: number[]
          work_end_time: string
          work_start_time: string
        }
        Insert: {
          accepting_jobs?: boolean
          bio?: string | null
          created_at?: string
          jobs_completed_count?: number
          onboarding_step?: number
          payment_methods?: string[]
          payout_account_last4?: string | null
          payout_bank_branch?: string | null
          payout_bank_name?: string | null
          profile_strength_pct?: number
          radius_km?: number
          rating_avg?: number | null
          service_address_text?: string | null
          service_point?: unknown
          submitted_at?: string | null
          user_id: string
          verification_status?: string
          work_days?: number[]
          work_end_time?: string
          work_start_time?: string
        }
        Update: {
          accepting_jobs?: boolean
          bio?: string | null
          created_at?: string
          jobs_completed_count?: number
          onboarding_step?: number
          payment_methods?: string[]
          payout_account_last4?: string | null
          payout_bank_branch?: string | null
          payout_bank_name?: string | null
          profile_strength_pct?: number
          radius_km?: number
          rating_avg?: number | null
          service_address_text?: string | null
          service_point?: unknown
          submitted_at?: string | null
          user_id?: string
          verification_status?: string
          work_days?: number[]
          work_end_time?: string
          work_start_time?: string
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
      bids_for_job: {
        Args: { p_job_id: string }
        Returns: {
          created_at: string
          eta_minutes: number
          expires_at: string
          id: string
          note: string
          price: number
          pro_id: string
          pro_jobs_completed: number
          pro_name: string
          pro_rating: number
          pro_verified: boolean
          status: string
          unread_count: number
        }[]
      }
      can_bid_on_job: { Args: { p_job_id: string }; Returns: boolean }
      can_read_job_media: { Args: { p_object_name: string }; Returns: boolean }
      can_read_price_update_photo: {
        Args: { p_object_name: string }
        Returns: boolean
      }
      commission_rate: { Args: never; Returns: number }
      complete_job: {
        Args: { p_job_id: string; p_payment_method: string }
        Returns: string
      }
      decide_price_update: {
        Args: { p_approve: boolean; p_id: string }
        Returns: string
      }
      expire_stale_bids: { Args: never; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      is_assigned_pro: { Args: { p_job_id: string }; Returns: boolean }
      is_bidding_pro: { Args: { p_job_id: string }; Returns: boolean }
      is_job_owner: { Args: { p_job_id: string }; Returns: boolean }
      is_verified_pro: { Args: never; Returns: boolean }
      job_bid_count: { Args: { p_job_id: string }; Returns: number }
      job_contact: {
        Args: { p_job_id: string }
        Returns: {
          counterpart_id: string
          counterpart_name: string
          counterpart_phone: string
          counterpart_role: string
        }[]
      }
      job_effective_price: { Args: { p_job_id: string }; Returns: number }
      job_receipt: {
        Args: { p_job_id: string }
        Returns: {
          address_text: string
          base_price: number
          category_name_he: string
          charged_at: string
          commission_amount: number
          customer_name: string
          description: string
          job_id: string
          net_amount: number
          payment_method: string
          pro_id: string
          pro_name: string
          rating: number
          review_comment: string
          total_price: number
        }[]
      }
      mark_job_in_progress: { Args: { p_job_id: string }; Returns: string }
      my_active_jobs: {
        Args: never
        Returns: {
          address_text: string
          agreed_price: number
          assigned_at: string
          category_name_he: string
          current_price: number
          customer_name: string
          description: string
          eta_minutes: number
          job_id: string
          pending_update_count: number
          status: string
          unread_count: number
        }[]
      }
      my_bid_stats: {
        Args: never
        Returns: {
          acceptance_pct: number
          avg_response_minutes: number
          pending: number
          selected: number
          total: number
        }[]
      }
      my_bids: {
        Args: never
        Returns: {
          category_name_he: string
          category_slug: string
          created_at: string
          eta_minutes: number
          expires_at: string
          id: string
          job_address_text: string
          job_created_at: string
          job_description: string
          job_id: string
          job_status: string
          note: string
          photo_urls: string[]
          price: number
          status: string
          unread_count: number
          winning_price: number
        }[]
      }
      my_completed_jobs: {
        Args: { p_since?: string }
        Returns: {
          address_text: string
          base_price: number
          category_name_he: string
          category_slug: string
          charged_at: string
          commission_amount: number
          customer_name: string
          description: string
          job_id: string
          net_amount: number
          payment_method: string
          rating: number
          total_price: number
        }[]
      }
      my_earnings_stats: {
        Args: { p_since?: string }
        Returns: {
          commission: number
          gross: number
          jobs_count: number
          lifetime_commission: number
          lifetime_gross: number
          lifetime_jobs_count: number
          net: number
          rating_avg: number
          rating_count: number
        }[]
      }
      my_message_threads: {
        Args: never
        Returns: {
          bid_status: string
          counterpart_name: string
          job_description: string
          job_id: string
          job_status: string
          last_at: string
          last_body: string
          pro_id: string
          unread_count: number
        }[]
      }
      my_saved_pros: {
        Args: never
        Returns: {
          bio: string
          full_name: string
          jobs_completed_count: number
          pro_id: string
          rating_avg: number
          saved_at: string
          verified: boolean
        }[]
      }
      open_jobs_for_pro: {
        Args: { p_max_km?: number }
        Returns: {
          address_text: string
          bids_count: number
          category_id: string
          category_name_he: string
          category_slug: string
          created_at: string
          description: string
          distance_km: number
          id: string
          latitude: number
          longitude: number
          photo_urls: string[]
          preferred_time: string
          search_radius_km: number
          status: string
        }[]
      }
      pro_has_bid: {
        Args: { p_job_id: string; p_pro_id: string }
        Returns: boolean
      }
      pro_serves_job: {
        Args: { p_point: unknown; p_search_radius_km: number }
        Returns: boolean
      }
      pros_in_range: { Args: { p_job_id: string }; Returns: number }
      report_job_location: {
        Args: {
          p_accuracy_m?: number
          p_eta_minutes?: number
          p_job_id: string
          p_lat: number
          p_lng: number
        }
        Returns: string
      }
      request_price_update: {
        Args: {
          p_job_id: string
          p_new_price: number
          p_note?: string
          p_photo_url: string
        }
        Returns: string
      }
      select_bid: { Args: { p_bid_id: string }; Returns: string }
      set_pro_verification: {
        Args: { p_pro_id: string; p_status: string }
        Returns: string
      }
      similar_bid_range: {
        Args: { p_job_id: string }
        Returns: {
          max_price: number
          min_price: number
          sample_count: number
        }[]
      }
      submit_job_review: {
        Args: { p_comment?: string; p_job_id: string; p_rating: number }
        Returns: string
      }
      submit_pro_for_approval: { Args: never; Returns: string }
      thread_messages: {
        Args: { p_job_id: string; p_pro_id: string }
        Returns: {
          body: string
          created_at: string
          id: string
          mine: boolean
          read_at: string
          sender_name: string
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

