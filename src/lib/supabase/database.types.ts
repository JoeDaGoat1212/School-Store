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
          order_bundle_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          product_name: string;
          quantity: number;
          unit_price_cents: number;
          order_bundle_id?: string | null;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          product_name?: string;
          quantity?: number;
          unit_price_cents?: number;
          order_bundle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_bundle_id_fkey";
            columns: ["order_bundle_id"];
            isOneToOne: false;
            referencedRelation: "order_bundles";
            referencedColumns: ["id"];
          },
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
          customer_id: string | null;
          subtotal_cents: number;
          discount_cents: number;
          points_earned: number;
          points_spent: number;
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
          customer_id?: string | null;
          subtotal_cents?: number;
          discount_cents?: number;
          points_earned?: number;
          points_spent?: number;
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
          customer_id?: string | null;
          subtotal_cents?: number;
          discount_cents?: number;
          points_earned?: number;
          points_spent?: number;
        };
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
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
          rewards_enabled: boolean;
          points_per_dollar: number;
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
          rewards_enabled?: boolean;
          points_per_dollar?: number;
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
          rewards_enabled?: boolean;
          points_per_dollar?: number;
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
      bundle_items: {
        Row: {
          bundle_id: string;
          product_id: string;
          quantity: number;
        };
        ComputedFields: never;
        Insert: {
          bundle_id: string;
          product_id: string;
          quantity?: number;
        };
        Update: {
          bundle_id?: string;
          product_id?: string;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "bundle_items_bundle_id_fkey";
            columns: ["bundle_id"];
            isOneToOne: false;
            referencedRelation: "bundles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bundle_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      bundles: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          emoji: string | null;
          photo_path: string | null;
          price_cents: number;
          starts_on: string | null;
          ends_on: string | null;
          members_only: boolean;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          emoji?: string | null;
          photo_path?: string | null;
          price_cents: number;
          starts_on?: string | null;
          ends_on?: string | null;
          members_only?: boolean;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          emoji?: string | null;
          photo_path?: string | null;
          price_cents?: number;
          starts_on?: string | null;
          ends_on?: string | null;
          members_only?: boolean;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [

        ];
      };
      customers: {
        Row: {
          id: string;
          email: string;
          first_name: string;
          last_name: string;
          grade: string;
          username: string | null;
          username_key: string | null;
          created_at: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          id: string;
          email: string;
          first_name: string;
          last_name: string;
          grade: string;
          username?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          first_name?: string;
          last_name?: string;
          grade?: string;
          username?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [

        ];
      };
      order_bundles: {
        Row: {
          id: string;
          order_id: string;
          bundle_id: string | null;
          bundle_name: string;
          unit_price_cents: number;
          quantity: number;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          order_id: string;
          bundle_id?: string | null;
          bundle_name: string;
          unit_price_cents: number;
          quantity: number;
        };
        Update: {
          id?: string;
          order_id?: string;
          bundle_id?: string | null;
          bundle_name?: string;
          unit_price_cents?: number;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_bundles_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_bundles_bundle_id_fkey";
            columns: ["bundle_id"];
            isOneToOne: false;
            referencedRelation: "bundles";
            referencedColumns: ["id"];
          },
        ];
      };
      order_discounts: {
        Row: {
          id: string;
          order_id: string;
          label: string;
          amount_cents: number;
          kind: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          order_id: string;
          label: string;
          amount_cents: number;
          kind: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          label?: string;
          amount_cents?: number;
          kind?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_discounts_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      point_entries: {
        Row: {
          id: number;
          customer_id: string;
          change: number;
          reason: Database["public"]["Enums"]["points_reason"];
          order_id: string | null;
          order_number: number | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        ComputedFields: never;
        Insert: {
          id?: number;
          customer_id: string;
          change: number;
          reason: Database["public"]["Enums"]["points_reason"];
          order_id?: string | null;
          order_number?: number | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          customer_id?: string;
          change?: number;
          reason?: Database["public"]["Enums"]["points_reason"];
          order_id?: string | null;
          order_number?: number | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "point_entries_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_entries_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      promotions: {
        Row: {
          id: string;
          kind: string;
          title: string;
          product_id: string | null;
          category: string | null;
          sale_price_cents: number | null;
          buy_qty: number | null;
          get_qty: number | null;
          starts_on: string;
          ends_on: string;
          members_only: boolean;
          featured: boolean;
          active: boolean;
          created_at: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          kind: string;
          title: string;
          product_id?: string | null;
          category?: string | null;
          sale_price_cents?: number | null;
          buy_qty?: number | null;
          get_qty?: number | null;
          starts_on: string;
          ends_on: string;
          members_only?: boolean;
          featured?: boolean;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          kind?: string;
          title?: string;
          product_id?: string | null;
          category?: string | null;
          sale_price_cents?: number | null;
          buy_qty?: number | null;
          get_qty?: number | null;
          starts_on?: string;
          ends_on?: string;
          members_only?: boolean;
          featured?: boolean;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "promotions_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      rewards: {
        Row: {
          id: string;
          product_id: string;
          points_cost: number;
          active: boolean;
          created_at: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          product_id: string;
          points_cost: number;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          points_cost?: number;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rewards_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
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
      adjust_points: { Args: { p_change: number; p_customer_id: string; p_note: string }; Returns: undefined };
      get_deals: { Args: Record<PropertyKey, never>; Returns: Json };
      get_my_account: { Args: Record<PropertyKey, never>; Returns: Json };
      get_rewards: { Args: Record<PropertyKey, never>; Returns: Json };
      lookup_my_order: { Args: { p_order_number: number }; Returns: Json };
      members_list: {
        Args: Record<PropertyKey, never>;
        Returns: {
          balance: number;
          created_at: string;
          email: string;
          first_name: string;
          grade: string;
          id: string;
          last_name: string;
          last_order_at: string | null;
          orders: number;
        }[];
      };
      quote_cart: { Args: { p_bundles?: Json; p_items: Json; p_reward_id?: string }; Returns: Json };
      save_profile: { Args: { p_first_name: string; p_grade: string; p_last_name: string; p_username?: string | null }; Returns: undefined };
      username_available: { Args: { p_username: string }; Returns: boolean };
      dashboard_summary: { Args: Record<PropertyKey, never>; Returns: Json };
      delete_expense: { Args: { p_expense_id: string }; Returns: string };
      delete_old_orders: { Args: Record<PropertyKey, never>; Returns: number };
      existing_fingerprints: { Args: { p_fingerprints: string[] }; Returns: string[] };
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
      import_sales: { Args: { p: Json }; Returns: Json };
      insights: { Args: { p_bucket?: string; p_from: string; p_to: string }; Returns: Json };
      inventory_snapshot: { Args: Record<PropertyKey, never>; Returns: Json };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_open_day: { Args: { d: string }; Returns: boolean };
      link_item_name: { Args: { p_product_id: string; p_raw_name: string }; Returns: number };
      lookup_order: { Args: { p_last_name: string; p_order_number: number }; Returns: Json };
      next_open_day: { Args: { d: string }; Returns: string };
      place_order: {
        Args: {
          p_bundles?: Json;
          p_customer_id?: string;
          p_first_name: string;
          p_grade: string;
          p_ip_hash: string;
          p_items: Json;
          p_last_name: string;
          p_pickup_date: string;
          p_pickup_window_id: number;
          p_reward_id?: string;
        };
        Returns: Json;
      };
      reconcile_pairs: { Args: { p_pairs: Json }; Returns: undefined };
      reconcile_sales_stock: { Args: { p_day: string; p_product_id: string }; Returns: undefined };
      save_expense: { Args: { p: Json }; Returns: string };
      set_order_status: {
        Args: { p_order_id: string; p_status: Database["public"]["Enums"]["order_status"] };
        Returns: undefined;
      };
      store_now_time: { Args: Record<PropertyKey, never>; Returns: string };
      store_today: { Args: Record<PropertyKey, never>; Returns: string };
      undo_import: { Args: { p_import_id: string }; Returns: undefined };
      unmatched_item_names: {
        Args: Record<PropertyKey, never>;
        Returns: {
          last_sold: string;
          lines: number;
          raw_item_name: string;
          revenue_cents: number;
          units: number;
        }[];
      };
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
      points_reason: "earned" | "earned_undo" | "redeemed" | "refunded" | "adjusted";
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
      points_reason: ["earned", "earned_undo", "redeemed", "refunded", "adjusted"],
    },
  },
} as const;
