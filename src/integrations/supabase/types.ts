export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ideas: {
        Row: {
          id: string; user_id: string; text: string; created_at: number;
          article_title: string | null; article_body: string | null; updated_at: number;
        };
        Insert: {
          id: string; user_id: string; text: string; created_at: number;
          article_title?: string | null; article_body?: string | null; updated_at?: number;
        };
        Update: Partial<Database["public"]["Tables"]["ideas"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
