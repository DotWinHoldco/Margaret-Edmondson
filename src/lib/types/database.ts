export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          email: string
          phone: string | null
          avatar_url: string | null
          role: 'customer' | 'admin' | 'artist'
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'> & {
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      addresses: {
        Row: {
          id: string
          profile_id: string | null
          label: string
          line1: string
          line2: string | null
          city: string
          state: string
          postal_code: string
          country: string
          is_default: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['addresses']['Row'], 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['addresses']['Insert']>
      }
      categories: {
        Row: {
          id: string
          name: string
          slug: string
          description: string | null
          image_url: string | null
          sort_order: number
        }
        Insert: Omit<Database['public']['Tables']['categories']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['categories']['Insert']>
      }
      products: {
        Row: {
          id: string
          category_id: string | null
          title: string
          slug: string
          description_json: Json | null
          description_html: string | null
          story_json: Json | null
          story_html: string | null
          medium: string | null
          dimensions: string | null
          base_price: number
          compare_at_price: number | null
          fulfillment_type: 'lumaprints' | 'printful' | 'self_ship'
          lumaprints_product_config: Json | null
          printful_sync_product_id: string | null
          status: 'active' | 'draft' | 'archived' | 'sold'
          is_original: boolean
          is_featured: boolean
          prints_enabled: boolean
          tags: string[] | null
          seo_title: string | null
          seo_description: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['products']['Insert']>
      }
      product_images: {
        Row: {
          id: string
          product_id: string | null
          url: string
          alt_text: string | null
          sort_order: number
          is_primary: boolean
        }
        Insert: Omit<Database['public']['Tables']['product_images']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['product_images']['Insert']>
      }
      product_variants: {
        Row: {
          id: string
          product_id: string | null
          name: string
          sku: string | null
          price: number
          external_variant_id: string | null
          fulfillment_metadata: Json | null
          inventory_count: number | null
          variant_type: 'original' | 'canvas_print' | 'framed_canvas_print' | null
          sort_order: number
        }
        Insert: Omit<Database['public']['Tables']['product_variants']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['product_variants']['Insert']>
      }
      orders: {
        Row: {
          id: string
          order_number: number
          profile_id: string | null
          email: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          status: 'pending' | 'processing' | 'partially_fulfilled' | 'fulfilled' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
          subtotal: number
          shipping_cost: number
          tax: number
          discount: number
          total: number
          promo_code: string | null
          shipping_address: Json
          billing_address: Json | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['orders']['Row'], 'id' | 'order_number' | 'created_at' | 'updated_at'> & {
          id?: string
          order_number?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['orders']['Insert']>
      }
      order_items: {
        Row: {
          id: string
          order_id: string | null
          product_id: string | null
          variant_id: string | null
          quantity: number
          unit_price: number
          fulfillment_type: string
          fulfillment_status: 'pending' | 'submitted' | 'in_production' | 'shipped' | 'delivered' | 'cancelled'
          external_order_id: string | null
          tracking_number: string | null
          tracking_url: string | null
          carrier: string | null
          shipped_at: string | null
          delivered_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['order_items']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>
      }
      commissions: {
        Row: {
          id: string
          commission_number: number
          profile_id: string | null
          client_name: string
          client_email: string
          client_phone: string | null
          description: string
          preferred_medium: string | null
          preferred_size: string | null
          budget_range: string | null
          timeline: string | null
          reference_images: string[] | null
          status: 'inquiry' | 'quoted' | 'deposit_paid' | 'sketch_phase' | 'sketch_approved' | 'in_progress' | 'review' | 'completed' | 'shipped' | 'delivered' | 'cancelled'
          quoted_price: number | null
          deposit_amount: number | null
          deposit_stripe_invoice_id: string | null
          final_stripe_invoice_id: string | null
          shipping_address: Json | null
          estimated_completion: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['commissions']['Row'], 'id' | 'commission_number' | 'created_at' | 'updated_at'> & {
          id?: string
          commission_number?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['commissions']['Insert']>
      }
      site_content: {
        Row: {
          id: string
          page: string
          section: string
          content_key: string
          content_value: string
          content_type: 'text' | 'image' | 'link' | 'boolean' | 'number' | 'color'
          is_active: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['site_content']['Row'], 'id' | 'updated_at'> & {
          id?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['site_content']['Insert']>
      }
      page_blocks: {
        Row: {
          id: string
          page: string
          block_type: string
          sort_order: number
          is_visible: boolean
          config: Json
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['page_blocks']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['page_blocks']['Insert']>
      }
      testimonials: {
        Row: {
          id: string
          name: string
          role: string | null
          quote: string
          avatar_url: string | null
          is_featured: boolean
          sort_order: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['testimonials']['Row'], 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['testimonials']['Insert']>
      }
      blog_posts: {
        Row: {
          id: string
          title: string
          slug: string
          excerpt: string | null
          content_json: Json
          content_html: string
          cover_image_url: string | null
          author_id: string | null
          status: 'draft' | 'published' | 'archived'
          tags: string[] | null
          seo_title: string | null
          seo_description: string | null
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['blog_posts']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['blog_posts']['Insert']>
      }
      courses: {
        Row: {
          id: string
          title: string
          slug: string
          description: string | null
          long_description: string | null
          instructor_name: string
          thumbnail_url: string | null
          preview_video_url: string | null
          price: number | null
          stripe_price_id: string | null
          course_type: 'on_demand' | 'live' | 'hybrid'
          difficulty_level: 'beginner' | 'intermediate' | 'advanced' | 'all_levels' | null
          materials_needed: string | null
          status: 'draft' | 'published' | 'archived'
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['courses']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['courses']['Insert']>
      }
      newsletter_subscribers: {
        Row: {
          id: string
          email: string
          first_name: string | null
          source: string | null
          subscribed_at: string
          unsubscribed_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['newsletter_subscribers']['Row'], 'id' | 'subscribed_at'> & {
          id?: string
          subscribed_at?: string
        }
        Update: Partial<Database['public']['Tables']['newsletter_subscribers']['Insert']>
      }
      carts: {
        Row: {
          id: string
          profile_id: string | null
          email: string | null
          items: Json
          subtotal: number
          last_activity_at: string
          converted_order_id: string | null
          abandoned_email_1_sent_at: string | null
          abandoned_email_2_sent_at: string | null
          abandoned_email_3_sent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['carts']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['carts']['Insert']>
      }
      faqs: {
        Row: {
          id: string
          question: string
          answer_json: Json
          answer_html: string
          category: string | null
          sort_order: number
          is_published: boolean
        }
        Insert: Omit<Database['public']['Tables']['faqs']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['faqs']['Insert']>
      }
      meta_events: {
        Row: {
          id: string
          event_name: string
          event_id: string
          user_data: Json | null
          custom_data: Json | null
          source_url: string | null
          sent_to_meta: boolean
          meta_response: Json | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['meta_events']['Row'], 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['meta_events']['Insert']>
      }
      email_templates: {
        Row: {
          id: string
          name: string
          subject: string
          content_json: Json
          content_html: string
          template_type: 'transactional' | 'marketing' | 'automation'
          category: string | null
          variables: string[] | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['email_templates']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['email_templates']['Insert']>
      }
      wishlist_items: {
        Row: {
          id: string
          profile_id: string | null
          product_id: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['wishlist_items']['Row'], 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['wishlist_items']['Insert']>
      }
      promo_codes: {
        Row: {
          id: string
          code: string
          discount_type: 'percentage' | 'fixed' | null
          discount_value: number
          min_order_amount: number | null
          usage_limit: number | null
          usage_count: number
          valid_from: string | null
          valid_until: string | null
          is_active: boolean
        }
        Insert: Omit<Database['public']['Tables']['promo_codes']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['promo_codes']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
