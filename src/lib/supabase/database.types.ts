// Authored by DotWin
// Generated Supabase types for prod project klwkajukicsoiwpsgftt.
// Regenerate with: supabase gen types (or the Supabase MCP) after any migration.

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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          city: string
          country: string | null
          created_at: string | null
          id: string
          is_default: boolean | null
          label: string | null
          line1: string
          line2: string | null
          postal_code: string
          profile_id: string | null
          state: string
        }
        Insert: {
          city: string
          country?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          label?: string | null
          line1: string
          line2?: string | null
          postal_code: string
          profile_id?: string | null
          state: string
        }
        Update: {
          city?: string
          country?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          label?: string | null
          line1?: string
          line2?: string | null
          postal_code?: string
          profile_id?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      artwork_funnels: {
        Row: {
          add_to_cart_count: number | null
          amplify_body: string | null
          amplify_heading: string | null
          created_at: string | null
          final_cta_text: string | null
          id: string
          is_published: boolean | null
          offer_heading: string | null
          offer_original_description: string | null
          offer_print_description: string | null
          og_image_url: string | null
          problem_body: string | null
          problem_heading: string | null
          product_id: string
          purchase_count: number | null
          risk_reversal_body: string | null
          risk_reversal_heading: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          story_body_html: string | null
          story_body_json: Json | null
          story_heading: string | null
          template: string
          transformation_body: string | null
          transformation_heading: string | null
          updated_at: string | null
          views_count: number | null
        }
        Insert: {
          add_to_cart_count?: number | null
          amplify_body?: string | null
          amplify_heading?: string | null
          created_at?: string | null
          final_cta_text?: string | null
          id?: string
          is_published?: boolean | null
          offer_heading?: string | null
          offer_original_description?: string | null
          offer_print_description?: string | null
          og_image_url?: string | null
          problem_body?: string | null
          problem_heading?: string | null
          product_id: string
          purchase_count?: number | null
          risk_reversal_body?: string | null
          risk_reversal_heading?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          story_body_html?: string | null
          story_body_json?: Json | null
          story_heading?: string | null
          template: string
          transformation_body?: string | null
          transformation_heading?: string | null
          updated_at?: string | null
          views_count?: number | null
        }
        Update: {
          add_to_cart_count?: number | null
          amplify_body?: string | null
          amplify_heading?: string | null
          created_at?: string | null
          final_cta_text?: string | null
          id?: string
          is_published?: boolean | null
          offer_heading?: string | null
          offer_original_description?: string | null
          offer_print_description?: string | null
          og_image_url?: string | null
          problem_body?: string | null
          problem_heading?: string | null
          product_id?: string
          purchase_count?: number | null
          risk_reversal_body?: string | null
          risk_reversal_heading?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          story_body_html?: string | null
          story_body_json?: Json | null
          story_heading?: string | null
          template?: string
          transformation_body?: string | null
          transformation_heading?: string | null
          updated_at?: string | null
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "artwork_funnels_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          changed_by: string | null
          created_at: string | null
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bio_callouts: {
        Row: {
          body_markdown: string
          display_order: number
          id: string
          is_published: boolean
          kind: string
          label: string
          updated_at: string
        }
        Insert: {
          body_markdown?: string
          display_order?: number
          id?: string
          is_published?: boolean
          kind: string
          label: string
          updated_at?: string
        }
        Update: {
          body_markdown?: string
          display_order?: number
          id?: string
          is_published?: boolean
          kind?: string
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      bio_credentials_block: {
        Row: {
          contact_email: string
          degrees: Json
          full_name: string
          hero_image_url: string | null
          id: boolean
          updated_at: string
        }
        Insert: {
          contact_email?: string
          degrees?: Json
          full_name?: string
          hero_image_url?: string | null
          id?: boolean
          updated_at?: string
        }
        Update: {
          contact_email?: string
          degrees?: Json
          full_name?: string
          hero_image_url?: string | null
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      bio_sections: {
        Row: {
          body_markdown: string
          display_order: number
          heading: string
          id: string
          image_alt: string | null
          image_url: string | null
          is_published: boolean
          section_key: string
          updated_at: string
        }
        Insert: {
          body_markdown?: string
          display_order?: number
          heading: string
          id?: string
          image_alt?: string | null
          image_url?: string | null
          is_published?: boolean
          section_key: string
          updated_at?: string
        }
        Update: {
          body_markdown?: string
          display_order?: number
          heading?: string
          id?: string
          image_alt?: string | null
          image_url?: string | null
          is_published?: boolean
          section_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author_id: string | null
          content_html: string
          content_json: Json
          cover_image_url: string | null
          created_at: string | null
          excerpt: string | null
          id: string
          publish_at: string | null
          published_at: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          author_id?: string | null
          content_html: string
          content_json: Json
          cover_image_url?: string | null
          created_at?: string | null
          excerpt?: string | null
          id?: string
          publish_at?: string | null
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string | null
          content_html?: string
          content_json?: Json
          cover_image_url?: string | null
          created_at?: string | null
          excerpt?: string | null
          id?: string
          publish_at?: string | null
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          abandoned_email_1_sent_at: string | null
          abandoned_email_2_sent_at: string | null
          abandoned_email_3_sent_at: string | null
          contact_id: string | null
          converted_order_id: string | null
          created_at: string | null
          email: string | null
          id: string
          items: Json
          last_activity_at: string | null
          nurture_last_sent_at: string | null
          nurture_started_at: string | null
          profile_id: string | null
          promo_code_id: string | null
          shipping_surcharge_cents: number
          status: string
          subtotal: number | null
          updated_at: string | null
        }
        Insert: {
          abandoned_email_1_sent_at?: string | null
          abandoned_email_2_sent_at?: string | null
          abandoned_email_3_sent_at?: string | null
          contact_id?: string | null
          converted_order_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          items?: Json
          last_activity_at?: string | null
          nurture_last_sent_at?: string | null
          nurture_started_at?: string | null
          profile_id?: string | null
          promo_code_id?: string | null
          shipping_surcharge_cents?: number
          status?: string
          subtotal?: number | null
          updated_at?: string | null
        }
        Update: {
          abandoned_email_1_sent_at?: string | null
          abandoned_email_2_sent_at?: string | null
          abandoned_email_3_sent_at?: string | null
          contact_id?: string | null
          converted_order_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          items?: Json
          last_activity_at?: string | null
          nurture_last_sent_at?: string | null
          nurture_started_at?: string | null
          profile_id?: string | null
          promo_code_id?: string | null
          shipping_surcharge_cents?: number
          status?: string
          subtotal?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          default_margin_pct: number | null
          description: string | null
          id: string
          image_url: string | null
          name: string
          slug: string
          sort_order: number | null
        }
        Insert: {
          default_margin_pct?: number | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          slug: string
          sort_order?: number | null
        }
        Update: {
          default_margin_pct?: number | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      change_requests: {
        Row: {
          attachments: string[] | null
          completed_at: string | null
          created_at: string | null
          description: string
          developer_notes: string | null
          git_branch: string | null
          id: string
          page_affected: string | null
          preview_url: string | null
          priority: string | null
          requester_id: string | null
          status: string | null
          title: string
        }
        Insert: {
          attachments?: string[] | null
          completed_at?: string | null
          created_at?: string | null
          description: string
          developer_notes?: string | null
          git_branch?: string | null
          id?: string
          page_affected?: string | null
          preview_url?: string | null
          priority?: string | null
          requester_id?: string | null
          status?: string | null
          title: string
        }
        Update: {
          attachments?: string[] | null
          completed_at?: string | null
          created_at?: string | null
          description?: string
          developer_notes?: string | null
          git_branch?: string | null
          id?: string
          page_affected?: string | null
          preview_url?: string | null
          priority?: string | null
          requester_id?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_snapshots: {
        Row: {
          cart_id: string | null
          created_at: string
          discount_cents: number
          email: string | null
          items: Json
          payment_ref: string
          subtotal_cents: number
          surcharge_cents: number
          tax_cents: number
        }
        Insert: {
          cart_id?: string | null
          created_at?: string
          discount_cents?: number
          email?: string | null
          items: Json
          payment_ref: string
          subtotal_cents: number
          surcharge_cents?: number
          tax_cents?: number
        }
        Update: {
          cart_id?: string | null
          created_at?: string
          discount_cents?: number
          email?: string | null
          items?: Json
          payment_ref?: string
          subtotal_cents?: number
          surcharge_cents?: number
          tax_cents?: number
        }
        Relationships: []
      }
      class_bookings: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          payment_method: string | null
          payment_received_at: string | null
          pet_photo_urls: string[]
          phone: string | null
          session_id: string
          special_notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          payment_method?: string | null
          payment_received_at?: string | null
          pet_photo_urls?: string[]
          phone?: string | null
          session_id: string
          special_notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          payment_method?: string | null
          payment_received_at?: string | null
          pet_photo_urls?: string[]
          phone?: string | null
          session_id?: string
          special_notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      class_sessions: {
        Row: {
          audience: string
          capacity: number
          created_at: string
          description: string | null
          ends_at: string
          gallery_image_urls: string[]
          hero_image_url: string | null
          id: string
          location_address: string
          location_name: string
          price_cents: number
          signup_url: string | null
          slug: string
          starts_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          audience: string
          capacity: number
          created_at?: string
          description?: string | null
          ends_at: string
          gallery_image_urls?: string[]
          hero_image_url?: string | null
          id?: string
          location_address: string
          location_name: string
          price_cents: number
          signup_url?: string | null
          slug: string
          starts_at: string
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          audience?: string
          capacity?: number
          created_at?: string
          description?: string | null
          ends_at?: string
          gallery_image_urls?: string[]
          hero_image_url?: string | null
          id?: string
          location_address?: string
          location_name?: string
          price_cents?: number
          signup_url?: string | null
          slug?: string
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      commission_messages: {
        Row: {
          attachments: string[] | null
          commission_id: string | null
          created_at: string | null
          id: string
          message: string
          sender_id: string | null
          sender_type: string
        }
        Insert: {
          attachments?: string[] | null
          commission_id?: string | null
          created_at?: string | null
          id?: string
          message: string
          sender_id?: string | null
          sender_type: string
        }
        Update: {
          attachments?: string[] | null
          commission_id?: string | null
          created_at?: string | null
          id?: string
          message?: string
          sender_id?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_messages_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_milestones: {
        Row: {
          commission_id: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          id: string
          images: string[] | null
          status: string | null
          title: string
        }
        Insert: {
          commission_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          images?: string[] | null
          status?: string | null
          title: string
        }
        Update: {
          commission_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          images?: string[] | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_milestones_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "commissions"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          budget_range: string | null
          client_email: string
          client_name: string
          client_phone: string | null
          commission_number: number
          created_at: string | null
          deposit_amount: number | null
          deposit_stripe_invoice_id: string | null
          description: string
          estimated_completion: string | null
          final_stripe_invoice_id: string | null
          id: string
          preferred_medium: string | null
          preferred_size: string | null
          profile_id: string | null
          quoted_price: number | null
          reference_images: string[] | null
          shipping_address: Json | null
          status: string | null
          timeline: string | null
          updated_at: string | null
        }
        Insert: {
          budget_range?: string | null
          client_email: string
          client_name: string
          client_phone?: string | null
          commission_number?: number
          created_at?: string | null
          deposit_amount?: number | null
          deposit_stripe_invoice_id?: string | null
          description: string
          estimated_completion?: string | null
          final_stripe_invoice_id?: string | null
          id?: string
          preferred_medium?: string | null
          preferred_size?: string | null
          profile_id?: string | null
          quoted_price?: number | null
          reference_images?: string[] | null
          shipping_address?: Json | null
          status?: string | null
          timeline?: string | null
          updated_at?: string | null
        }
        Update: {
          budget_range?: string | null
          client_email?: string
          client_name?: string
          client_phone?: string | null
          commission_number?: number
          created_at?: string | null
          deposit_amount?: number | null
          deposit_stripe_invoice_id?: string | null
          description?: string
          estimated_completion?: string | null
          final_stripe_invoice_id?: string | null
          id?: string
          preferred_medium?: string | null
          preferred_size?: string | null
          profile_id?: string | null
          quoted_price?: number | null
          reference_images?: string[] | null
          shipping_address?: Json | null
          status?: string | null
          timeline?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_list_members: {
        Row: {
          contact_id: string
          joined_at: string
          list_id: string
          source: string | null
        }
        Insert: {
          contact_id: string
          joined_at?: string
          list_id: string
          source?: string | null
        }
        Update: {
          contact_id?: string
          joined_at?: string
          list_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_list_members_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_lists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      course_modules: {
        Row: {
          course_id: string | null
          description: string | null
          id: string
          sort_order: number | null
          title: string
        }
        Insert: {
          course_id?: string | null
          description?: string | null
          id?: string
          sort_order?: number | null
          title: string
        }
        Update: {
          course_id?: string | null
          description?: string | null
          id?: string
          sort_order?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          course_type: string | null
          created_at: string | null
          description: string | null
          difficulty_level: string | null
          id: string
          instructor_name: string | null
          long_description: string | null
          materials_needed: string | null
          preview_video_url: string | null
          price: number | null
          published_at: string | null
          slug: string
          status: string | null
          stripe_price_id: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          course_type?: string | null
          created_at?: string | null
          description?: string | null
          difficulty_level?: string | null
          id?: string
          instructor_name?: string | null
          long_description?: string | null
          materials_needed?: string | null
          preview_video_url?: string | null
          price?: number | null
          published_at?: string | null
          slug: string
          status?: string | null
          stripe_price_id?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          course_type?: string | null
          created_at?: string | null
          description?: string | null
          difficulty_level?: string | null
          id?: string
          instructor_name?: string | null
          long_description?: string | null
          materials_needed?: string | null
          preview_video_url?: string | null
          price?: number | null
          published_at?: string | null
          slug?: string
          status?: string | null
          stripe_price_id?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      crm_contacts: {
        Row: {
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_active_at: string | null
          last_name: string | null
          last_purchase_at: string | null
          notes: string | null
          phone: string | null
          profile_id: string | null
          source: string | null
          status: string
          tags: string[]
          total_orders: number
          total_spent_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          last_active_at?: string | null
          last_name?: string | null
          last_purchase_at?: string | null
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          source?: string | null
          status?: string
          tags?: string[]
          total_orders?: number
          total_spent_cents?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_active_at?: string | null
          last_name?: string | null
          last_purchase_at?: string | null
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          source?: string | null
          status?: string
          tags?: string[]
          total_orders?: number
          total_spent_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cv_entries: {
        Row: {
          award: string | null
          created_at: string
          display_order: number
          id: string
          institution: string | null
          is_published: boolean
          juror: string | null
          linked_artwork_slug: string | null
          location: string | null
          notes: string | null
          section: string
          sort_year_numeric: number
          title: string
          updated_at: string
          venue: string | null
          year: string
        }
        Insert: {
          award?: string | null
          created_at?: string
          display_order?: number
          id?: string
          institution?: string | null
          is_published?: boolean
          juror?: string | null
          linked_artwork_slug?: string | null
          location?: string | null
          notes?: string | null
          section: string
          sort_year_numeric: number
          title: string
          updated_at?: string
          venue?: string | null
          year: string
        }
        Update: {
          award?: string | null
          created_at?: string
          display_order?: number
          id?: string
          institution?: string | null
          is_published?: boolean
          juror?: string | null
          linked_artwork_slug?: string | null
          location?: string | null
          notes?: string | null
          section?: string
          sort_year_numeric?: number
          title?: string
          updated_at?: string
          venue?: string | null
          year?: string
        }
        Relationships: []
      }
      cv_settings: {
        Row: {
          contact_email: string
          id: boolean
          intro: string
          updated_at: string
        }
        Insert: {
          contact_email?: string
          id?: boolean
          intro?: string
          updated_at?: string
        }
        Update: {
          contact_email?: string
          id?: boolean
          intro?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_automation_sends: {
        Row: {
          automation_id: string | null
          contact_id: string | null
          dedupe_key: string | null
          email_snapshot: string
          id: string
          resend_message_id: string | null
          sent_at: string
          status: string
          step_id: string | null
        }
        Insert: {
          automation_id?: string | null
          contact_id?: string | null
          dedupe_key?: string | null
          email_snapshot: string
          id?: string
          resend_message_id?: string | null
          sent_at?: string
          status?: string
          step_id?: string | null
        }
        Update: {
          automation_id?: string | null
          contact_id?: string | null
          dedupe_key?: string | null
          email_snapshot?: string
          id?: string
          resend_message_id?: string | null
          sent_at?: string
          status?: string
          step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_automation_sends_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "email_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_automation_sends_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_automation_sends_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "email_automation_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      email_automation_steps: {
        Row: {
          automation_id: string | null
          content_html: string
          created_at: string
          delay_minutes: number
          id: string
          preheader: string | null
          promo_code_kind: string | null
          promo_expires_in_hours: number | null
          promo_percent_off: number | null
          step_order: number
          subject: string
        }
        Insert: {
          automation_id?: string | null
          content_html?: string
          created_at?: string
          delay_minutes: number
          id?: string
          preheader?: string | null
          promo_code_kind?: string | null
          promo_expires_in_hours?: number | null
          promo_percent_off?: number | null
          step_order: number
          subject: string
        }
        Update: {
          automation_id?: string | null
          content_html?: string
          created_at?: string
          delay_minutes?: number
          id?: string
          preheader?: string | null
          promo_code_kind?: string | null
          promo_expires_in_hours?: number | null
          promo_percent_off?: number | null
          step_order?: number
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_automation_steps_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "email_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_automation_triggers: {
        Row: {
          contact_id: string | null
          created_at: string
          email_snapshot: string | null
          id: string
          processed_at: string | null
          related_order_id: string | null
          trigger_event: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          email_snapshot?: string | null
          id?: string
          processed_at?: string | null
          related_order_id?: string | null
          trigger_event: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          email_snapshot?: string | null
          id?: string
          processed_at?: string | null
          related_order_id?: string | null
          trigger_event?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_automation_triggers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_automation_triggers_related_order_id_fkey"
            columns: ["related_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      email_automations: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string | null
          trigger_event: string
          updated_at: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug?: string | null
          trigger_event: string
          updated_at?: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string | null
          trigger_event?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_campaign_recipients: {
        Row: {
          campaign_id: string
          clicked_at: string | null
          contact_id: string | null
          email_snapshot: string
          error: string | null
          first_name_snapshot: string | null
          id: string
          opened_at: string | null
          queued_at: string
          resend_message_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          clicked_at?: string | null
          contact_id?: string | null
          email_snapshot: string
          error?: string | null
          first_name_snapshot?: string | null
          id?: string
          opened_at?: string | null
          queued_at?: string
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          clicked_at?: string | null
          contact_id?: string | null
          email_snapshot?: string
          error?: string | null
          first_name_snapshot?: string | null
          id?: string
          opened_at?: string | null
          queued_at?: string
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          audience_list_id: string | null
          clicked_count: number
          content_html: string
          content_json: Json | null
          created_at: string | null
          created_by: string | null
          failed_count: number
          from_email: string | null
          from_name: string | null
          id: string
          name: string
          opened_count: number
          preheader: string | null
          promo_code_id: string | null
          queued_count: number
          scheduled_at: string | null
          sent_at: string | null
          sent_count: number
          status: string | null
          subject: string
          unsubscribed_count: number
          updated_at: string
        }
        Insert: {
          audience_list_id?: string | null
          clicked_count?: number
          content_html?: string
          content_json?: Json | null
          created_at?: string | null
          created_by?: string | null
          failed_count?: number
          from_email?: string | null
          from_name?: string | null
          id?: string
          name: string
          opened_count?: number
          preheader?: string | null
          promo_code_id?: string | null
          queued_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string | null
          subject: string
          unsubscribed_count?: number
          updated_at?: string
        }
        Update: {
          audience_list_id?: string | null
          clicked_count?: number
          content_html?: string
          content_json?: Json | null
          created_at?: string | null
          created_by?: string | null
          failed_count?: number
          from_email?: string | null
          from_name?: string | null
          id?: string
          name?: string
          opened_count?: number
          preheader?: string | null
          promo_code_id?: string | null
          queued_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string | null
          subject?: string
          unsubscribed_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_audience_list_id_fkey"
            columns: ["audience_list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sends: {
        Row: {
          automation_id: string | null
          campaign_id: string | null
          clicked_at: string | null
          email: string
          id: string
          opened_at: string | null
          resend_message_id: string | null
          sent_at: string | null
          status: string | null
          template_id: string | null
          variables_used: Json | null
        }
        Insert: {
          automation_id?: string | null
          campaign_id?: string | null
          clicked_at?: string | null
          email: string
          id?: string
          opened_at?: string | null
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string | null
          template_id?: string | null
          variables_used?: Json | null
        }
        Update: {
          automation_id?: string | null
          campaign_id?: string | null
          clicked_at?: string | null
          email?: string
          id?: string
          opened_at?: string | null
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string | null
          template_id?: string | null
          variables_used?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_sends_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "email_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          category: string | null
          content_html: string
          content_json: Json
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          subject: string
          template_type: string
          updated_at: string | null
          variables: string[] | null
        }
        Insert: {
          category?: string | null
          content_html: string
          content_json: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          subject: string
          template_type: string
          updated_at?: string | null
          variables?: string[] | null
        }
        Update: {
          category?: string | null
          content_html?: string
          content_json?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          subject?: string
          template_type?: string
          updated_at?: string | null
          variables?: string[] | null
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          completed_at: string | null
          course_id: string | null
          enrolled_at: string | null
          id: string
          profile_id: string | null
          status: string | null
          stripe_checkout_session_id: string | null
        }
        Insert: {
          completed_at?: string | null
          course_id?: string | null
          enrolled_at?: string | null
          id?: string
          profile_id?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
        }
        Update: {
          completed_at?: string | null
          course_id?: string | null
          enrolled_at?: string | null
          id?: string
          profile_id?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer_html: string
          answer_json: Json
          category: string | null
          id: string
          is_published: boolean | null
          question: string
          sort_order: number | null
        }
        Insert: {
          answer_html: string
          answer_json: Json
          category?: string | null
          id?: string
          is_published?: boolean | null
          question: string
          sort_order?: number | null
        }
        Update: {
          answer_html?: string
          answer_json?: Json
          category?: string | null
          id?: string
          is_published?: boolean | null
          question?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      feedback_audit_log: {
        Row: {
          action: string
          created_at: string | null
          feedback_id: string
          id: string
          new_value: string | null
          old_value: string | null
          profile_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          feedback_id: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          profile_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          feedback_id?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_audit_log_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback_items"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_comments: {
        Row: {
          created_at: string | null
          feedback_id: string | null
          id: string
          message: string
          profile_id: string | null
          sender_role: string
        }
        Insert: {
          created_at?: string | null
          feedback_id?: string | null
          id?: string
          message: string
          profile_id?: string | null
          sender_role: string
        }
        Update: {
          created_at?: string | null
          feedback_id?: string | null
          id?: string
          message?: string
          profile_id?: string | null
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_comments_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_items: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          page_or_feature: string | null
          priority: string | null
          profile_id: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          page_or_feature?: string | null
          priority?: string | null
          profile_id?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          page_or_feature?: string | null
          priority?: string | null
          profile_id?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_items_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillment_jobs: {
        Row: {
          attempts: number
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          max_attempts: number
          order_id: string
          run_after: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          order_id: string
          run_after?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          order_id?: string
          run_after?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          lesson_id: string | null
          parent_id: string | null
          profile_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          lesson_id?: string | null
          parent_id?: string | null
          profile_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          lesson_id?: string | null
          parent_id?: string | null
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_comments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "lesson_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed_at: string | null
          enrollment_id: string | null
          id: string
          is_completed: boolean | null
          last_position_seconds: number | null
          lesson_id: string | null
        }
        Insert: {
          completed_at?: string | null
          enrollment_id?: string | null
          id?: string
          is_completed?: boolean | null
          last_position_seconds?: number | null
          lesson_id?: string | null
        }
        Update: {
          completed_at?: string | null
          enrollment_id?: string | null
          id?: string
          is_completed?: boolean | null
          last_position_seconds?: number | null
          lesson_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          content_html: string | null
          content_json: Json | null
          created_at: string | null
          description: string | null
          id: string
          is_preview: boolean | null
          module_id: string | null
          resources: Json | null
          slug: string
          sort_order: number | null
          title: string
          video_duration_minutes: number | null
          video_url: string | null
        }
        Insert: {
          content_html?: string | null
          content_json?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_preview?: boolean | null
          module_id?: string | null
          resources?: Json | null
          slug: string
          sort_order?: number | null
          title: string
          video_duration_minutes?: number | null
          video_url?: string | null
        }
        Update: {
          content_html?: string | null
          content_json?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_preview?: boolean | null
          module_id?: string | null
          resources?: Json | null
          slug?: string
          sort_order?: number | null
          title?: string
          video_duration_minutes?: number | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      lumaprints_mediums: {
        Row: {
          category_id: number | null
          enabled: boolean
          last_synced_at: string | null
          medium: string
          name: string | null
          notes: string | null
          option_ids: number[]
          sizes: Json
          subcategory_id: number | null
        }
        Insert: {
          category_id?: number | null
          enabled?: boolean
          last_synced_at?: string | null
          medium: string
          name?: string | null
          notes?: string | null
          option_ids?: number[]
          sizes?: Json
          subcategory_id?: number | null
        }
        Update: {
          category_id?: number | null
          enabled?: boolean
          last_synced_at?: string | null
          medium?: string
          name?: string | null
          notes?: string | null
          option_ids?: number[]
          sizes?: Json
          subcategory_id?: number | null
        }
        Relationships: []
      }
      lumaprints_pricing_cache: {
        Row: {
          cost_cents: number
          expires_at: string
          fetched_at: string
          id: string
          medium: string
          shipping_cents: number
          size_label: string
        }
        Insert: {
          cost_cents: number
          expires_at?: string
          fetched_at?: string
          id?: string
          medium: string
          shipping_cents: number
          size_label: string
        }
        Update: {
          cost_cents?: number
          expires_at?: string
          fetched_at?: string
          id?: string
          medium?: string
          shipping_cents?: number
          size_label?: string
        }
        Relationships: []
      }
      master_artworks: {
        Row: {
          border_color: string
          border_mode: string
          created_at: string
          crop_box: Json | null
          description: string | null
          dpi: number | null
          file_name: string
          file_size_bytes: number
          height_px: number | null
          id: string
          mime_type: string
          print_error: string | null
          print_height_px: number | null
          print_requested_at: string | null
          print_status: string
          print_storage_path: string | null
          print_updated_at: string | null
          print_width_px: number | null
          storage_path: string
          title: string
          updated_at: string
          uploaded_by: string | null
          width_px: number | null
        }
        Insert: {
          border_color?: string
          border_mode?: string
          created_at?: string
          crop_box?: Json | null
          description?: string | null
          dpi?: number | null
          file_name: string
          file_size_bytes?: number
          height_px?: number | null
          id?: string
          mime_type: string
          print_error?: string | null
          print_height_px?: number | null
          print_requested_at?: string | null
          print_status?: string
          print_storage_path?: string | null
          print_updated_at?: string | null
          print_width_px?: number | null
          storage_path: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
          width_px?: number | null
        }
        Update: {
          border_color?: string
          border_mode?: string
          created_at?: string
          crop_box?: Json | null
          description?: string | null
          dpi?: number | null
          file_name?: string
          file_size_bytes?: number
          height_px?: number | null
          id?: string
          mime_type?: string
          print_error?: string | null
          print_height_px?: number | null
          print_requested_at?: string | null
          print_status?: string
          print_storage_path?: string | null
          print_updated_at?: string | null
          print_width_px?: number | null
          storage_path?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          width_px?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "master_artworks_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_library: {
        Row: {
          alt_text: string | null
          byte_size: number | null
          categories: string[]
          created_at: string
          file_name: string
          height: number | null
          id: string
          mime_type: string | null
          source: string | null
          storage_bucket: string
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          url: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          byte_size?: number | null
          categories?: string[]
          created_at?: string
          file_name: string
          height?: number | null
          id?: string
          mime_type?: string | null
          source?: string | null
          storage_bucket: string
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          url: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          byte_size?: number | null
          categories?: string[]
          created_at?: string
          file_name?: string
          height?: number | null
          id?: string
          mime_type?: string | null
          source?: string | null
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          url?: string
          width?: number | null
        }
        Relationships: []
      }
      meta_events: {
        Row: {
          created_at: string | null
          custom_data: Json | null
          event_id: string
          event_name: string
          id: string
          meta_response: Json | null
          sent_to_meta: boolean | null
          source_url: string | null
          user_data: Json | null
        }
        Insert: {
          created_at?: string | null
          custom_data?: Json | null
          event_id: string
          event_name: string
          id?: string
          meta_response?: Json | null
          sent_to_meta?: boolean | null
          source_url?: string | null
          user_data?: Json | null
        }
        Update: {
          created_at?: string | null
          custom_data?: Json | null
          event_id?: string
          event_name?: string
          id?: string
          meta_response?: Json | null
          sent_to_meta?: boolean | null
          source_url?: string | null
          user_data?: Json | null
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          email: string
          first_name: string | null
          id: string
          source: string | null
          subscribed_at: string | null
          unsubscribed_at: string | null
        }
        Insert: {
          email: string
          first_name?: string | null
          id?: string
          source?: string | null
          subscribed_at?: string | null
          unsubscribed_at?: string | null
        }
        Update: {
          email?: string
          first_name?: string | null
          id?: string
          source?: string | null
          subscribed_at?: string | null
          unsubscribed_at?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          carrier: string | null
          delivered_at: string | null
          external_item_id: string | null
          external_order_id: string | null
          fulfillment_status: string | null
          fulfillment_type: string
          id: string
          lumaprints_option_ids: number[]
          lumaprints_subcategory_id: number | null
          medium: string | null
          order_id: string | null
          print_height_in: number | null
          print_storage_path: string | null
          print_width_in: number | null
          product_id: string | null
          quantity: number
          shipped_at: string | null
          size_label: string | null
          tracking_number: string | null
          tracking_url: string | null
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          carrier?: string | null
          delivered_at?: string | null
          external_item_id?: string | null
          external_order_id?: string | null
          fulfillment_status?: string | null
          fulfillment_type: string
          id?: string
          lumaprints_option_ids?: number[]
          lumaprints_subcategory_id?: number | null
          medium?: string | null
          order_id?: string | null
          print_height_in?: number | null
          print_storage_path?: string | null
          print_width_in?: number | null
          product_id?: string | null
          quantity?: number
          shipped_at?: string | null
          size_label?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          unit_price: number
          variant_id?: string | null
        }
        Update: {
          carrier?: string | null
          delivered_at?: string | null
          external_item_id?: string | null
          external_order_id?: string | null
          fulfillment_status?: string | null
          fulfillment_type?: string
          id?: string
          lumaprints_option_ids?: number[]
          lumaprints_subcategory_id?: number | null
          medium?: string | null
          order_id?: string | null
          print_height_in?: number | null
          print_storage_path?: string | null
          print_width_in?: number | null
          product_id?: string | null
          quantity?: number
          shipped_at?: string | null
          size_label?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          billing_address: Json | null
          created_at: string | null
          discount: number | null
          email: string
          id: string
          notes: string | null
          order_number: number
          profile_id: string | null
          promo_code: string | null
          shipping_address: Json
          shipping_cost: number | null
          side_effects_completed_at: string | null
          status: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          subtotal: number
          tax: number | null
          total: number
          updated_at: string | null
        }
        Insert: {
          billing_address?: Json | null
          created_at?: string | null
          discount?: number | null
          email: string
          id?: string
          notes?: string | null
          order_number?: number
          profile_id?: string | null
          promo_code?: string | null
          shipping_address: Json
          shipping_cost?: number | null
          side_effects_completed_at?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal: number
          tax?: number | null
          total: number
          updated_at?: string | null
        }
        Update: {
          billing_address?: Json | null
          created_at?: string | null
          discount?: number | null
          email?: string
          id?: string
          notes?: string | null
          order_number?: number
          profile_id?: string | null
          promo_code?: string | null
          shipping_address?: Json
          shipping_cost?: number | null
          side_effects_completed_at?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax?: number | null
          total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      page_blocks: {
        Row: {
          block_type: string
          config: Json | null
          created_at: string | null
          id: string
          is_visible: boolean | null
          page: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          block_type: string
          config?: Json | null
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          page: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          block_type?: string
          config?: Json | null
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          page?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      page_revisions: {
        Row: {
          created_at: string
          edited_by: string | null
          id: string
          page_slug: string
          section_key: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          edited_by?: string | null
          id?: string
          page_slug: string
          section_key: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          edited_by?: string | null
          id?: string
          page_slug?: string
          section_key?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "page_revisions_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          content_html: string
          content_json: Json
          hero_image_url: string | null
          id: string
          is_published: boolean
          page_kind: string
          seo_description: string | null
          seo_title: string | null
          slug: string
          title: string
          updated_at: string | null
        }
        Insert: {
          content_html: string
          content_json: Json
          hero_image_url?: string | null
          id?: string
          is_published?: boolean
          page_kind?: string
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          title: string
          updated_at?: string | null
        }
        Update: {
          content_html?: string
          content_json?: Json
          hero_image_url?: string | null
          id?: string
          is_published?: boolean
          page_kind?: string
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          category_id: string
          created_at: string
          is_primary: boolean
          product_id: string
          sort_order: number | null
        }
        Insert: {
          category_id: string
          created_at?: string
          is_primary?: boolean
          product_id: string
          sort_order?: number | null
        }
        Update: {
          category_id?: string
          created_at?: string
          is_primary?: boolean
          product_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          height: number | null
          id: string
          is_primary: boolean | null
          original_height: number | null
          original_url: string | null
          original_width: number | null
          print_master_path: string | null
          product_id: string | null
          sort_order: number | null
          url: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          height?: number | null
          id?: string
          is_primary?: boolean | null
          original_height?: number | null
          original_url?: string | null
          original_width?: number | null
          print_master_path?: string | null
          product_id?: string | null
          sort_order?: number | null
          url: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          height?: number | null
          id?: string
          is_primary?: boolean | null
          original_height?: number | null
          original_url?: string | null
          original_width?: number | null
          print_master_path?: string | null
          product_id?: string | null
          sort_order?: number | null
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          aspect_ratio: number | null
          external_variant_id: string | null
          fulfillment_metadata: Json | null
          height_in: number | null
          id: string
          inventory_count: number | null
          is_active: boolean
          is_custom_size: boolean
          is_lumaprints_available: boolean
          last_priced_at: string | null
          lumaprints_cost_cents: number | null
          lumaprints_sku: string | null
          manual_price_override_cents: number | null
          margin_override_pct: number | null
          medium: string | null
          name: string
          price: number
          product_id: string | null
          shipping_cost_cents: number | null
          shipping_quoted_at: string | null
          size_label: string | null
          size_tier: string | null
          sku: string | null
          sort_order: number | null
          updated_at: string | null
          variant_type: string | null
          wholesale_cost: number | null
          width_in: number | null
          worst_case_shipping: number | null
        }
        Insert: {
          aspect_ratio?: number | null
          external_variant_id?: string | null
          fulfillment_metadata?: Json | null
          height_in?: number | null
          id?: string
          inventory_count?: number | null
          is_active?: boolean
          is_custom_size?: boolean
          is_lumaprints_available?: boolean
          last_priced_at?: string | null
          lumaprints_cost_cents?: number | null
          lumaprints_sku?: string | null
          manual_price_override_cents?: number | null
          margin_override_pct?: number | null
          medium?: string | null
          name: string
          price: number
          product_id?: string | null
          shipping_cost_cents?: number | null
          shipping_quoted_at?: string | null
          size_label?: string | null
          size_tier?: string | null
          sku?: string | null
          sort_order?: number | null
          updated_at?: string | null
          variant_type?: string | null
          wholesale_cost?: number | null
          width_in?: number | null
          worst_case_shipping?: number | null
        }
        Update: {
          aspect_ratio?: number | null
          external_variant_id?: string | null
          fulfillment_metadata?: Json | null
          height_in?: number | null
          id?: string
          inventory_count?: number | null
          is_active?: boolean
          is_custom_size?: boolean
          is_lumaprints_available?: boolean
          last_priced_at?: string | null
          lumaprints_cost_cents?: number | null
          lumaprints_sku?: string | null
          manual_price_override_cents?: number | null
          margin_override_pct?: number | null
          medium?: string | null
          name?: string
          price?: number
          product_id?: string | null
          shipping_cost_cents?: number | null
          shipping_quoted_at?: string | null
          size_label?: string | null
          size_tier?: string | null
          sku?: string | null
          sort_order?: number | null
          updated_at?: string | null
          variant_type?: string | null
          wholesale_cost?: number | null
          width_in?: number | null
          worst_case_shipping?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_price: number
          category_id: string | null
          compare_at_price: number | null
          created_at: string | null
          default_margin_pct: number | null
          description_html: string | null
          description_json: Json | null
          dimensions: string | null
          fulfillment_type: string
          funnel_eligible: boolean
          id: string
          is_featured: boolean | null
          is_original: boolean | null
          lumaprints_product_config: Json | null
          margin_pct: number | null
          master_artwork_id: string | null
          medium: string | null
          printful_sync_product_id: string | null
          prints_enabled: boolean
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: string | null
          story_html: string | null
          story_json: Json | null
          tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          base_price: number
          category_id?: string | null
          compare_at_price?: number | null
          created_at?: string | null
          default_margin_pct?: number | null
          description_html?: string | null
          description_json?: Json | null
          dimensions?: string | null
          fulfillment_type: string
          funnel_eligible?: boolean
          id?: string
          is_featured?: boolean | null
          is_original?: boolean | null
          lumaprints_product_config?: Json | null
          margin_pct?: number | null
          master_artwork_id?: string | null
          medium?: string | null
          printful_sync_product_id?: string | null
          prints_enabled?: boolean
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: string | null
          story_html?: string | null
          story_json?: Json | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          base_price?: number
          category_id?: string | null
          compare_at_price?: number | null
          created_at?: string | null
          default_margin_pct?: number | null
          description_html?: string | null
          description_json?: Json | null
          dimensions?: string | null
          fulfillment_type?: string
          funnel_eligible?: boolean
          id?: string
          is_featured?: boolean | null
          is_original?: boolean | null
          lumaprints_product_config?: Json | null
          margin_pct?: number | null
          master_artwork_id?: string | null
          medium?: string | null
          printful_sync_product_id?: string | null
          prints_enabled?: boolean
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: string | null
          story_html?: string | null
          story_json?: Json | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_master_artwork_id_fkey"
            columns: ["master_artwork_id"]
            isOneToOne: false
            referencedRelation: "master_artworks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          phone: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      project_note_comments: {
        Row: {
          created_at: string | null
          id: string
          message: string
          note_id: string | null
          profile_id: string | null
          sender_role: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          note_id?: string | null
          profile_id?: string | null
          sender_role: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          note_id?: string | null
          profile_id?: string | null
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_note_comments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "project_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_note_comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_notes: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_pinned: boolean | null
          profile_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_pinned?: boolean | null
          profile_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_pinned?: boolean | null
          profile_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_notes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_code_redemptions: {
        Row: {
          amount_off_cents: number
          contact_id: string | null
          id: string
          order_id: string | null
          promo_code_id: string
          redeemed_at: string
        }
        Insert: {
          amount_off_cents?: number
          contact_id?: string | null
          id?: string
          order_id?: string | null
          promo_code_id: string
          redeemed_at?: string
        }
        Update: {
          amount_off_cents?: number
          contact_id?: string | null
          id?: string
          order_id?: string | null
          promo_code_id?: string
          redeemed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_redemptions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          audience_list_id: string | null
          cart_id: string | null
          code: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          discount_type: string | null
          discount_value: number
          id: string
          is_active: boolean | null
          kind: string
          min_order_amount: number | null
          single_use_per_contact: boolean
          stripe_coupon_id: string | null
          updated_at: string
          usage_count: number | null
          usage_limit: number | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          audience_list_id?: string | null
          cart_id?: string | null
          code: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type?: string | null
          discount_value: number
          id?: string
          is_active?: boolean | null
          kind?: string
          min_order_amount?: number | null
          single_use_per_contact?: boolean
          stripe_coupon_id?: string | null
          updated_at?: string
          usage_count?: number | null
          usage_limit?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          audience_list_id?: string | null
          cart_id?: string | null
          code?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type?: string | null
          discount_value?: number
          id?: string
          is_active?: boolean | null
          kind?: string
          min_order_amount?: number | null
          single_use_per_contact?: boolean
          stripe_coupon_id?: string | null
          updated_at?: string
          usage_count?: number | null
          usage_limit?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_audience_list_id_fkey"
            columns: ["audience_list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_buckets: {
        Row: {
          count: number
          expires_at: string
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          expires_at: string
          key: string
          window_start?: string
        }
        Update: {
          count?: number
          expires_at?: string
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      shared_file_tags: {
        Row: {
          created_at: string
          is_default: boolean
          label: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          is_default?: boolean
          label: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          is_default?: boolean
          label?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      shared_files: {
        Row: {
          ai_processed: boolean
          ai_result: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          notes: string | null
          size_bytes: number | null
          tag: string
          uploaded_by: string
        }
        Insert: {
          ai_processed?: boolean
          ai_result?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          size_bytes?: number | null
          tag?: string
          uploaded_by: string
        }
        Update: {
          ai_processed?: boolean
          ai_result?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          size_bytes?: number | null
          tag?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      site_content: {
        Row: {
          content_key: string
          content_type: string | null
          content_value: string
          id: string
          is_active: boolean | null
          page: string
          section: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          content_key: string
          content_type?: string | null
          content_value: string
          id?: string
          is_active?: boolean | null
          page: string
          section: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          content_key?: string
          content_type?: string | null
          content_value?: string
          id?: string
          is_active?: boolean | null
          page?: string
          section?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_content_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          announcement_bar_enabled: boolean | null
          announcement_bar_text: string | null
          business_address: Json | null
          business_email: string | null
          business_name: string | null
          business_phone: string | null
          currency_code: string | null
          default_margin_pct: number
          email_from_address: string | null
          email_from_name: string | null
          facebook_url: string | null
          free_shipping_threshold_cents: number | null
          id: boolean
          instagram_url: string | null
          lumaprints_enabled: boolean | null
          maintenance_mode: boolean | null
          meta_pixel_enabled: boolean | null
          og_image_url: string | null
          order_notification_email: string | null
          pinterest_url: string | null
          printful_enabled: boolean | null
          seo_description: string | null
          seo_title: string | null
          shipping_origin_state: string | null
          shipping_origin_zip: string | null
          shipping_quote_zips: string[]
          shipstation_enabled: boolean | null
          show_privacy: boolean | null
          show_shipping_policy: boolean | null
          show_tos: boolean | null
          stripe_test_mode: boolean
          tax_enabled: boolean | null
          tax_nexus_states: string[] | null
          tax_rate_pct: number | null
          updated_at: string
        }
        Insert: {
          announcement_bar_enabled?: boolean | null
          announcement_bar_text?: string | null
          business_address?: Json | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          currency_code?: string | null
          default_margin_pct?: number
          email_from_address?: string | null
          email_from_name?: string | null
          facebook_url?: string | null
          free_shipping_threshold_cents?: number | null
          id?: boolean
          instagram_url?: string | null
          lumaprints_enabled?: boolean | null
          maintenance_mode?: boolean | null
          meta_pixel_enabled?: boolean | null
          og_image_url?: string | null
          order_notification_email?: string | null
          pinterest_url?: string | null
          printful_enabled?: boolean | null
          seo_description?: string | null
          seo_title?: string | null
          shipping_origin_state?: string | null
          shipping_origin_zip?: string | null
          shipping_quote_zips?: string[]
          shipstation_enabled?: boolean | null
          show_privacy?: boolean | null
          show_shipping_policy?: boolean | null
          show_tos?: boolean | null
          stripe_test_mode?: boolean
          tax_enabled?: boolean | null
          tax_nexus_states?: string[] | null
          tax_rate_pct?: number | null
          updated_at?: string
        }
        Update: {
          announcement_bar_enabled?: boolean | null
          announcement_bar_text?: string | null
          business_address?: Json | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          currency_code?: string | null
          default_margin_pct?: number
          email_from_address?: string | null
          email_from_name?: string | null
          facebook_url?: string | null
          free_shipping_threshold_cents?: number | null
          id?: boolean
          instagram_url?: string | null
          lumaprints_enabled?: boolean | null
          maintenance_mode?: boolean | null
          meta_pixel_enabled?: boolean | null
          og_image_url?: string | null
          order_notification_email?: string | null
          pinterest_url?: string | null
          printful_enabled?: boolean | null
          seo_description?: string | null
          seo_title?: string | null
          shipping_origin_state?: string | null
          shipping_origin_zip?: string | null
          shipping_quote_zips?: string[]
          shipstation_enabled?: boolean | null
          show_privacy?: boolean | null
          show_shipping_policy?: boolean | null
          show_tos?: boolean | null
          stripe_test_mode?: boolean
          tax_enabled?: boolean | null
          tax_nexus_states?: string[] | null
          tax_rate_pct?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      social_accounts: {
        Row: {
          access_token: string | null
          avatar_url: string | null
          connected: boolean
          created_at: string
          display_name: string | null
          extra: Json | null
          handle: string
          id: string
          page_id: string | null
          provider: string
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          avatar_url?: string | null
          connected?: boolean
          created_at?: string
          display_name?: string | null
          extra?: Json | null
          handle: string
          id?: string
          page_id?: string | null
          provider: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          avatar_url?: string | null
          connected?: boolean
          created_at?: string
          display_name?: string | null
          extra?: Json | null
          handle?: string
          id?: string
          page_id?: string | null
          provider?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      social_post_media: {
        Row: {
          id: string
          media_id: string | null
          post_id: string
          sort_order: number
          url: string
        }
        Insert: {
          id?: string
          media_id?: string | null
          post_id: string
          sort_order?: number
          url: string
        }
        Update: {
          id?: string
          media_id?: string | null
          post_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_media_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          account_id: string | null
          blog_post_id: string | null
          body: string | null
          channel: string
          created_at: string
          error_message: string | null
          hashtags: string[] | null
          id: string
          link_url: string | null
          media_urls: string[]
          product_id: string | null
          progress_pct: number | null
          provider_post_id: string | null
          published_at: string | null
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          blog_post_id?: string | null
          body?: string | null
          channel: string
          created_at?: string
          error_message?: string | null
          hashtags?: string[] | null
          id?: string
          link_url?: string | null
          media_urls?: string[]
          product_id?: string | null
          progress_pct?: number | null
          provider_post_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          blog_post_id?: string | null
          body?: string | null
          channel?: string
          created_at?: string
          error_message?: string | null
          hashtags?: string[] | null
          id?: string
          link_url?: string | null
          media_urls?: string[]
          product_id?: string | null
          progress_pct?: number | null
          provider_post_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_blog_post_id_fkey"
            columns: ["blog_post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonial_media: {
        Row: {
          caption: string | null
          created_at: string
          file_name: string | null
          id: string
          media_type: string
          mime_type: string | null
          size_bytes: number | null
          sort_order: number
          storage_path: string
          testimonial_id: string
          url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          media_type: string
          mime_type?: string | null
          size_bytes?: number | null
          sort_order?: number
          storage_path: string
          testimonial_id: string
          url: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          media_type?: string
          mime_type?: string | null
          size_bytes?: number | null
          sort_order?: number
          storage_path?: string
          testimonial_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "testimonial_media_testimonial_id_fkey"
            columns: ["testimonial_id"]
            isOneToOne: false
            referencedRelation: "testimonials"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          avatar_url: string | null
          content: string | null
          created_at: string | null
          date_received: string | null
          event_context: string | null
          id: string
          image_url: string | null
          is_featured: boolean | null
          name: string
          quote: string | null
          role: string | null
          sort_order: number | null
          source: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          content?: string | null
          created_at?: string | null
          date_received?: string | null
          event_context?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          name: string
          quote?: string | null
          role?: string | null
          sort_order?: number | null
          source?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          content?: string | null
          created_at?: string | null
          date_received?: string | null
          event_context?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          name?: string
          quote?: string | null
          role?: string | null
          sort_order?: number | null
          source?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      unsubscribe_events: {
        Row: {
          contact_id: string | null
          created_at: string
          email: string
          id: string
          ip: string | null
          list_id: string | null
          reason: string | null
          source: string | null
          user_agent: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          email: string
          id?: string
          ip?: string | null
          list_id?: string | null
          reason?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          email?: string
          id?: string
          ip?: string | null
          list_id?: string | null
          reason?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unsubscribe_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unsubscribe_events_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          created_at: string | null
          error: string | null
          event_type: string | null
          id: string
          payload: Json
          processed: boolean | null
          source: string
          stripe_event_id: string | null
        }
        Insert: {
          created_at?: string | null
          error?: string | null
          event_type?: string | null
          id?: string
          payload: Json
          processed?: boolean | null
          source: string
          stripe_event_id?: string | null
        }
        Update: {
          created_at?: string | null
          error?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          processed?: boolean | null
          source?: string
          stripe_event_id?: string | null
        }
        Relationships: []
      }
      wishlist_items: {
        Row: {
          created_at: string | null
          id: string
          product_id: string | null
          profile_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          profile_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_items_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_request_audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          new_value: string | null
          old_value: string | null
          profile_id: string | null
          work_request_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          profile_id?: string | null
          work_request_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          profile_id?: string | null
          work_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_request_audit_log_work_request_id_fkey"
            columns: ["work_request_id"]
            isOneToOne: false
            referencedRelation: "work_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      work_request_comments: {
        Row: {
          created_at: string | null
          id: string
          message: string
          profile_id: string | null
          sender_role: string
          work_request_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          profile_id?: string | null
          sender_role: string
          work_request_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          profile_id?: string | null
          sender_role?: string
          work_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_request_comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_request_comments_work_request_id_fkey"
            columns: ["work_request_id"]
            isOneToOne: false
            referencedRelation: "work_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      work_requests: {
        Row: {
          attachments: string[] | null
          category: string | null
          created_at: string | null
          description: string
          due_date: string | null
          estimated_hours: number | null
          id: string
          priority: string | null
          profile_id: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          attachments?: string[] | null
          category?: string | null
          created_at?: string | null
          description: string
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          priority?: string | null
          profile_id?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          attachments?: string[] | null
          category?: string | null
          created_at?: string | null
          description?: string
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          priority?: string | null
          profile_id?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      book_class_session: {
        Args: {
          p_booking_id: string
          p_email: string
          p_name: string
          p_notes: string
          p_phone: string
          p_photos: string[]
          p_session_id: string
        }
        Returns: string
      }
      get_public_print_readiness: {
        Args: { p_product_ids: string[] }
        Returns: {
          print_height_px: number | null
          print_ready: boolean
          print_width_px: number | null
          product_id: string
        }[]
      }
      increment_funnel_metric: {
        Args: { p_funnel_id: string; p_metric: string }
        Returns: undefined
      }
      is_admin_or_artist: { Args: never; Returns: boolean }
      mark_contact_unsubscribed: {
        Args: {
          p_contact_id: string
          p_ip?: string
          p_list_id?: string
          p_reason?: string
          p_source?: string
          p_user_agent?: string
        }
        Returns: boolean
      }
      rate_limit_hit: {
        Args: { p_key: string; p_limit: number; p_window_ms: number }
        Returns: {
          allowed: boolean
          remaining: number
          retry_after_ms: number
        }[]
      }
      record_order_for_contact: {
        Args: {
          p_amount_off_cents?: number
          p_email: string
          p_order_id?: string
          p_order_total: number
          p_promo_code_id?: string
        }
        Returns: string
      }
      reprice_variants: {
        Args: { p_category?: string; p_product?: string }
        Returns: number
      }
      reserve_original: { Args: { p_variant_id: string }; Returns: boolean }
      subscribe_to_newsletter: {
        Args: { p_email: string; p_first_name?: string; p_source?: string }
        Returns: {
          code: string
          contact_id: string
          percent_off: number
          status: string
        }[]
      }
      track_cart: {
        Args: {
          p_cart_id?: string
          p_contact_id?: string
          p_email?: string
          p_items?: Json
          p_subtotal?: number
        }
        Returns: string
      }
      upsert_contact_to_list: {
        Args: {
          p_email: string
          p_first_name?: string
          p_last_name?: string
          p_list_slug?: string
          p_phone?: string
          p_source?: string
          p_tags?: string[]
        }
        Returns: string
      }
      validate_promo_code_public: {
        Args: {
          p_cart_id?: string
          p_cart_subtotal?: number
          p_code: string
          p_email?: string
        }
        Returns: {
          amount_off_cents: number
          code: string
          discount_type: string
          discount_value: number
          ok: boolean
          reason: string
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
