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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_settings: {
        Row: { key: string; value: string | null; updated_at: string }
        Insert: { key: string; value?: string | null; updated_at?: string }
        Update: { value?: string | null; updated_at?: string }
        Relationships: []
      }
      pending_orders: {

        Row: {
          id: string
          display_id: string | null
          localizador: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_address: string | null
          lat: number | null
          lng: number | null
          total: number | null
          payment_method: string | null
          items: string | null
          status: string | null
          created_at: string | null
          delivery_code: string | null
          raw_data: Record<string, unknown> | null
          received_at: string
        }
        Insert: {
          id: string
          display_id?: string | null
          localizador?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_address?: string | null
          lat?: number | null
          lng?: number | null
          total?: number | null
          payment_method?: string | null
          items?: string | null
          status?: string | null
          created_at?: string | null
          delivery_code?: string | null
          raw_data?: Record<string, unknown> | null
          received_at?: string
        }
        Update: {
          status?: string | null
        }
        Relationships: []
      }
      confirmed_orders: {

        Row: {
          confirmation_code: string | null
          confirmed_at: string
          created_at: string
          customer_address: string | null
          customer_name: string | null
          id: string
          ifood_order_id: string
          motoboy_name: string | null
          order_code: string | null
          status: string
          distance_km: number | null
          order_total_cents: number | null
          driver_id: string | null
          delivery_lat: number | null
          delivery_lng: number | null
        }
        Insert: {
          confirmation_code?: string | null
          confirmed_at?: string
          created_at?: string
          customer_address?: string | null
          customer_name?: string | null
          id?: string
          ifood_order_id: string
          motoboy_name?: string | null
          order_code?: string | null
          status?: string
          distance_km?: number | null
          order_total_cents?: number | null
          driver_id?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
        }
        Update: {
          confirmation_code?: string | null
          confirmed_at?: string
          created_at?: string
          customer_address?: string | null
          customer_name?: string | null
          id?: string
          ifood_order_id?: string
          motoboy_name?: string | null
          order_code?: string | null
          status?: string
          distance_km?: number | null
          order_total_cents?: number | null
          driver_id?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
        }
        Relationships: []
      }
      drivers: {
        Row: {
          id: string
          name: string
          phone: string | null
          status: string
          notes: string | null
          approved_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          phone?: string | null
          status?: string
          notes?: string | null
          approved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          phone?: string | null
          status?: string
          notes?: string | null
          approved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      transfer_requests: {
        Row: {
          id: string
          order_id: string
          order_data: Record<string, unknown>
          requester_name: string
          current_owner_name: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          order_data: Record<string, unknown>
          requester_name: string
          current_owner_name: string
          status?: string
          created_at?: string
        }
        Update: {
          status?: string
        }
        Relationships: []
      }
      user_profiles: {

        Row: {
          id: string
          auth_user_id: string
          role: string
          driver_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          auth_user_id: string
          role?: string
          driver_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          auth_user_id?: string
          role?: string
          driver_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      ifood_tokens: {

        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          updated_at: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
