export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  public: {
    Tables: {
      bids: {
        Row: {
          amount: number;
          created_at: string;
          dispatcher_id: string | null;
          eta_complete: string | null;
          eta_pickup: string | null;
          id: string;
          job_id: string;
          message: string | null;
          pilot_id: string;
          status: Database["public"]["Enums"]["bid_status"];
          updated_at: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          dispatcher_id?: string | null;
          eta_complete?: string | null;
          eta_pickup?: string | null;
          id?: string;
          job_id: string;
          message?: string | null;
          pilot_id: string;
          status?: Database["public"]["Enums"]["bid_status"];
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          dispatcher_id?: string | null;
          eta_complete?: string | null;
          eta_pickup?: string | null;
          id?: string;
          job_id?: string;
          message?: string | null;
          pilot_id?: string;
          status?: Database["public"]["Enums"]["bid_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      dispatcher_documents: {
        Row: {
          created_at: string;
          doc_type: string;
          document_number: string | null;
          expiry_date: string | null;
          file_url: string | null;
          id: string;
          issuing_authority: string | null;
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["doc_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          doc_type: string;
          document_number?: string | null;
          expiry_date?: string | null;
          file_url?: string | null;
          id?: string;
          issuing_authority?: string | null;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["doc_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          doc_type?: string;
          document_number?: string | null;
          expiry_date?: string | null;
          file_url?: string | null;
          id?: string;
          issuing_authority?: string | null;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["doc_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      dispatcher_profiles: {
        Row: {
          billing_address: string | null;
          city: string | null;
          company_name: string | null;
          completion_pct: number;
          contact_name: string | null;
          contact_phone: string | null;
          country: string | null;
          created_at: string;
          dot_number: string | null;
          ein: string | null;
          email: string | null;
          id: string;
          legal_name: string | null;
          mc_number: string | null;
          postal_code: string | null;
          rating: number | null;
          rejection_reason: string | null;
          state: string | null;
          stripe_customer_id: string | null;
          updated_at: string;
          user_id: string;
          verification_status: Database["public"]["Enums"]["business_verification_status"];
          website: string | null;
        };
        Insert: {
          billing_address?: string | null;
          city?: string | null;
          company_name?: string | null;
          completion_pct?: number;
          contact_name?: string | null;
          contact_phone?: string | null;
          country?: string | null;
          created_at?: string;
          dot_number?: string | null;
          ein?: string | null;
          email?: string | null;
          id?: string;
          legal_name?: string | null;
          mc_number?: string | null;
          postal_code?: string | null;
          rating?: number | null;
          rejection_reason?: string | null;
          state?: string | null;
          stripe_customer_id?: string | null;
          updated_at?: string;
          user_id: string;
          verification_status?: Database["public"]["Enums"]["business_verification_status"];
          website?: string | null;
        };
        Update: {
          billing_address?: string | null;
          city?: string | null;
          company_name?: string | null;
          completion_pct?: number;
          contact_name?: string | null;
          contact_phone?: string | null;
          country?: string | null;
          created_at?: string;
          dot_number?: string | null;
          ein?: string | null;
          email?: string | null;
          id?: string;
          legal_name?: string | null;
          mc_number?: string | null;
          postal_code?: string | null;
          rating?: number | null;
          rejection_reason?: string | null;
          state?: string | null;
          stripe_customer_id?: string | null;
          updated_at?: string;
          user_id?: string;
          verification_status?: Database["public"]["Enums"]["business_verification_status"];
          website?: string | null;
        };
        Relationships: [];
      };
      escrow_transactions: {
        Row: {
          amount: number;
          created_at: string;
          dispatcher_id: string;
          id: string;
          job_id: string;
          net_to_pilot: number;
          notes: string | null;
          pilot_id: string | null;
          platform_fee: number;
          status: Database["public"]["Enums"]["escrow_status"];
          stripe_fee: number;
          stripe_payment_intent_id: string | null;
          stripe_payout_id: string | null;
          stripe_transfer_id: string | null;
          updated_at: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          dispatcher_id: string;
          id?: string;
          job_id: string;
          net_to_pilot?: number;
          notes?: string | null;
          pilot_id?: string | null;
          platform_fee?: number;
          status?: Database["public"]["Enums"]["escrow_status"];
          stripe_fee?: number;
          stripe_payment_intent_id?: string | null;
          stripe_payout_id?: string | null;
          stripe_transfer_id?: string | null;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          dispatcher_id?: string;
          id?: string;
          job_id?: string;
          net_to_pilot?: number;
          notes?: string | null;
          pilot_id?: string | null;
          platform_fee?: number;
          status?: Database["public"]["Enums"]["escrow_status"];
          stripe_fee?: number;
          stripe_payment_intent_id?: string | null;
          stripe_payout_id?: string | null;
          stripe_transfer_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          awarded_bid_id: string | null;
          awarded_pilot_id: string | null;
          budget: number;
          cargo_type: string | null;
          created_at: string;
          description: string | null;
          dimensions: string | null;
          dispatcher_id: string;
          distance_mi: number | null;
          dropoff_date: string | null;
          dropoff_location: string;
          escrow_status: Database["public"]["Enums"]["escrow_status"] | null;
          id: string;
          permits: Json;
          pickup_date: string | null;
          pickup_location: string;
          requirements: Json;
          status: Database["public"]["Enums"]["job_status"];
          title: string;
          updated_at: string;
          weight: string | null;
        };
        Insert: {
          awarded_bid_id?: string | null;
          awarded_pilot_id?: string | null;
          budget: number;
          cargo_type?: string | null;
          created_at?: string;
          description?: string | null;
          dimensions?: string | null;
          dispatcher_id: string;
          distance_mi?: number | null;
          dropoff_date?: string | null;
          dropoff_location: string;
          escrow_status?: Database["public"]["Enums"]["escrow_status"] | null;
          id?: string;
          permits?: Json;
          pickup_date?: string | null;
          pickup_location: string;
          requirements?: Json;
          status?: Database["public"]["Enums"]["job_status"];
          title: string;
          updated_at?: string;
          weight?: string | null;
        };
        Update: {
          awarded_bid_id?: string | null;
          awarded_pilot_id?: string | null;
          budget?: number;
          cargo_type?: string | null;
          created_at?: string;
          description?: string | null;
          dimensions?: string | null;
          dispatcher_id?: string;
          distance_mi?: number | null;
          dropoff_date?: string | null;
          dropoff_location?: string;
          escrow_status?: Database["public"]["Enums"]["escrow_status"] | null;
          id?: string;
          permits?: Json;
          pickup_date?: string | null;
          pickup_location?: string;
          requirements?: Json;
          status?: Database["public"]["Enums"]["job_status"];
          title?: string;
          updated_at?: string;
          weight?: string | null;
        };
        Relationships: [];
      };
      pilot_certifications: {
        Row: {
          cert_number: string | null;
          cert_type: string;
          created_at: string;
          expiry_date: string | null;
          file_url: string | null;
          id: string;
          status: Database["public"]["Enums"]["doc_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          cert_number?: string | null;
          cert_type: string;
          created_at?: string;
          expiry_date?: string | null;
          file_url?: string | null;
          id?: string;
          status?: Database["public"]["Enums"]["doc_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          cert_number?: string | null;
          cert_type?: string;
          created_at?: string;
          expiry_date?: string | null;
          file_url?: string | null;
          id?: string;
          status?: Database["public"]["Enums"]["doc_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      pilot_documents: {
        Row: {
          created_at: string;
          doc_type: string;
          document_number: string | null;
          expiry_date: string | null;
          file_url: string | null;
          id: string;
          issuing_authority: string | null;
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["doc_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          doc_type: string;
          document_number?: string | null;
          expiry_date?: string | null;
          file_url?: string | null;
          id?: string;
          issuing_authority?: string | null;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["doc_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          doc_type?: string;
          document_number?: string | null;
          expiry_date?: string | null;
          file_url?: string | null;
          id?: string;
          issuing_authority?: string | null;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["doc_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      pilot_earnings: {
        Row: {
          commission: number;
          created_at: string;
          gross: number;
          id: string;
          job_id: string;
          net: number;
          paid_at: string | null;
          payout_method_id: string | null;
          pilot_id: string;
          status: Database["public"]["Enums"]["earning_status"];
        };
        Insert: {
          commission?: number;
          created_at?: string;
          gross: number;
          id?: string;
          job_id: string;
          net: number;
          paid_at?: string | null;
          payout_method_id?: string | null;
          pilot_id: string;
          status?: Database["public"]["Enums"]["earning_status"];
        };
        Update: {
          commission?: number;
          created_at?: string;
          gross?: number;
          id?: string;
          job_id?: string;
          net?: number;
          paid_at?: string | null;
          payout_method_id?: string | null;
          pilot_id?: string;
          status?: Database["public"]["Enums"]["earning_status"];
        };
        Relationships: [
          {
            foreignKeyName: "pilot_earnings_payout_method_id_fkey";
            columns: ["payout_method_id"];
            isOneToOne: false;
            referencedRelation: "pilot_payout_methods";
            referencedColumns: ["id"];
          },
        ];
      };
      pilot_payout_methods: {
        Row: {
          created_at: string;
          details: Json;
          id: string;
          is_default: boolean;
          method_type: string;
          user_id: string;
          verified: boolean;
        };
        Insert: {
          created_at?: string;
          details?: Json;
          id?: string;
          is_default?: boolean;
          method_type: string;
          user_id: string;
          verified?: boolean;
        };
        Update: {
          created_at?: string;
          details?: Json;
          id?: string;
          is_default?: boolean;
          method_type?: string;
          user_id?: string;
          verified?: boolean;
        };
        Relationships: [];
      };
      pilot_profiles: {
        Row: {
          address: string | null;
          city: string | null;
          completion_pct: number;
          country: string | null;
          created_at: string;
          date_of_birth: string | null;
          emergency_contact: string | null;
          email: string | null;
          full_name: string | null;
          photo_url: string | null;
          postal_code: string | null;
          rating: number | null;
          rejection_reason: string | null;
          service_areas: string[] | null;
          state: string | null;
          updated_at: string;
          user_id: string;
          verification_status: Database["public"]["Enums"]["verification_status"];
          years_experience: number | null;
        };
        Insert: {
          address?: string | null;
          city?: string | null;
          completion_pct?: number;
          country?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          emergency_contact?: string | null;
          email?: string | null;
          full_name?: string | null;
          photo_url?: string | null;
          postal_code?: string | null;
          rating?: number | null;
          rejection_reason?: string | null;
          service_areas?: string[] | null;
          state?: string | null;
          updated_at?: string;
          user_id: string;
          verification_status?: Database["public"]["Enums"]["verification_status"];
          years_experience?: number | null;
        };
        Update: {
          address?: string | null;
          city?: string | null;
          completion_pct?: number;
          country?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          emergency_contact?: string | null;
          email?: string | null;
          full_name?: string | null;
          photo_url?: string | null;
          postal_code?: string | null;
          rating?: number | null;
          rejection_reason?: string | null;
          service_areas?: string[] | null;
          state?: string | null;
          updated_at?: string;
          user_id?: string;
          verification_status?: Database["public"]["Enums"]["verification_status"];
          years_experience?: number | null;
        };
        Relationships: [];
      };
      pilot_vehicles: {
        Row: {
          created_at: string;
          equipment: Json | null;
          id: string;
          insurance_expiry: string | null;
          license_plate: string | null;
          make: string | null;
          model: string | null;
          photos: string[] | null;
          updated_at: string;
          user_id: string;
          vehicle_type: string | null;
          vin: string | null;
          year: number | null;
        };
        Insert: {
          created_at?: string;
          equipment?: Json | null;
          id?: string;
          insurance_expiry?: string | null;
          license_plate?: string | null;
          make?: string | null;
          model?: string | null;
          photos?: string[] | null;
          updated_at?: string;
          user_id: string;
          vehicle_type?: string | null;
          vin?: string | null;
          year?: number | null;
        };
        Update: {
          created_at?: string;
          equipment?: Json | null;
          id?: string;
          insurance_expiry?: string | null;
          license_plate?: string | null;
          make?: string | null;
          model?: string | null;
          photos?: string[] | null;
          updated_at?: string;
          user_id?: string;
          vehicle_type?: string | null;
          vin?: string | null;
          year?: number | null;
        };
        Relationships: [];
      };
      trip_locations: {
        Row: {
          accuracy: number | null;
          heading: number | null;
          id: number;
          lat: number;
          lng: number;
          speed: number | null;
          trip_id: string;
          ts: string;
        };
        Insert: {
          accuracy?: number | null;
          heading?: number | null;
          id?: number;
          lat: number;
          lng: number;
          speed?: number | null;
          trip_id: string;
          ts?: string;
        };
        Update: {
          accuracy?: number | null;
          heading?: number | null;
          id?: number;
          lat?: number;
          lng?: number;
          speed?: number | null;
          trip_id?: string;
          ts?: string;
        };
        Relationships: [];
      };
      trip_messages: {
        Row: {
          body: string;
          created_at: string;
          id: number;
          sender_name: string;
          sender_role: string;
          trip_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: number;
          sender_name: string;
          sender_role: string;
          trip_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: number;
          sender_name?: string;
          sender_role?: string;
          trip_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "pilot" | "dispatcher";
      bid_status:
        "submitted" | "viewed" | "shortlisted" | "accepted" | "rejected" | "withdrawn" | "expired";
      business_verification_status: "not_started" | "in_review" | "verified" | "rejected";
      doc_status: "pending" | "approved" | "rejected" | "expired";
      earning_status: "pending" | "available" | "paid" | "disputed" | "refunded";
      escrow_status:
        "initiated" | "charged" | "held" | "released" | "paid_out" | "refunded" | "failed";
      job_status:
        | "draft"
        | "published"
        | "bidding"
        | "awarded"
        | "in_transit"
        | "completed"
        | "cancelled"
        | "disputed";
      verification_status: "not_started" | "pending" | "approved" | "rejected" | "more_info";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "pilot", "dispatcher"],
      bid_status: [
        "submitted",
        "viewed",
        "shortlisted",
        "accepted",
        "rejected",
        "withdrawn",
        "expired",
      ],
      business_verification_status: ["not_started", "in_review", "verified", "rejected"],
      doc_status: ["pending", "approved", "rejected", "expired"],
      earning_status: ["pending", "available", "paid", "disputed", "refunded"],
      escrow_status: ["initiated", "charged", "held", "released", "paid_out", "refunded", "failed"],
      job_status: [
        "draft",
        "published",
        "bidding",
        "awarded",
        "in_transit",
        "completed",
        "cancelled",
        "disputed",
      ],
      verification_status: ["not_started", "pending", "approved", "rejected", "more_info"],
    },
  },
} as const;
