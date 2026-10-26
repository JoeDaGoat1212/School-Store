export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      admins: {
        Row: {
          created_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      closed_dates: {
        Row: {
          closed_on: string;
          reason: string | null;
        };
        ComputedFields: never;
        Insert: {
          closed_on: string;
          reason?: string | null;
        };
        Update: {
          closed_on?: string;
          reason?: string | null;
        };
        Relationships: [];
      };
      expense_items: {
        Row: {
          description: string;
          expense_id: string;
          id: string;
          line_total_cents: number | null;
          product_id: string | null;
          quantity: number;
          unit_cost_cents: number;
        };
        ComputedFields: never;
        Insert: {
          description: string;
          expense_id: string;
          id?: string;
          line_total_cents?: never;
          product_id?: string | null;
          quantity: number;
          unit_cost_cents: number;
        };
        Update: {
          description?: string;
          expense_id?: string;
          id?: string;
          line_total_cents?: never;
          product_id?: string | null;
          quantity?: number;
          unit_cost_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "expense_items_expense_id_fkey";
            columns: ["expense_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expense_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          buyer_name: string;
          created_at: string;
          created_by: string | null;
          id: string;
          notes: string | null;
          purchased_on: string;
          receipt_path: string | null;
          supplier_id: string | null;
          total_cents: number;
        };
        ComputedFields: never;
        Insert: {
          buyer_name: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          purchased_on: string;
          receipt_path?: string | null;
          supplier_id?: string | null;
          total_cents?: number;
        };
        Update: {
          buyer_name?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          purchased_on?: string;
          receipt_path?: string | null;
          supplier_id?: string | null;
          total_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          product_name: string;
          quantity: number;
          unit_price_cents: number;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          product_name: string;
          quantity: number;
          unit_price_cents: number;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          product_name?: string;
          quantity?: number;
          unit_price_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          created_at: string;
          first_name: string;
          grade: string;
          id: string;
          ip_hash: string | null;
          last_name: string;
          order_number: number;
          picked_up_at: string | null;
          pickup_date: string;
          pickup_window_id: number;
          staff_notes: string | null;
          status: Database["public"]["Enums"]["order_status"];
          status_changed_at: string;
          total_cents: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          first_name: string;
          grade: string;
          id?: string;
          ip_hash?: string | null;
          last_name: string;
          order_number?: number;
          picked_up_at?: string | null;
          pickup_date: string;
          pickup_window_id: number;
          staff_notes?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          status_changed_at?: string;
          total_cents: number;
        };
        Update: {
          created_at?: string;
          first_name?: string;
          grade?: string;
          id?: string;
          ip_hash?: string | null;
          last_name?: string;
          order_number?: number;
          picked_up_at?: string | null;
          pickup_date?: string;
          pickup_window_id?: number;
          staff_notes?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          status_changed_at?: string;
          total_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "orders_pickup_window_id_fkey";
            columns: ["pickup_window_id"];
            isOneToOne: false;
            referencedRelation: "pickup_windows";
            referencedColumns: ["id"];
          },
        ];
      };
      pickup_windows: {
        Row: {
          active: boolean;
          id: number;
          label: string;
          sort_order: number;
          starts_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          id?: number;
          label: string;
          sort_order?: number;
          starts_at: string;
        };
        Update: {
          active?: boolean;
          id?: number;
          label?: string;
          sort_order?: number;
          starts_at?: string;
        };
        Relationships: [];
      };
      product_aliases: {
        Row: {
          alias: string;
          created_at: string;
          id: string;
          product_id: string;
        };
        ComputedFields: never;
        Insert: {
          alias: string;
          created_at?: string;
          id?: string;
          product_id: string;
        };
        Update: {
          alias?: string;
          created_at?: string;
          id?: string;
          product_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_aliases_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_batches: {
        Row: {
          created_at: string;
          expense_id: string | null;
          expires_on: string;
          id: string;
          product_id: string;
          quantity: number;
          received_on: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          expense_id?: string | null;
          expires_on: string;
          id?: string;
          product_id: string;
          quantity: number;
          received_on: string;
        };
        Update: {
          created_at?: string;
          expense_id?: string | null;
          expires_on?: string;
          id?: string;
          product_id?: string;
          quantity?: number;
          received_on?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_batches_expense_fk";
            columns: ["expense_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_batches_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          archived: boolean;
          available_online: boolean;
          category: string;
          created_at: string;
          description: string | null;
          emoji: string | null;
          id: string;
          is_perishable: boolean;
          lead_days: number;
          name: string;
          photo_path: string | null;
          price_cents: number;
          reorder_point: number;
          stock: number;
          supplier_id: string | null;
          tags: string[];
          unit_cost_cents: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived?: boolean;
          available_online?: boolean;
          category?: string;
          created_at?: string;
          description?: string | null;
          emoji?: string | null;
          id?: string;
          is_perishable?: boolean;
          lead_days?: number;
          name: string;
          photo_path?: string | null;
          price_cents: number;
          reorder_point?: number;
          stock?: number;
          supplier_id?: string | null;
          tags?: string[];
          unit_cost_cents?: number;
          updated_at?: string;
        };
        Update: {
          archived?: boolean;
          available_online?: boolean;
          category?: string;
          created_at?: string;
          description?: string | null;
          emoji?: string | null;
          id?: string;
          is_perishable?: boolean;
          lead_days?: number;
          name?: string;
          photo_path?: string | null;
          price_cents?: number;
          reorder_point?: number;
          stock?: number;
          supplier_id?: string | null;
          tags?: string[];
          unit_cost_cents?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_imports: {
        Row: {
          column_mapping: NonNullable<Json>;
          created_at: string;
          date_from: string | null;
          date_to: string | null;
          duplicate_count: number;
          file_hash: string;
          file_name: string;
          id: string;
          imported_by: string | null;
          imported_count: number;
          revenue_cents: number;
          row_count: number;
          undone_at: string | null;
          undone_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          column_mapping?: NonNullable<Json>;
          created_at?: string;
          date_from?: string | null;
          date_to?: string | null;
          duplicate_count?: number;
          file_hash: string;
          file_name: string;
          id?: string;
          imported_by?: string | null;
          imported_count?: number;
          revenue_cents?: number;
          row_count?: number;
          undone_at?: string | null;
          undone_by?: string | null;
        };
        Update: {
          column_mapping?: NonNullable<Json>;
          created_at?: string;
          date_from?: string | null;
          date_to?: string | null;
          duplicate_count?: number;
          file_hash?: string;
          file_name?: string;
          id?: string;
          imported_by?: string | null;
          imported_count?: number;
          revenue_cents?: number;
          row_count?: number;
          undone_at?: string | null;
          undone_by?: string | null;
        };
        Relationships: [];
      };
      sales_lines: {
        Row: {
          fingerprint: string;
          id: string;
          import_id: string;
          payment_type: Database["public"]["Enums"]["payment_type"];
          product_id: string | null;
          quantity: number;
          raw_item_name: string;
          sale_date: string;
          sold_at: string | null;
          total_cents: number;
          transaction_ref: string | null;
          unit_price_cents: number;
        };
        ComputedFields: never;
        Insert: {
          fingerprint: string;
          id?: string;
          import_id: string;
          payment_type?: Database["public"]["Enums"]["payment_type"];
          product_id?: string | null;
          quantity: number;
          raw_item_name: string;
          sale_date: string;
          sold_at?: string | null;
          total_cents: number;
          transaction_ref?: string | null;
          unit_price_cents: number;
        };
        Update: {
          fingerprint?: string;
          id?: string;
          import_id?: string;
          payment_type?: Database["public"]["Enums"]["payment_type"];
          product_id?: string | null;
          quantity?: number;
          raw_item_name?: string;
          sale_date?: string;
          sold_at?: string | null;
          total_cents?: number;
          transaction_ref?: string | null;
          unit_price_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sales_lines_import_id_fkey";
            columns: ["import_id"];
            isOneToOne: false;
            referencedRelation: "sales_imports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_lines_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      settings: {
        Row: {
          banner_text: string | null;
          id: number;
          max_items_per_order: number;
          max_orders_per_hour_per_device: number;
          max_orders_per_student_day: number;
          next_shopping_date: string | null;
          order_cutoff_time: string;
          order_lead_minutes: number;
          order_retention_days: number;
          pickup_location: string;
          reorder_buffer_days: number;
          sales_average_days: number;
          shopping_interval_days: number;
          store_hours: string;
          store_name: string;
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          banner_text?: string | null;
          id?: number;
          max_items_per_order?: number;
          max_orders_per_hour_per_device?: number;
          max_orders_per_student_day?: number;
          next_shopping_date?: string | null;
          order_cutoff_time?: string;
          order_lead_minutes?: number;
          order_retention_days?: number;
          pickup_location?: string;
          reorder_buffer_days?: number;
          sales_average_days?: number;
          shopping_interval_days?: number;
          store_hours?: string;
          store_name?: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          banner_text?: string | null;
          id?: number;
          max_items_per_order?: number;
          max_orders_per_hour_per_device?: number;
          max_orders_per_student_day?: number;
          next_shopping_date?: string | null;
          order_cutoff_time?: string;
          order_lead_minutes?: number;
          order_retention_days?: number;
          pickup_location?: string;
          reorder_buffer_days?: number;
          sales_average_days?: number;
          shopping_interval_days?: number;
          store_hours?: string;
          store_name?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stock_movements: {
        Row: {
          change: number;
          created_at: string;
          created_by: string | null;
          effective_date: string;
          id: number;
          note: string | null;
          product_id: string;
          reason: Database["public"]["Enums"]["movement_reason"];
          source_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          change: number;
          created_at?: string;
          created_by?: string | null;
          effective_date: string;
          id?: never;
          note?: string | null;
          product_id: string;
          reason: Database["public"]["Enums"]["movement_reason"];
          source_id?: string | null;
        };
        Update: {
          change?: number;
          created_at?: string;
          created_by?: string | null;
          effective_date?: string;
          id?: never;
          note?: string | null;
          product_id?: string;
          reason?: Database["public"]["Enums"]["movement_reason"];
          source_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      suppliers: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          notes?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      product_reserved: {
        Row: {
          product_id: string;
          reserved: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      dashboard_summary: { Args: Record<PropertyKey, never>; Returns: Json };
      delete_old_orders: { Args: Record<PropertyKey, never>; Returns: number };
      expire_uncollected_orders: { Args: Record<PropertyKey, never>; Returns: number };
      get_menu: {
        Args: Record<PropertyKey, never>;
        Returns: {
          available: number;
          category: string;
          description: string;
          emoji: string;
          id: string;
          name: string;
          photo_path: string;
          price_cents: number;
          tags: string[];
        }[];
      };
      get_store_info: { Args: Record<PropertyKey, never>; Returns: Json };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_open_day: { Args: { d: string }; Returns: boolean };
      lookup_order: { Args: { p_last_name: string; p_order_number: number }; Returns: Json };
      next_open_day: { Args: { d: string }; Returns: string };
      place_order: {
        Args: {
          p_first_name: string;
          p_grade: string;
          p_ip_hash: string;
          p_items: Json;
          p_last_name: string;
          p_pickup_date: string;
          p_pickup_window_id: number;
        };
        Returns: Json;
      };
      reconcile_sales_stock: { Args: { p_day: string; p_product_id: string }; Returns: undefined };
      set_order_status: {
        Args: { p_order_id: string; p_status: Database["public"]["Enums"]["order_status"] };
        Returns: undefined;
      };
      store_now_time: { Args: Record<PropertyKey, never>; Returns: string };
      store_today: { Args: Record<PropertyKey, never>; Returns: string };
    };
    Enums: {
      movement_reason:
        | "initial"
        | "restock"
        | "online_pickup"
        | "online_pickup_undo"
        | "sale_import"
        | "manual_adjustment"
        | "spoilage";
      order_status:
        | "received"
        | "preparing"
        | "ready"
        | "picked_up"
        | "canceled"
        | "no_show"
        | "expired";
      payment_type: "cash" | "debit" | "other";
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      movement_reason: [
        "initial",
        "restock",
        "online_pickup",
        "online_pickup_undo",
        "sale_import",
        "manual_adjustment",
        "spoilage",
      ],
      order_status: [
        "received",
        "preparing",
        "ready",
        "picked_up",
        "canceled",
        "no_show",
        "expired",
      ],
      payment_type: ["cash", "debit", "other"],
    },
  },
} as const;
