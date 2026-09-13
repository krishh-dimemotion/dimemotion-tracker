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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      channels: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["channel_kind"]
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["channel_kind"]
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["channel_kind"]
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      countries: {
        Row: {
          code: string | null
          created_at: string
          flag_emoji: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          flag_emoji?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          flag_emoji?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_contact_log: {
        Row: {
          channel_id: string | null
          contacted_at: string
          created_at: string
          created_by: string | null
          crm_record_id: string
          direction: string
          id: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          contacted_at?: string
          created_at?: string
          created_by?: string | null
          crm_record_id: string
          direction?: string
          id?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          contacted_at?: string
          created_at?: string
          created_by?: string | null
          crm_record_id?: string
          direction?: string
          id?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contact_log_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contact_log_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "outreach_auto"
            referencedColumns: ["channel_id"]
          },
          {
            foreignKeyName: "crm_contact_log_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contact_log_crm_record_id_fkey"
            columns: ["crm_record_id"]
            isOneToOne: false
            referencedRelation: "crm_records"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_records: {
        Row: {
          closed_at: string | null
          contract_months: number | null
          created_at: string
          currency: string
          deal_type: string
          estimated_value: number | null
          expected_close_date: string | null
          id: string
          last_contacted_at: string | null
          lead_id: string
          mrr_amount: number | null
          next_followup_date: string | null
          notes: string | null
          owner_id: string | null
          priority: string
          probability: number | null
          stage_id: string | null
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          contract_months?: number | null
          created_at?: string
          currency?: string
          deal_type?: string
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          last_contacted_at?: string | null
          lead_id: string
          mrr_amount?: number | null
          next_followup_date?: string | null
          notes?: string | null
          owner_id?: string | null
          priority?: string
          probability?: number | null
          stage_id?: string | null
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          contract_months?: number | null
          created_at?: string
          currency?: string
          deal_type?: string
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          last_contacted_at?: string | null
          lead_id?: string
          mrr_amount?: number | null
          next_followup_date?: string | null
          notes?: string | null
          owner_id?: string | null
          priority?: string
          probability?: number | null
          stage_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_records_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_records_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_records_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          name: string
          steps: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name?: string
          steps?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_contacts: {
        Row: {
          created_at: string
          email: string | null
          emails: Json
          id: string
          instagram_url: string | null
          is_primary: boolean
          job_title: string | null
          lead_id: string
          linkedin_url: string | null
          order_index: number
          person_name: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          emails?: Json
          id?: string
          instagram_url?: string | null
          is_primary?: boolean
          job_title?: string | null
          lead_id: string
          linkedin_url?: string | null
          order_index?: number
          person_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          emails?: Json
          id?: string
          instagram_url?: string | null
          is_primary?: boolean
          job_title?: string | null
          lead_id?: string
          linkedin_url?: string | null
          order_index?: number
          person_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          lead_id: string | null
          meta: Json
          occurred_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          lead_id?: string | null
          meta?: Json
          occurred_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          lead_id?: string | null
          meta?: Json
          occurred_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_followups: {
        Row: {
          channel_id: string | null
          created_at: string
          id: string
          lead_id: string
          notes: string | null
          scheduled_date: string | null
          sent_at: string | null
          sequence_number: number
          status: string
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          id?: string
          lead_id: string
          notes?: string | null
          scheduled_date?: string | null
          sent_at?: string | null
          sequence_number?: number
          status?: string
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          notes?: string | null
          scheduled_date?: string | null
          sent_at?: string | null
          sequence_number?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_followups_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_followups_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "outreach_auto"
            referencedColumns: ["channel_id"]
          },
          {
            foreignKeyName: "lead_followups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_links: {
        Row: {
          created_at: string
          id: string
          label: string | null
          lead_id: string
          order_index: number
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          lead_id: string
          order_index?: number
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          lead_id?: string
          order_index?: number
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tags: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          tag_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          tag_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          tag_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tags_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          additional_notes: string | null
          archived: boolean
          archived_at: string | null
          channel_id: string | null
          client_closed: boolean
          client_closed_at: string | null
          company_linkedin_url: string | null
          company_name: string
          contacted_channel_id: string | null
          country_id: string | null
          created_at: string
          created_by: string | null
          date_added: string
          email_replied: boolean
          email_replied_at: string | null
          email_sent: boolean
          email_sent_at: string | null
          email_viewed: boolean
          email_viewed_at: string | null
          id: string
          instagram_replied: boolean
          instagram_replied_at: string | null
          instagram_sent: boolean
          instagram_sent_at: string | null
          instagram_url: string | null
          last_contacted_at: string | null
          lead_code: string
          linkedin_connection_sent: boolean
          linkedin_connection_sent_at: string | null
          linkedin_replied: boolean
          linkedin_replied_at: string | null
          linkedin_sent: boolean
          linkedin_sent_at: string | null
          loom_sent: boolean
          loom_sent_at: string | null
          loom_url: string | null
          loom_watch_percent: number | null
          loom_watched: boolean
          loom_watched_at: string | null
          meeting_booked: boolean
          meeting_booked_at: string | null
          next_followup_date: string | null
          primary_contact: string | null
          priority: string | null
          pushed_to_crm: boolean
          pushed_to_crm_at: string | null
          reply_channel_id: string | null
          reply_sentiment: string | null
          research_notes: string | null
          sender_account_id: string | null
          stage_id: string | null
          status: string
          updated_at: string
          website_url: string | null
          youtube_url: string | null
        }
        Insert: {
          additional_notes?: string | null
          archived?: boolean
          archived_at?: string | null
          channel_id?: string | null
          client_closed?: boolean
          client_closed_at?: string | null
          company_linkedin_url?: string | null
          company_name: string
          contacted_channel_id?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          date_added?: string
          email_replied?: boolean
          email_replied_at?: string | null
          email_sent?: boolean
          email_sent_at?: string | null
          email_viewed?: boolean
          email_viewed_at?: string | null
          id?: string
          instagram_replied?: boolean
          instagram_replied_at?: string | null
          instagram_sent?: boolean
          instagram_sent_at?: string | null
          instagram_url?: string | null
          last_contacted_at?: string | null
          lead_code?: string
          linkedin_connection_sent?: boolean
          linkedin_connection_sent_at?: string | null
          linkedin_replied?: boolean
          linkedin_replied_at?: string | null
          linkedin_sent?: boolean
          linkedin_sent_at?: string | null
          loom_sent?: boolean
          loom_sent_at?: string | null
          loom_url?: string | null
          loom_watch_percent?: number | null
          loom_watched?: boolean
          loom_watched_at?: string | null
          meeting_booked?: boolean
          meeting_booked_at?: string | null
          next_followup_date?: string | null
          primary_contact?: string | null
          priority?: string | null
          pushed_to_crm?: boolean
          pushed_to_crm_at?: string | null
          reply_channel_id?: string | null
          reply_sentiment?: string | null
          research_notes?: string | null
          sender_account_id?: string | null
          stage_id?: string | null
          status?: string
          updated_at?: string
          website_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          additional_notes?: string | null
          archived?: boolean
          archived_at?: string | null
          channel_id?: string | null
          client_closed?: boolean
          client_closed_at?: string | null
          company_linkedin_url?: string | null
          company_name?: string
          contacted_channel_id?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          date_added?: string
          email_replied?: boolean
          email_replied_at?: string | null
          email_sent?: boolean
          email_sent_at?: string | null
          email_viewed?: boolean
          email_viewed_at?: string | null
          id?: string
          instagram_replied?: boolean
          instagram_replied_at?: string | null
          instagram_sent?: boolean
          instagram_sent_at?: string | null
          instagram_url?: string | null
          last_contacted_at?: string | null
          lead_code?: string
          linkedin_connection_sent?: boolean
          linkedin_connection_sent_at?: string | null
          linkedin_replied?: boolean
          linkedin_replied_at?: string | null
          linkedin_sent?: boolean
          linkedin_sent_at?: string | null
          loom_sent?: boolean
          loom_sent_at?: string | null
          loom_url?: string | null
          loom_watch_percent?: number | null
          loom_watched?: boolean
          loom_watched_at?: string | null
          meeting_booked?: boolean
          meeting_booked_at?: string | null
          next_followup_date?: string | null
          primary_contact?: string | null
          priority?: string | null
          pushed_to_crm?: boolean
          pushed_to_crm_at?: string | null
          reply_channel_id?: string | null
          reply_sentiment?: string | null
          research_notes?: string | null
          sender_account_id?: string | null
          stage_id?: string | null
          status?: string
          updated_at?: string
          website_url?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "outreach_auto"
            referencedColumns: ["channel_id"]
          },
          {
            foreignKeyName: "leads_contacted_channel_id_fkey"
            columns: ["contacted_channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_contacted_channel_id_fkey"
            columns: ["contacted_channel_id"]
            isOneToOne: false
            referencedRelation: "outreach_auto"
            referencedColumns: ["channel_id"]
          },
          {
            foreignKeyName: "leads_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_reply_channel_id_fkey"
            columns: ["reply_channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_reply_channel_id_fkey"
            columns: ["reply_channel_id"]
            isOneToOne: false
            referencedRelation: "outreach_auto"
            referencedColumns: ["channel_id"]
          },
          {
            foreignKeyName: "leads_sender_account_id_fkey"
            columns: ["sender_account_id"]
            isOneToOne: false
            referencedRelation: "sender_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_daily: {
        Row: {
          channel_id: string
          created_at: string
          day: string
          id: string
          manual_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          day?: string
          id?: string
          manual_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          day?: string
          id?: string
          manual_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_daily_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_daily_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "outreach_auto"
            referencedColumns: ["channel_id"]
          },
          {
            foreignKeyName: "outreach_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_targets: {
        Row: {
          channel_id: string
          created_at: string
          daily_target: number
          id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string
          daily_target?: number
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string
          daily_target?: number
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_targets_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_targets_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "outreach_auto"
            referencedColumns: ["channel_id"]
          },
          {
            foreignKeyName: "outreach_targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_presets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_builtin: boolean
          name: string
          permission_keys: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_builtin?: boolean
          name: string
          permission_keys?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_builtin?: boolean
          name?: string
          permission_keys?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_presets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_lead_view: string | null
          default_module: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          last_seen_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          theme: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_lead_view?: string | null
          default_module?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          last_seen_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          theme?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_lead_view?: string | null
          default_module?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          theme?: string
          updated_at?: string
        }
        Relationships: []
      }
      sender_accounts: {
        Row: {
          channel_id: string | null
          created_at: string
          daily_send_limit: number | null
          id: string
          identifier: string | null
          label: string
          notes: string | null
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
          warmup_ready_date: string | null
          warmup_reminder_date: string | null
          warmup_started_at: string | null
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          daily_send_limit?: number | null
          id?: string
          identifier?: string | null
          label: string
          notes?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
          warmup_ready_date?: string | null
          warmup_reminder_date?: string | null
          warmup_started_at?: string | null
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          daily_send_limit?: number | null
          id?: string
          identifier?: string | null
          label?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
          warmup_ready_date?: string | null
          warmup_reminder_date?: string | null
          warmup_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sender_accounts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sender_accounts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "outreach_auto"
            referencedColumns: ["channel_id"]
          },
        ]
      }
      shortcuts: {
        Row: {
          action_key: string
          binding: string
          created_at: string
          id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          action_key: string
          binding: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          action_key?: string
          binding?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shortcuts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          board: Database["public"]["Enums"]["stage_board"]
          color: string
          created_at: string
          default_probability: number
          id: string
          is_archived: boolean
          is_lost: boolean
          is_reply_stage: boolean
          is_won: boolean
          name: string
          order_index: number
          updated_at: string
        }
        Insert: {
          board: Database["public"]["Enums"]["stage_board"]
          color?: string
          created_at?: string
          default_probability?: number
          id?: string
          is_archived?: boolean
          is_lost?: boolean
          is_reply_stage?: boolean
          is_won?: boolean
          name: string
          order_index?: number
          updated_at?: string
        }
        Update: {
          board?: Database["public"]["Enums"]["stage_board"]
          color?: string
          created_at?: string
          default_probability?: number
          id?: string
          is_archived?: boolean
          is_lost?: boolean
          is_reply_stage?: boolean
          is_won?: boolean
          name?: string
          order_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          permission_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          permission_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          permission_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      outreach_auto: {
        Row: {
          auto_count: number | null
          channel_id: string | null
          day: string | null
          sender_account_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_created_by_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_sender_account_id_fkey"
            columns: ["sender_account_id"]
            isOneToOne: false
            referencedRelation: "sender_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can: { Args: { _key: string }; Returns: boolean }
      ensure_crm_record: { Args: { _lead_id: string }; Returns: string }
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      next_lead_code: { Args: never; Returns: string }
      revenue_summary: {
        Args: never
        Returns: {
          avg_deal_size: number
          current_mrr: number
          lost_count: number
          lost_value: number
          open_retainer_mrr: number
          pipeline_value: number
          weighted_pipeline: number
          won_count: number
          won_this_month: number
        }[]
      }
    }
    Enums: {
      account_status: "active" | "warming" | "paused"
      app_role: "owner" | "admin" | "member"
      channel_kind: "email" | "linkedin" | "instagram" | "other"
      stage_board: "lead" | "crm"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: ["active", "warming", "paused"],
      app_role: ["owner", "admin", "member"],
      channel_kind: ["email", "linkedin", "instagram", "other"],
      stage_board: ["lead", "crm"],
    },
  },
} as const
