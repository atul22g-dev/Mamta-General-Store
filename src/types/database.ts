/**
 * Database types for the Mamta General Store schema.
 *
 * Hand-written to mirror supabase/schema-gen output (same shape the CLI's
 * `supabase gen types` produces), so supabase-js gets full end-to-end
 * typing: Row / Insert / Update per table plus Relationships for embeds.
 *
 * Regenerate after schema changes with:
 *   npx supabase gen types typescript --local > src/types/database.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          role: Database['public']['Enums']['user_role'];
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: Database['public']['Enums']['user_role'];
        };
        Update: {
          id?: string;
          email?: string;
          role?: Database['public']['Enums']['user_role'];
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          category: Database['public']['Enums']['product_category'];
          mrp: number;
          selling_price: number;
          stock: number;
          unit: Database['public']['Enums']['product_unit'];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          category: Database['public']['Enums']['product_category'];
          mrp: number;
          selling_price: number;
          stock?: number;
          unit: Database['public']['Enums']['product_unit'];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          category?: Database['public']['Enums']['product_category'];
          mrp?: number;
          selling_price?: number;
          stock?: number;
          unit?: Database['public']['Enums']['product_unit'];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_images: {
        Row: {
          id: string;
          product_id: string;
          image_url: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          image_url: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          image_url?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'product_images_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: 'admin' | 'staff';
      product_category:
        | 'household'
        | 'personal_care'
        | 'other';
      product_unit: 'piece' | 'Meter';
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type Insertable<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type Updatable<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
export type Enums = Database['public']['Enums'];

/** A product row, e.g. for catalog screens. */
export type Product = Tables<'products'>;
/** A product image row. */
export type ProductImage = Tables<'product_images'>;
/** A staff/admin profile row. */
export type Profile = Tables<'profiles'>;
