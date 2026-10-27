
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_kind": string,"created_at": string,"entity_id": string | null,"entity_type": string,"id": number,"metadata": NonNullable<Json>,"organization_id": string | null,"reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_kind"?: string,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: never,"metadata"?: NonNullable<Json>,"organization_id"?: string | null,"reason"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_kind"?: string,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: never,"metadata"?: NonNullable<Json>,"organization_id"?: string | null,"reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_logs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["organization_id"]
    },{
      foreignKeyName: "audit_logs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "icon": string | null,"id": string,"name": string,"slug": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "icon"?: string | null,"id"?: string,"name": string,"slug": string,"sort_order"?: number
                  }
                  Update: {
                    "icon"?: string | null,"id"?: string,"name"?: string,"slug"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"check_ins": {
                  Row: {
                    "created_at": string,"device_id": string | null,"event_id": string,"id": number,"reason": string | null,"result": string,"staff_user_id": string,"ticket_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"device_id"?: string | null,"event_id": string,"id"?: never,"reason"?: string | null,"result": string,"staff_user_id": string,"ticket_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"device_id"?: string | null,"event_id"?: string,"id"?: never,"reason"?: string | null,"result"?: string,"staff_user_id"?: string,"ticket_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "check_ins_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "check_ins_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "check_ins_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "trending_events"
      referencedColumns: ["event_id"]
    },{
      foreignKeyName: "check_ins_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"cities": {
                  Row: {
                    "id": string,"name": string,"region_id": string,"slug": string,"sort_order": number,"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"name": string,"region_id": string,"slug": string,"sort_order"?: number,"timezone": string
                  }
                  Update: {
                    "id"?: string,"name"?: string,"region_id"?: string,"slug"?: string,"sort_order"?: number,"timezone"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cities_region_id_fkey"
      columns: ["region_id"]
isOneToOne: false
      referencedRelation: "regions"
      referencedColumns: ["id"]
    }
                  ]
                },"countries": {
                  Row: {
                    "checkout_enabled": boolean,"code": string,"default_currency": string,"default_timezone": string,"name": string,"phone_prefix": string
                  }
                  ComputedFields: never
                  Insert: {
                    "checkout_enabled"?: boolean,"code": string,"default_currency": string,"default_timezone": string,"name": string,"phone_prefix": string
                  }
                  Update: {
                    "checkout_enabled"?: boolean,"code"?: string,"default_currency"?: string,"default_timezone"?: string,"name"?: string,"phone_prefix"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "countries_default_currency_fkey"
      columns: ["default_currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    }
                  ]
                },"currencies": {
                  Row: {
                    "checkout_enabled": boolean,"code": string,"minor_unit": number,"name": string,"symbol": string
                  }
                  ComputedFields: never
                  Insert: {
                    "checkout_enabled"?: boolean,"code": string,"minor_unit": number,"name": string,"symbol": string
                  }
                  Update: {
                    "checkout_enabled"?: boolean,"code"?: string,"minor_unit"?: number,"name"?: string,"symbol"?: string
                  }
                  Relationships: [
                    
                  ]
                },"disputes": {
                  Row: {
                    "amount_minor": number,"id": string,"opened_at": string,"order_id": string,"provider": string,"provider_dispute_id": string,"reason": string | null,"resolved_at": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"id"?: string,"opened_at"?: string,"order_id": string,"provider": string,"provider_dispute_id": string,"reason"?: string | null,"resolved_at"?: string | null,"status": string
                  }
                  Update: {
                    "amount_minor"?: number,"id"?: string,"opened_at"?: string,"order_id"?: string,"provider"?: string,"provider_dispute_id"?: string,"reason"?: string | null,"resolved_at"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "disputes_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"earnings_allocations": {
                  Row: {
                    "amount_minor": number,"base_minor": number,"beneficiary_kind": string,"created_at": string,"currency": string,"enrollment_id": string | null,"hold_reason": string | null,"id": string,"matures_at": string,"order_id": string,"order_item_id": string,"organization_id": string,"promoter_user_id": string | null,"rate_bps": number | null,"released_at": string | null,"reversed_minor": number,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"base_minor": number,"beneficiary_kind": string,"created_at"?: string,"currency": string,"enrollment_id"?: string | null,"hold_reason"?: string | null,"id"?: string,"matures_at": string,"order_id": string,"order_item_id": string,"organization_id": string,"promoter_user_id"?: string | null,"rate_bps"?: number | null,"released_at"?: string | null,"reversed_minor"?: number,"status"?: string
                  }
                  Update: {
                    "amount_minor"?: number,"base_minor"?: number,"beneficiary_kind"?: string,"created_at"?: string,"currency"?: string,"enrollment_id"?: string | null,"hold_reason"?: string | null,"id"?: string,"matures_at"?: string,"order_id"?: string,"order_item_id"?: string,"organization_id"?: string,"promoter_user_id"?: string | null,"rate_bps"?: number | null,"released_at"?: string | null,"reversed_minor"?: number,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "earnings_allocations_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: false
      referencedRelation: "promoter_enrollments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earnings_allocations_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earnings_allocations_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earnings_allocations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earnings_allocations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["organization_id"]
    },{
      foreignKeyName: "earnings_allocations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"email_messages": {
                  Row: {
                    "attempts": number,"created_at": string,"dedupe_key": string,"id": string,"last_error": string | null,"order_id": string | null,"provider": string | null,"provider_message_id": string | null,"sent_at": string | null,"status": string,"subject": string,"template": string,"to_email": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"dedupe_key": string,"id"?: string,"last_error"?: string | null,"order_id"?: string | null,"provider"?: string | null,"provider_message_id"?: string | null,"sent_at"?: string | null,"status"?: string,"subject": string,"template": string,"to_email": string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"dedupe_key"?: string,"id"?: string,"last_error"?: string | null,"order_id"?: string | null,"provider"?: string | null,"provider_message_id"?: string | null,"sent_at"?: string | null,"status"?: string,"subject"?: string,"template"?: string,"to_email"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_messages_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"event_media": {
                  Row: {
                    "alt": string | null,"event_id": string,"id": string,"path": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "alt"?: string | null,"event_id": string,"id"?: string,"path": string,"sort_order"?: number
                  }
                  Update: {
                    "alt"?: string | null,"event_id"?: string,"id"?: string,"path"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_media_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_media_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_media_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "trending_events"
      referencedColumns: ["event_id"]
    }
                  ]
                },"event_private": {
                  Row: {
                    "event_id": string,"internal_notes": string | null,"online_access_instructions": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"internal_notes"?: string | null,"online_access_instructions"?: string | null
                  }
                  Update: {
                    "event_id"?: string,"internal_notes"?: string | null,"online_access_instructions"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_private_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_private_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "public_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_private_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "trending_events"
      referencedColumns: ["event_id"]
    }
                  ]
                },"event_staff": {
                  Row: {
                    "assigned_by": string | null,"can_door_sell": boolean,"can_issue_comps": boolean,"can_override_reentry": boolean,"created_at": string,"event_id": string,"organization_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_by"?: string | null,"can_door_sell"?: boolean,"can_issue_comps"?: boolean,"can_override_reentry"?: boolean,"created_at"?: string,"event_id": string,"organization_id": string,"user_id": string
                  }
                  Update: {
                    "assigned_by"?: string | null,"can_door_sell"?: boolean,"can_issue_comps"?: boolean,"can_override_reentry"?: boolean,"created_at"?: string,"event_id"?: string,"organization_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_staff_event_org"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "event_staff_member"
      columns: ["organization_id","user_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["organization_id","user_id"]
    }
                  ]
                },"event_view_counts": {
                  Row: {
                    "day": string,"event_id": string,"views": number
                  }
                  ComputedFields: never
                  Insert: {
                    "day": string,"event_id": string,"views"?: number
                  }
                  Update: {
                    "day"?: string,"event_id"?: string,"views"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_view_counts_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_view_counts_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_view_counts_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "trending_events"
      referencedColumns: ["event_id"]
    }
                  ]
                },"events": {
                  Row: {
                    "accessibility_info": string | null,"address_line": string | null,"admissions_held": number,"admissions_sold": number,"age_restriction": number | null,"attendee_questions": NonNullable<Json>,"cancellation_reason": string | null,"cancelled_at": string | null,"capacity": number,"category_id": string | null,"city_id": string | null,"collect_attendee_names": boolean,"country_code": string,"cover_alt": string | null,"cover_path": string | null,"created_at": string,"created_by": string | null,"currency": string,"description_html": string | null,"ends_at": string,"entry_rules": string | null,"featured_rank": number | null,"format": Database["public"]['Enums']["event_format"],"id": string,"is_featured": boolean,"moderation_notes": string | null,"moderation_status": Database["public"]['Enums']["moderation_status"],"organization_id": string,"published_at": string | null,"refund_policy": string,"refund_policy_text": string | null,"region_id": string | null,"slug": string,"starts_at": string,"status": Database["public"]['Enums']["event_status"],"summary": string | null,"tags": (string)[],"timezone": string,"title": string,"updated_at": string,"venue_id": string | null,"venue_name": string | null,"visibility": Database["public"]['Enums']["event_visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "accessibility_info"?: string | null,"address_line"?: string | null,"admissions_held"?: number,"admissions_sold"?: number,"age_restriction"?: number | null,"attendee_questions"?: NonNullable<Json>,"cancellation_reason"?: string | null,"cancelled_at"?: string | null,"capacity": number,"category_id"?: string | null,"city_id"?: string | null,"collect_attendee_names"?: boolean,"country_code"?: string,"cover_alt"?: string | null,"cover_path"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"description_html"?: string | null,"ends_at": string,"entry_rules"?: string | null,"featured_rank"?: number | null,"format"?: Database["public"]['Enums']["event_format"],"id"?: string,"is_featured"?: boolean,"moderation_notes"?: string | null,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"organization_id": string,"published_at"?: string | null,"refund_policy"?: string,"refund_policy_text"?: string | null,"region_id"?: string | null,"slug": string,"starts_at": string,"status"?: Database["public"]['Enums']["event_status"],"summary"?: string | null,"tags"?: (string)[],"timezone"?: string,"title": string,"updated_at"?: string,"venue_id"?: string | null,"venue_name"?: string | null,"visibility"?: Database["public"]['Enums']["event_visibility"]
                  }
                  Update: {
                    "accessibility_info"?: string | null,"address_line"?: string | null,"admissions_held"?: number,"admissions_sold"?: number,"age_restriction"?: number | null,"attendee_questions"?: NonNullable<Json>,"cancellation_reason"?: string | null,"cancelled_at"?: string | null,"capacity"?: number,"category_id"?: string | null,"city_id"?: string | null,"collect_attendee_names"?: boolean,"country_code"?: string,"cover_alt"?: string | null,"cover_path"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"description_html"?: string | null,"ends_at"?: string,"entry_rules"?: string | null,"featured_rank"?: number | null,"format"?: Database["public"]['Enums']["event_format"],"id"?: string,"is_featured"?: boolean,"moderation_notes"?: string | null,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"organization_id"?: string,"published_at"?: string | null,"refund_policy"?: string,"refund_policy_text"?: string | null,"region_id"?: string | null,"slug"?: string,"starts_at"?: string,"status"?: Database["public"]['Enums']["event_status"],"summary"?: string | null,"tags"?: (string)[],"timezone"?: string,"title"?: string,"updated_at"?: string,"venue_id"?: string | null,"venue_name"?: string | null,"visibility"?: Database["public"]['Enums']["event_visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_country_code_fkey"
      columns: ["country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "events_currency_fkey"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["organization_id"]
    },{
      foreignKeyName: "events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_region_id_fkey"
      columns: ["region_id"]
isOneToOne: false
      referencedRelation: "regions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_venue_same_org"
      columns: ["venue_id","organization_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"favorites": {
                  Row: {
                    "created_at": string,"event_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "favorites_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "favorites_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "favorites_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "trending_events"
      referencedColumns: ["event_id"]
    }
                  ]
                },"fee_policies": {
                  Row: {
                    "buyer_fee_bps": number,"buyer_fixed_minor": number,"created_at": string,"created_by": string | null,"currency": string,"effective_from": string,"event_id": string | null,"id": string,"note": string | null,"organization_id": string | null,"platform_fee_bps": number,"platform_fee_refundable": boolean,"platform_fixed_minor": number,"scope": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buyer_fee_bps"?: number,"buyer_fixed_minor"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"effective_from"?: string,"event_id"?: string | null,"id"?: string,"note"?: string | null,"organization_id"?: string | null,"platform_fee_bps": number,"platform_fee_refundable"?: boolean,"platform_fixed_minor"?: number,"scope": string
                  }
                  Update: {
                    "buyer_fee_bps"?: number,"buyer_fixed_minor"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"effective_from"?: string,"event_id"?: string | null,"id"?: string,"note"?: string | null,"organization_id"?: string | null,"platform_fee_bps"?: number,"platform_fee_refundable"?: boolean,"platform_fixed_minor"?: number,"scope"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fee_policies_currency_fkey"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "fee_policies_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_policies_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_policies_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "trending_events"
      referencedColumns: ["event_id"]
    },{
      foreignKeyName: "fee_policies_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_policies_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["organization_id"]
    },{
      foreignKeyName: "fee_policies_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string,"organization_id": string,"revoked_at": string | null,"role": Database["public"]['Enums']["org_role"],"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email": string,"expires_at": string,"id"?: string,"invited_by": string,"organization_id": string,"revoked_at"?: string | null,"role": Database["public"]['Enums']["org_role"],"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string,"organization_id"?: string,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["org_role"],"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["organization_id"]
    },{
      foreignKeyName: "invitations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"ledger_accounts": {
                  Row: {
                    "code": string,"created_at": string,"currency": string,"id": string,"normal_side": string,"organization_id": string | null,"owner_kind": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"currency": string,"id"?: string,"normal_side": string,"organization_id"?: string | null,"owner_kind": string,"user_id"?: string | null
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"currency"?: string,"id"?: string,"normal_side"?: string,"organization_id"?: string | null,"owner_kind"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_accounts_currency_fkey"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "ledger_accounts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_accounts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["organization_id"]
    },{
      foreignKeyName: "ledger_accounts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"ledger_entries": {
                  Row: {
                    "account_id": string,"created_at": string,"credit_minor": number,"currency": string,"debit_minor": number,"id": number,"transaction_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"credit_minor"?: number,"currency": string,"debit_minor"?: number,"id"?: never,"transaction_id": string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"credit_minor"?: number,"currency"?: string,"debit_minor"?: number,"id"?: never,"transaction_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_entries_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "ledger_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "ledger_transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"ledger_transactions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"description": string | null,"id": string,"idempotency_key": string,"kind": string,"order_id": string | null,"payout_id": string | null,"refund_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"idempotency_key": string,"kind": string,"order_id"?: string | null,"payout_id"?: string | null,"refund_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"idempotency_key"?: string,"kind"?: string,"order_id"?: string | null,"payout_id"?: string | null,"refund_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_transactions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "created_at": string,"id": string,"organization_id": string,"role": Database["public"]['Enums']["org_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"organization_id": string,"role": Database["public"]['Enums']["org_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"organization_id"?: string,"role"?: Database["public"]['Enums']["org_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["organization_id"]
    },{
      foreignKeyName: "memberships_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"id": string,"kind": string,"link": string | null,"read_at": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"link"?: string | null,"read_at"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"link"?: string | null,"read_at"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"order_access_tokens": {
                  Row: {
                    "created_at": string,"email": string,"expires_at": string,"id": string,"order_id": string | null,"purpose": string,"token_hash": string,"used_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"expires_at": string,"id"?: string,"order_id"?: string | null,"purpose": string,"token_hash": string,"used_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"order_id"?: string | null,"purpose"?: string,"token_hash"?: string,"used_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_access_tokens_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"order_attributions": {
                  Row: {
                    "attributed_at": string,"attribution_window_days": number,"clicked_at": string,"eligible_ticket_type_ids": (string)[] | null,"enrollment_id": string,"link_id": string,"maturity_days_after_event": number,"order_id": string,"program_version_id": string,"promoter_user_id": string,"rate_bps": number
                  }
                  ComputedFields: never
                  Insert: {
                    "attributed_at"?: string,"attribution_window_days": number,"clicked_at": string,"eligible_ticket_type_ids"?: (string)[] | null,"enrollment_id": string,"link_id": string,"maturity_days_after_event": number,"order_id": string,"program_version_id": string,"promoter_user_id": string,"rate_bps": number
                  }
                  Update: {
                    "attributed_at"?: string,"attribution_window_days"?: number,"clicked_at"?: string,"eligible_ticket_type_ids"?: (string)[] | null,"enrollment_id"?: string,"link_id"?: string,"maturity_days_after_event"?: number,"order_id"?: string,"program_version_id"?: string,"promoter_user_id"?: string,"rate_bps"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_attributions_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: false
      referencedRelation: "promoter_enrollments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_attributions_link_id_fkey"
      columns: ["link_id"]
isOneToOne: false
      referencedRelation: "referral_links"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_attributions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_attributions_program_version_id_fkey"
      columns: ["program_version_id"]
isOneToOne: false
      referencedRelation: "public_referral_programs"
      referencedColumns: ["version_id"]
    },{
      foreignKeyName: "order_attributions_program_version_id_fkey"
      columns: ["program_version_id"]
isOneToOne: false
      referencedRelation: "referral_program_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "admissions_per_unit": number,"commission_minor": number,"created_at": string,"discount_minor": number,"id": string,"line_net_minor": number,"line_subtotal_minor": number,"order_id": string,"organizer_net_minor": number,"platform_fee_minor": number,"quantity": number,"refunded_units": number,"ticket_kind": Database["public"]['Enums']["ticket_kind"],"ticket_type_id": string,"ticket_type_name": string,"unit_price_minor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "admissions_per_unit": number,"commission_minor"?: number,"created_at"?: string,"discount_minor"?: number,"id"?: string,"line_net_minor": number,"line_subtotal_minor": number,"order_id": string,"organizer_net_minor"?: number,"platform_fee_minor"?: number,"quantity": number,"refunded_units"?: number,"ticket_kind": Database["public"]['Enums']["ticket_kind"],"ticket_type_id": string,"ticket_type_name": string,"unit_price_minor": number
                  }
                  Update: {
                    "admissions_per_unit"?: number,"commission_minor"?: number,"created_at"?: string,"discount_minor"?: number,"id"?: string,"line_net_minor"?: number,"line_subtotal_minor"?: number,"order_id"?: string,"organizer_net_minor"?: number,"platform_fee_minor"?: number,"quantity"?: number,"refunded_units"?: number,"ticket_kind"?: Database["public"]['Enums']["ticket_kind"],"ticket_type_id"?: string,"ticket_type_name"?: string,"unit_price_minor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_ticket_type_id_fkey"
      columns: ["ticket_type_id"]
isOneToOne: false
      referencedRelation: "public_ticket_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_ticket_type_id_fkey"
      columns: ["ticket_type_id"]
isOneToOne: false
      referencedRelation: "ticket_types"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "admissions": number,"answers": NonNullable<Json>,"buyer_email": string,"buyer_fee_minor": number,"buyer_name": string,"buyer_phone": string | null,"buyer_user_id": string | null,"cash_collected_by": string | null,"channel": string,"created_at": string,"currency": string,"discount_minor": number,"door_staff_id": string | null,"event_id": string,"exception_reason": string | null,"expired_at": string | null,"fee_policy_id": string | null,"fee_snapshot": NonNullable<Json>,"fulfilled_at": string | null,"hold_expires_at": string | null,"id": string,"idempotency_key": string,"organization_id": string,"organizer_net_minor": number,"paid_at": string | null,"payment_method": Database["public"]['Enums']["payment_method"],"platform_fee_minor": number,"promo_code": string | null,"promoter_commission_minor": number,"promotion_id": string | null,"public_ref": string,"status": Database["public"]['Enums']["order_status"],"subtotal_minor": number,"total_minor": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "admissions": number,"answers"?: NonNullable<Json>,"buyer_email": string,"buyer_fee_minor"?: number,"buyer_name": string,"buyer_phone"?: string | null,"buyer_user_id"?: string | null,"cash_collected_by"?: string | null,"channel"?: string,"created_at"?: string,"currency": string,"discount_minor"?: number,"door_staff_id"?: string | null,"event_id": string,"exception_reason"?: string | null,"expired_at"?: string | null,"fee_policy_id"?: string | null,"fee_snapshot"?: NonNullable<Json>,"fulfilled_at"?: string | null,"hold_expires_at"?: string | null,"id"?: string,"idempotency_key": string,"organization_id": string,"organizer_net_minor"?: number,"paid_at"?: string | null,"payment_method": Database["public"]['Enums']["payment_method"],"platform_fee_minor"?: number,"promo_code"?: string | null,"promoter_commission_minor"?: number,"promotion_id"?: string | null,"public_ref"?: string,"status"?: Database["public"]['Enums']["order_status"],"subtotal_minor": number,"total_minor": number,"updated_at"?: string
                  }
                  Update: {
                    "admissions"?: number,"answers"?: NonNullable<Json>,"buyer_email"?: string,"buyer_fee_minor"?: number,"buyer_name"?: string,"buyer_phone"?: string | null,"buyer_user_id"?: string | null,"cash_collected_by"?: string | null,"channel"?: string,"created_at"?: string,"currency"?: string,"discount_minor"?: number,"door_staff_id"?: string | null,"event_id"?: string,"exception_reason"?: string | null,"expired_at"?: string | null,"fee_policy_id"?: string | null,"fee_snapshot"?: NonNullable<Json>,"fulfilled_at"?: string | null,"hold_expires_at"?: string | null,"id"?: string,"idempotency_key"?: string,"organization_id"?: string,"organizer_net_minor"?: number,"paid_at"?: string | null,"payment_method"?: Database["public"]['Enums']["payment_method"],"platform_fee_minor"?: number,"promo_code"?: string | null,"promoter_commission_minor"?: number,"promotion_id"?: string | null,"public_ref"?: string,"status"?: Database["public"]['Enums']["order_status"],"subtotal_minor"?: number,"total_minor"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_currency_fkey"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "orders_event_org"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "orders_fee_policy_id_fkey"
      columns: ["fee_policy_id"]
isOneToOne: false
      referencedRelation: "fee_policies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_promotion_id_fkey"
      columns: ["promotion_id"]
isOneToOne: false
      referencedRelation: "promotions"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_referral_defaults": {
                  Row: {
                    "attribution_window_days": number,"enrollment_mode": string,"organization_id": string,"rate_bps": number,"terms_text": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attribution_window_days"?: number,"enrollment_mode"?: string,"organization_id": string,"rate_bps": number,"terms_text": string,"updated_at"?: string
                  }
                  Update: {
                    "attribution_window_days"?: number,"enrollment_mode"?: string,"organization_id"?: string,"rate_bps"?: number,"terms_text"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_referral_defaults_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_referral_defaults_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "public_events"
      referencedColumns: ["organization_id"]
    },{
      foreignKeyName: "organization_referral_defaults_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "public_organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "approval_status": Database["public"]['Enums']["org_approval_status"],"city_id": string | null,"contact_email": string | null,"contact_phone": string | null,"country_code": string,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"is_first_party": boolean,"logo_path": string | null,"name": string,"payout_status": Database["public"]['Enums']["org_payout_status"],"region_id": string | null,"slug": string,"status": Database["public"]['Enums']["org_status"],"status_reason": string | null,"updated_at": string,"verification_status": Database["public"]['Enums']["org_verification_status"],"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_status"?: Database["public"]['Enums']["org_approval_status"],"city_id"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"country_code"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"is_first_party"?: boolean,"logo_path"?: string | null,"name": string,"payout_status"?: Database["public"]['Enums']["org_payout_status"],"region_id"?: string | null,"slug": string,"status"?: Database["public"]['Enums']["org_status"],"status_reason"?: string | null,"updated_at"?: string,"verification_status"?: Database["public"]['Enums']["org_verification_status"],"website"?: string | null
                  }
                  Update: {
                    "approval_status"?: Database["public"]['Enums']["org_approval_status"],"city_id"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"country_code"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"is_first_party"?: boolean,"logo_path"?: string | null,"name"?: string,"payout_status"?: Database["public"]['Enums']["org_payout_status"],"region_id"?: string | null,"slug"?: string,"status"?: Database["public"]['Enums']["org_status"],"status_reason"?: string | null,"updated_at"?: string,"verification_status"?: Database["public"]['Enums']["org_verification_status"],"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "organizations_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organizations_country_code_fkey"
      columns: ["country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "organizations_region_id_fkey"
      columns: ["region_id"]
isOneToOne: false
      referencedRelation: "regions"
      referencedColumns: ["id"]
    }
                  ]
                },"outbox_jobs": {
                  Row: {
                    "attempts": number,"completed_at": string | null,"created_at": string,"dedupe_key": string,"id": number,"kind": string,"last_error": string | null,"locked_at": string | null,"locked_by": string | null,"max_attempts": number,"payload": NonNullable<Json>,"run_after": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"completed_at"?: string | null,"created_at"?: string,"dedupe_key": string,"id"?: never,"kind": string,"last_error"?: string | null,"locked_at"?: string | null,"locked_by"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"run_after"?: string,"status"?: string
                  }
                  Update: {
                    "attempts"?: number,"completed_at"?: string | null,"created_at"?: string,"dedupe_key"?: string,"id"?: never,"kind"?: string,"last_error"?: string | null,"locked_at"?: string | null,"locked_by"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"run_after"?: string,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payment_attempts": {
                  Row: {
                    "amount_minor": number,"authorization_url": string | null,"channel": string | null,"created_at": string,"currency": string,"environment": string,"failure_reason": string | null,"id": string,"order_id": string,"provider": string,"provider_fees_minor": number | null,"provider_transaction_id": string | null,"reference": string,"status": string,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"authorization_url"?: string | null,"channel"?: string | null,"created_at"?: string,"currency": string,"environment": string,"failure_reason"?: string | null,"id"?: string,"order_id": string,"provider": string,"provider_fees_minor"?: number | null,"provider_transaction_id"?: string | null,"reference": string,"status"?: string,"verified_at"?: string | null
                  }
                  Update: {
                    "amount_minor"?: number,"authorization_url"?: string | null,"channel"?: string | null,"created_at"?: string,"currency"?: string,"environment"?: string,"failure_reason"?: string | null,"id"?: string,"order_id"?: string,"provider"?: string,"provider_fees_minor"?: number | null,"provider_transaction_id"?: string | null,"reference"?: string,"status"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_attempts_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"payout_attempts": {
                  Row: {
                    "created_at": string,"created_by": string | null,"detail": NonNullable<Json>,"id": string,"payout_id": string,"provider": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"detail"?: NonNullable<Json>,"id"?: string,"payout_id": string,"provider": string,"status": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"detail"?: NonNullable<Json>,"id"?: string,"payout_id"?: string,"provider"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payout_attempts_payout_id_fkey"
      columns: ["payout_id"]
isOneToOne: false
      referencedRelation: "payout_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"payout_recipients": {
                  Row: {
                    "account_last4": string,"account_name": string,"bank_code": string,"bank_name": string,"beneficiary_kind": string,"created_at": string,"created_by": string | null,"id": string,"organization_id": string | null,"provider_recipient_code": string | null,"status": string,"user_id": string | null,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_last4": string,"account_name": string,"bank_code": string,"bank_name": string,"beneficiary_kind": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"organization_id"?: string | null,"provider_recipient_code"?: string | null,"status"?: string,"user_id"?: string | null,"verified_at"?: string | null
                  }
                  Update: {
                    "account_last4"?: string,"account_name"?: string,"bank_code"?: string,"bank_name"?: string,"beneficiary_kind"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"organization_id"?: string | null,"provider_recipient_code"?: string | null,"status"?: string,"user_id"?: string | null,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payout_recipients_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payout_recipients_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["organization_id"]
    },{
      foreignKeyName: "payout_recipients_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"payout_requests": {
                  Row: {
                    "amount_minor": number,"beneficiary_kind": string,"created_at": string,"currency": string,"external_reference": string | null,"failure_reason": string | null,"id": string,"idempotency_key": string,"organization_id": string | null,"provider_transfer_code": string | null,"recipient_id": string,"reference": string,"requested_by": string,"review_note": string | null,"reviewed_by": string | null,"settlement_method": string,"status": Database["public"]['Enums']["payout_status"],"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"beneficiary_kind": string,"created_at"?: string,"currency": string,"external_reference"?: string | null,"failure_reason"?: string | null,"id"?: string,"idempotency_key": string,"organization_id"?: string | null,"provider_transfer_code"?: string | null,"recipient_id": string,"reference"?: string,"requested_by": string,"review_note"?: string | null,"reviewed_by"?: string | null,"settlement_method"?: string,"status"?: Database["public"]['Enums']["payout_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "amount_minor"?: number,"beneficiary_kind"?: string,"created_at"?: string,"currency"?: string,"external_reference"?: string | null,"failure_reason"?: string | null,"id"?: string,"idempotency_key"?: string,"organization_id"?: string | null,"provider_transfer_code"?: string | null,"recipient_id"?: string,"reference"?: string,"requested_by"?: string,"review_note"?: string | null,"reviewed_by"?: string | null,"settlement_method"?: string,"status"?: Database["public"]['Enums']["payout_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payout_requests_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payout_requests_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["organization_id"]
    },{
      foreignKeyName: "payout_requests_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payout_requests_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "payout_recipients"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_role_assignments": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"revoked_at": string | null,"role": Database["public"]['Enums']["platform_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"revoked_at"?: string | null,"role": Database["public"]['Enums']["platform_role"],"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["platform_role"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_settings": {
                  Row: {
                    "description": string | null,"key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "description"?: string | null,"key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"created_at": string,"deleted_at": string | null,"full_name": string | null,"id": string,"marketing_opt_in": boolean,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"full_name"?: string | null,"id": string,"marketing_opt_in"?: boolean,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar_path"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"full_name"?: string | null,"id"?: string,"marketing_opt_in"?: boolean,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"promoter_enrollments": {
                  Row: {
                    "accepted_terms_at": string,"accepted_version_id": string,"application_note": string | null,"created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_reason": string | null,"id": string,"program_id": string,"rate_override_bps": number | null,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_terms_at"?: string,"accepted_version_id": string,"application_note"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"id"?: string,"program_id": string,"rate_override_bps"?: number | null,"status"?: string,"user_id": string
                  }
                  Update: {
                    "accepted_terms_at"?: string,"accepted_version_id"?: string,"application_note"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"id"?: string,"program_id"?: string,"rate_override_bps"?: number | null,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "promoter_enrollments_accepted_version_id_fkey"
      columns: ["accepted_version_id"]
isOneToOne: false
      referencedRelation: "public_referral_programs"
      referencedColumns: ["version_id"]
    },{
      foreignKeyName: "promoter_enrollments_accepted_version_id_fkey"
      columns: ["accepted_version_id"]
isOneToOne: false
      referencedRelation: "referral_program_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promoter_enrollments_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "public_referral_programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promoter_enrollments_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "referral_programs"
      referencedColumns: ["id"]
    }
                  ]
                },"promotions": {
                  Row: {
                    "amount_minor": number | null,"code": string,"created_at": string,"description": string | null,"discount_type": string,"ends_at": string | null,"event_id": string,"id": string,"is_active": boolean,"max_redemptions": number | null,"organization_id": string,"percent_bps": number | null,"redemptions_completed": number,"redemptions_reserved": number,"starts_at": string | null,"ticket_type_ids": (string)[] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor"?: number | null,"code": string,"created_at"?: string,"description"?: string | null,"discount_type": string,"ends_at"?: string | null,"event_id": string,"id"?: string,"is_active"?: boolean,"max_redemptions"?: number | null,"organization_id": string,"percent_bps"?: number | null,"redemptions_completed"?: number,"redemptions_reserved"?: number,"starts_at"?: string | null,"ticket_type_ids"?: (string)[] | null
                  }
                  Update: {
                    "amount_minor"?: number | null,"code"?: string,"created_at"?: string,"description"?: string | null,"discount_type"?: string,"ends_at"?: string | null,"event_id"?: string,"id"?: string,"is_active"?: boolean,"max_redemptions"?: number | null,"organization_id"?: string,"percent_bps"?: number | null,"redemptions_completed"?: number,"redemptions_reserved"?: number,"starts_at"?: string | null,"ticket_type_ids"?: (string)[] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "promotions_event_org"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"provider_events": {
                  Row: {
                    "dedupe_key": string,"error": string | null,"event_type": string | null,"id": string,"outcome": string | null,"payload": Json | null,"processed_at": string | null,"provider": string,"received_at": string,"reference": string | null,"signature_valid": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "dedupe_key": string,"error"?: string | null,"event_type"?: string | null,"id"?: string,"outcome"?: string | null,"payload"?: Json | null,"processed_at"?: string | null,"provider": string,"received_at"?: string,"reference"?: string | null,"signature_valid": boolean
                  }
                  Update: {
                    "dedupe_key"?: string,"error"?: string | null,"event_type"?: string | null,"id"?: string,"outcome"?: string | null,"payload"?: Json | null,"processed_at"?: string | null,"provider"?: string,"received_at"?: string,"reference"?: string | null,"signature_valid"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"referral_flags": {
                  Row: {
                    "created_at": string,"details": NonNullable<Json>,"enrollment_id": string | null,"id": string,"kind": string,"order_id": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"details"?: NonNullable<Json>,"enrollment_id"?: string | null,"id"?: string,"kind": string,"order_id"?: string | null,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"details"?: NonNullable<Json>,"enrollment_id"?: string | null,"id"?: string,"kind"?: string,"order_id"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "referral_flags_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: false
      referencedRelation: "promoter_enrollments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "referral_flags_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"referral_links": {
                  Row: {
                    "code": string,"created_at": string,"disabled_at": string | null,"enrollment_id": string,"event_id": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code"?: string,"created_at"?: string,"disabled_at"?: string | null,"enrollment_id": string,"event_id": string,"id"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"disabled_at"?: string | null,"enrollment_id"?: string,"event_id"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "referral_links_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: false
      referencedRelation: "promoter_enrollments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "referral_links_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "referral_links_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "referral_links_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "trending_events"
      referencedColumns: ["event_id"]
    }
                  ]
                },"referral_program_versions": {
                  Row: {
                    "attribution_window_days": number,"created_at": string,"created_by": string | null,"eligible_ticket_type_ids": (string)[] | null,"ends_at": string | null,"id": string,"maturity_days_after_event": number,"program_id": string,"rate_bps": number,"starts_at": string | null,"terms_text": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "attribution_window_days": number,"created_at"?: string,"created_by"?: string | null,"eligible_ticket_type_ids"?: (string)[] | null,"ends_at"?: string | null,"id"?: string,"maturity_days_after_event": number,"program_id": string,"rate_bps": number,"starts_at"?: string | null,"terms_text": string,"version": number
                  }
                  Update: {
                    "attribution_window_days"?: number,"created_at"?: string,"created_by"?: string | null,"eligible_ticket_type_ids"?: (string)[] | null,"ends_at"?: string | null,"id"?: string,"maturity_days_after_event"?: number,"program_id"?: string,"rate_bps"?: number,"starts_at"?: string | null,"terms_text"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "referral_program_versions_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "public_referral_programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "referral_program_versions_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "referral_programs"
      referencedColumns: ["id"]
    }
                  ]
                },"referral_programs": {
                  Row: {
                    "created_at": string,"current_version_id": string | null,"enrollment_mode": string,"event_id": string,"id": string,"organization_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"current_version_id"?: string | null,"enrollment_mode"?: string,"event_id": string,"id"?: string,"organization_id": string,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"current_version_id"?: string | null,"enrollment_mode"?: string,"event_id"?: string,"id"?: string,"organization_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "referral_programs_current_version"
      columns: ["current_version_id"]
isOneToOne: false
      referencedRelation: "public_referral_programs"
      referencedColumns: ["version_id"]
    },{
      foreignKeyName: "referral_programs_current_version"
      columns: ["current_version_id"]
isOneToOne: false
      referencedRelation: "referral_program_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "referral_programs_event_org"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"referral_visits": {
                  Row: {
                    "id": number,"link_id": string,"session_hash": string | null,"visited_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: never,"link_id": string,"session_hash"?: string | null,"visited_at"?: string
                  }
                  Update: {
                    "id"?: never,"link_id"?: string,"session_hash"?: string | null,"visited_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "referral_visits_link_id_fkey"
      columns: ["link_id"]
isOneToOne: false
      referencedRelation: "referral_links"
      referencedColumns: ["id"]
    }
                  ]
                },"refund_attempts": {
                  Row: {
                    "amount_minor": number,"created_at": string,"failure_reason": string | null,"id": string,"provider": string,"provider_refund_id": string | null,"refund_request_id": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"created_at"?: string,"failure_reason"?: string | null,"id"?: string,"provider": string,"provider_refund_id"?: string | null,"refund_request_id": string,"status": string,"updated_at"?: string
                  }
                  Update: {
                    "amount_minor"?: number,"created_at"?: string,"failure_reason"?: string | null,"id"?: string,"provider"?: string,"provider_refund_id"?: string | null,"refund_request_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "refund_attempts_refund_request_id_fkey"
      columns: ["refund_request_id"]
isOneToOne: false
      referencedRelation: "refund_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"refund_batches": {
                  Row: {
                    "created_at": string,"created_by": string | null,"event_id": string,"id": string,"reason": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"event_id": string,"id"?: string,"reason": string,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"event_id"?: string,"id"?: string,"reason"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "refund_batches_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refund_batches_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refund_batches_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "trending_events"
      referencedColumns: ["event_id"]
    }
                  ]
                },"refund_items": {
                  Row: {
                    "amount_minor": number,"commission_reversed_minor": number,"order_item_id": string,"organizer_reversed_minor": number,"platform_fee_reversed_minor": number,"refund_request_id": string,"ticket_ids": (string)[],"units": number
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"commission_reversed_minor"?: number,"order_item_id": string,"organizer_reversed_minor"?: number,"platform_fee_reversed_minor"?: number,"refund_request_id": string,"ticket_ids"?: (string)[],"units": number
                  }
                  Update: {
                    "amount_minor"?: number,"commission_reversed_minor"?: number,"order_item_id"?: string,"organizer_reversed_minor"?: number,"platform_fee_reversed_minor"?: number,"refund_request_id"?: string,"ticket_ids"?: (string)[],"units"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "refund_items_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refund_items_refund_request_id_fkey"
      columns: ["refund_request_id"]
isOneToOne: false
      referencedRelation: "refund_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"refund_requests": {
                  Row: {
                    "amount_minor": number,"batch_id": string | null,"completed_at": string | null,"created_at": string,"id": string,"include_used_tickets": boolean,"kind": string,"order_id": string,"organization_id": string,"payment_attempt_id": string | null,"reason": string,"requested_by": string | null,"requester_kind": string,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor"?: number,"batch_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"id"?: string,"include_used_tickets"?: boolean,"kind"?: string,"order_id": string,"organization_id": string,"payment_attempt_id"?: string | null,"reason": string,"requested_by"?: string | null,"requester_kind": string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string
                  }
                  Update: {
                    "amount_minor"?: number,"batch_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"id"?: string,"include_used_tickets"?: boolean,"kind"?: string,"order_id"?: string,"organization_id"?: string,"payment_attempt_id"?: string | null,"reason"?: string,"requested_by"?: string | null,"requester_kind"?: string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "refund_requests_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "refund_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refund_requests_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refund_requests_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refund_requests_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["organization_id"]
    },{
      foreignKeyName: "refund_requests_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refund_requests_payment_attempt_id_fkey"
      columns: ["payment_attempt_id"]
isOneToOne: false
      referencedRelation: "payment_attempts"
      referencedColumns: ["id"]
    }
                  ]
                },"regions": {
                  Row: {
                    "code": string,"country_code": string,"id": string,"is_launch_region": boolean,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"country_code": string,"id"?: string,"is_launch_region"?: boolean,"name": string
                  }
                  Update: {
                    "code"?: string,"country_code"?: string,"id"?: string,"is_launch_region"?: boolean,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "regions_country_code_fkey"
      columns: ["country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    }
                  ]
                },"reports": {
                  Row: {
                    "created_at": string,"details": string | null,"event_id": string | null,"handled_at": string | null,"handled_by": string | null,"id": string,"organization_id": string | null,"reason": string,"reporter_id": string | null,"resolution": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"details"?: string | null,"event_id"?: string | null,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"organization_id"?: string | null,"reason": string,"reporter_id"?: string | null,"resolution"?: string | null,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"details"?: string | null,"event_id"?: string | null,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"organization_id"?: string | null,"reason"?: string,"reporter_id"?: string | null,"resolution"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "trending_events"
      referencedColumns: ["event_id"]
    },{
      foreignKeyName: "reports_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["organization_id"]
    },{
      foreignKeyName: "reports_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"ticket_types": {
                  Row: {
                    "access_code_hash": string | null,"admissions_per_unit": number,"created_at": string,"currency": string,"description": string | null,"event_id": string,"id": string,"is_active": boolean,"kind": Database["public"]['Enums']["ticket_kind"],"max_per_order": number,"min_per_order": number,"name": string,"opens_after_ticket_type_id": string | null,"organization_id": string,"price_minor": number,"quantity_total": number,"sales_end_at": string | null,"sales_start_at": string | null,"sort_order": number,"units_held": number,"units_sold": number,"updated_at": string,"visibility": Database["public"]['Enums']["ticket_visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "access_code_hash"?: string | null,"admissions_per_unit"?: number,"created_at"?: string,"currency"?: string,"description"?: string | null,"event_id": string,"id"?: string,"is_active"?: boolean,"kind"?: Database["public"]['Enums']["ticket_kind"],"max_per_order"?: number,"min_per_order"?: number,"name": string,"opens_after_ticket_type_id"?: string | null,"organization_id": string,"price_minor": number,"quantity_total": number,"sales_end_at"?: string | null,"sales_start_at"?: string | null,"sort_order"?: number,"units_held"?: number,"units_sold"?: number,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["ticket_visibility"]
                  }
                  Update: {
                    "access_code_hash"?: string | null,"admissions_per_unit"?: number,"created_at"?: string,"currency"?: string,"description"?: string | null,"event_id"?: string,"id"?: string,"is_active"?: boolean,"kind"?: Database["public"]['Enums']["ticket_kind"],"max_per_order"?: number,"min_per_order"?: number,"name"?: string,"opens_after_ticket_type_id"?: string | null,"organization_id"?: string,"price_minor"?: number,"quantity_total"?: number,"sales_end_at"?: string | null,"sales_start_at"?: string | null,"sort_order"?: number,"units_held"?: number,"units_sold"?: number,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["ticket_visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_types_currency_fkey"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "ticket_types_event_org"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "ticket_types_opens_after_ticket_type_id_fkey"
      columns: ["opens_after_ticket_type_id"]
isOneToOne: false
      referencedRelation: "public_ticket_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_types_opens_after_ticket_type_id_fkey"
      columns: ["opens_after_ticket_type_id"]
isOneToOne: false
      referencedRelation: "ticket_types"
      referencedColumns: ["id"]
    }
                  ]
                },"tickets": {
                  Row: {
                    "admission_number": number,"attendee_email": string | null,"attendee_name": string | null,"check_in_count": number,"event_id": string,"first_checked_in_at": string | null,"id": string,"issued_at": string,"order_id": string,"order_item_id": string,"public_ref": string,"qr_hash": string | null,"status": Database["public"]['Enums']["ticket_status"],"ticket_type_id": string,"token_version": number,"unit_number": number,"void_reason": string | null,"voided_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "admission_number": number,"attendee_email"?: string | null,"attendee_name"?: string | null,"check_in_count"?: number,"event_id": string,"first_checked_in_at"?: string | null,"id"?: string,"issued_at"?: string,"order_id": string,"order_item_id": string,"public_ref"?: string,"qr_hash"?: string | null,"status"?: Database["public"]['Enums']["ticket_status"],"ticket_type_id": string,"token_version"?: number,"unit_number": number,"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Update: {
                    "admission_number"?: number,"attendee_email"?: string | null,"attendee_name"?: string | null,"check_in_count"?: number,"event_id"?: string,"first_checked_in_at"?: string | null,"id"?: string,"issued_at"?: string,"order_id"?: string,"order_item_id"?: string,"public_ref"?: string,"qr_hash"?: string | null,"status"?: Database["public"]['Enums']["ticket_status"],"ticket_type_id"?: string,"token_version"?: number,"unit_number"?: number,"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tickets_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "trending_events"
      referencedColumns: ["event_id"]
    },{
      foreignKeyName: "tickets_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_ticket_type_id_fkey"
      columns: ["ticket_type_id"]
isOneToOne: false
      referencedRelation: "public_ticket_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_ticket_type_id_fkey"
      columns: ["ticket_type_id"]
isOneToOne: false
      referencedRelation: "ticket_types"
      referencedColumns: ["id"]
    }
                  ]
                },"venues": {
                  Row: {
                    "address_line": string | null,"city_id": string | null,"created_at": string,"id": string,"latitude": number | null,"longitude": number | null,"name": string,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address_line"?: string | null,"city_id"?: string | null,"created_at"?: string,"id"?: string,"latitude"?: number | null,"longitude"?: number | null,"name": string,"organization_id": string
                  }
                  Update: {
                    "address_line"?: string | null,"city_id"?: string | null,"created_at"?: string,"id"?: string,"latitude"?: number | null,"longitude"?: number | null,"name"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venues_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venues_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venues_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["organization_id"]
    },{
      foreignKeyName: "venues_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "public_organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "public_event_media": {
                  Row: {
                    "alt": string | null,"event_id": string,"id": string,"path": string,"sort_order": number
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "event_media_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_media_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "public_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_media_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "trending_events"
      referencedColumns: ["event_id"]
    }
                  ]
                },"public_events": {
                  Row: {
                    "accessibility_info": string | null,"address_line": string | null,"age_restriction": number | null,"attendee_questions": NonNullable<Json>,"cancellation_reason": string | null,"category_id": string | null,"category_name": string | null,"category_slug": string | null,"city_id": string | null,"city_name": string | null,"city_slug": string | null,"collect_attendee_names": boolean,"country_code": string,"cover_alt": string | null,"cover_path": string | null,"currency": string,"description_html": string | null,"ends_at": string,"entry_rules": string | null,"featured_rank": number | null,"format": Database["public"]['Enums']["event_format"],"id": string,"is_featured": boolean,"is_first_party": boolean,"is_sold_out": boolean | null,"latitude": number | null,"longitude": number | null,"max_price_minor": number | null,"min_price_minor": number | null,"organization_id": string,"organization_logo_path": string | null,"organization_name": string,"organization_slug": string,"organization_verified": boolean | null,"published_at": string | null,"refund_policy": string,"refund_policy_text": string | null,"region_id": string | null,"region_name": string | null,"sales_ended": boolean | null,"search_vector": unknown,"slug": string,"starts_at": string,"status": Database["public"]['Enums']["event_status"],"summary": string | null,"tags": (string)[],"timezone": string,"title": string,"venue_name": string | null,"visibility": Database["public"]['Enums']["event_visibility"]
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "events_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_country_code_fkey"
      columns: ["country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "events_currency_fkey"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "events_region_id_fkey"
      columns: ["region_id"]
isOneToOne: false
      referencedRelation: "regions"
      referencedColumns: ["id"]
    }
                  ]
                },"public_organizations": {
                  Row: {
                    "city_id": string | null,"created_at": string,"description": string | null,"id": string,"is_first_party": boolean,"is_verified": boolean | null,"logo_path": string | null,"name": string,"slug": string,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "city_id"?: string | null,"created_at"?: string | null,"description"?: string | null,"id"?: string | null,"is_first_party"?: boolean | null,"is_verified"?: never,"logo_path"?: string | null,"name"?: string | null,"slug"?: string | null,"website"?: string | null
                         }
                        Update: {
                           "city_id"?: string | null,"created_at"?: string | null,"description"?: string | null,"id"?: string | null,"is_first_party"?: boolean | null,"is_verified"?: never,"logo_path"?: string | null,"name"?: string | null,"slug"?: string | null,"website"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "organizations_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["id"]
    }
                  ]
                },"public_referral_programs": {
                  Row: {
                    "attribution_window_days": number,"cover_path": string | null,"eligible_ticket_type_ids": (string)[] | null,"ends_at": string | null,"enrollment_mode": string,"event_id": string,"event_slug": string,"event_starts_at": string,"event_title": string,"id": string,"maturity_days_after_event": number,"organization_name": string,"rate_bps": number,"starts_at": string | null,"terms_text": string,"version": number,"version_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"public_ticket_types": {
                  Row: {
                    "admissions_per_unit": number,"availability": string | null,"currency": string,"description": string | null,"event_id": string,"few_left": boolean | null,"id": string,"kind": Database["public"]['Enums']["ticket_kind"],"max_per_order": number | null,"min_per_order": number,"name": string,"opens_after_name": string | null,"price_minor": number,"requires_access_code": boolean | null,"sales_end_at": string | null,"sales_start_at": string | null,"sort_order": number
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "ticket_types_currency_fkey"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    }
                  ]
                },"trending_events": {
                  Row: {
                    "event_id": string,"trend_rank": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token_hash": string }; Returns: string
                           },
"access_token_create":
{ Args: { "p_email": string,"p_hash": string,"p_minutes": number,"p_order"?: string,"p_purpose": string }; Returns: undefined
                           },
"access_token_resolve":
{ Args: { "p_hash": string }; Returns: Json
                           },
"admin_feature_event":
{ Args: { "p_event": string,"p_featured": boolean,"p_rank"?: number }; Returns: undefined
                           },
"admin_ledger":
{ Args: { "p_limit"?: number,"p_order"?: string }; Returns: Json
                           },
"admin_moderate_event":
{ Args: { "p_decision": string,"p_event": string,"p_notes"?: string }; Returns: undefined
                           },
"admin_overview":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"admin_retry_job":
{ Args: { "p_job": number }; Returns: undefined
                           },
"admin_set_fee_policy":
{ Args: { "p_buyer_fee_bps": number,"p_buyer_fixed_minor": number,"p_effective_from": string,"p_event": string,"p_note": string,"p_org": string,"p_platform_fee_bps": number,"p_platform_fixed_minor": number,"p_refundable": boolean,"p_scope": string }; Returns: string
                           },
"admin_set_setting":
{ Args: { "p_key": string,"p_reason": string,"p_value": Json }; Returns: undefined
                           },
"admin_update_organization":
{ Args: { "p_changes": Json,"p_org": string,"p_reason": string }; Returns: undefined
                           },
"assign_event_staff":
{ Args: { "p_comps": boolean,"p_door": boolean,"p_event": string,"p_reentry": boolean,"p_user": string }; Returns: undefined
                           },
"cancel_event":
{ Args: { "p_event": string,"p_reason": string }; Returns: string
                           },
"change_member_role":
{ Args: { "p_org": string,"p_role": Database["public"]['Enums']["org_role"],"p_user": string }; Returns: undefined
                           },
"checkout_cancel_order":
{ Args: { "p_order": string }; Returns: boolean
                           },
"checkout_create_order":
{ Args: { "p_answers"?: Json,"p_buyer": Json,"p_event": string,"p_idempotency_key": string,"p_items": Json,"p_promo_code"?: string,"p_referral"?: Json }; Returns: Json
                           },
"checkout_quote":
{ Args: { "p_event": string,"p_items": Json,"p_promo_code"?: string,"p_referral"?: Json }; Returns: Json
                           },
"complete_past_events":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"create_organization":
{ Args: { "p_city_id"?: string,"p_contact_email"?: string,"p_contact_phone"?: string,"p_description"?: string,"p_name": string,"p_slug": string }; Returns: string
                           },
"dispute_record":
{ Args: { "p_amount_minor": number,"p_dispute_id": string,"p_provider": string,"p_reason": string,"p_reference": string,"p_status": string }; Returns: undefined
                           },
"door_sale":
{ Args: { "p_buyer": Json,"p_event": string,"p_idempotency_key": string,"p_items": Json,"p_method": string }; Returns: Json
                           },
"email_intent":
{ Args: { "p_dedupe_key": string,"p_order"?: string,"p_subject": string,"p_template": string,"p_to": string }; Returns: Json
                           },
"email_mark":
{ Args: { "p_error"?: string,"p_id": string,"p_message_id"?: string,"p_provider": string,"p_status": string }; Returns: undefined
                           },
"event_set_status":
{ Args: { "p_event": string,"p_reason"?: string,"p_status": Database["public"]['Enums']["event_status"] }; Returns: undefined
                           },
"event_submit_for_review":
{ Args: { "p_event": string }; Returns: undefined
                           },
"expire_holds":
{ Args: { "p_limit"?: number }; Returns: number
                           },
"gate_check_in":
{ Args: { "p_device"?: string,"p_event": string,"p_qr_hash": string }; Returns: Json
                           },
"gate_check_in_ticket":
{ Args: { "p_device"?: string,"p_event": string,"p_ticket": string }; Returns: Json
                           },
"gate_event_stats":
{ Args: { "p_event": string }; Returns: Json
                           },
"gate_lookup":
{ Args: { "p_event": string,"p_query": string }; Returns: Json
                           },
"gate_reentry":
{ Args: { "p_device"?: string,"p_event": string,"p_reason": string,"p_ticket": string }; Returns: Json
                           },
"gate_ticket_types":
{ Args: { "p_event": string }; Returns: {
              "admissions_per_unit": number,"id": string,"kind": Database["public"]['Enums']["ticket_kind"],"name": string,"price_minor": number,"remaining": number
            }[]
                           },
"invite_member":
{ Args: { "p_email": string,"p_org": string,"p_role": Database["public"]['Enums']["org_role"],"p_token_hash": string }; Returns: string
                           },
"issue_complimentary":
{ Args: { "p_event": string,"p_idempotency_key": string,"p_quantity": number,"p_reason": string,"p_recipient": Json,"p_ticket_type": string }; Returns: Json
                           },
"jobs_claim":
{ Args: { "p_limit"?: number,"p_worker": string }; Returns: {
              "attempts": number,
"completed_at": string | null,
"created_at": string,
"dedupe_key": string,
"id": number,
"kind": string,
"last_error": string | null,
"locked_at": string | null,
"locked_by": string | null,
"max_attempts": number,
"payload": NonNullable<Json>,
"run_after": string,
"status": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "outbox_jobs"
        isOneToOne: false
        isSetofReturn: true
      } },
"jobs_complete":
{ Args: { "p_id": number }; Returns: undefined
                           },
"jobs_enqueue":
{ Args: { "p_dedupe_key": string,"p_kind": string,"p_payload": Json,"p_run_after"?: string }; Returns: boolean
                           },
"jobs_fail":
{ Args: { "p_error": string,"p_id": number }; Returns: undefined
                           },
"link_my_orders":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"my_gate_events":
{ Args: Record<PropertyKey, never>; Returns: Json[]
                           },
"my_platform_roles":
{ Args: Record<PropertyKey, never>; Returns: (Database["public"]['Enums']["platform_role"])[]
                           },
"org_balances":
{ Args: { "p_org": string }; Returns: Json
                           },
"org_event_summary":
{ Args: { "p_event": string }; Returns: Json
                           },
"org_members":
{ Args: { "p_org": string }; Returns: {
              "email": string,"full_name": string,"joined_at": string,"role": Database["public"]['Enums']["org_role"],"user_id": string
            }[]
                           },
"org_sales_series":
{ Args: { "p_days"?: number,"p_event"?: string,"p_org": string }; Returns: Json
                           },
"payment_attempt_create":
{ Args: { "p_environment": string,"p_order": string,"p_provider": string,"p_reference": string }; Returns: {
              "amount_minor": number,
"authorization_url": string | null,
"channel": string | null,
"created_at": string,
"currency": string,
"environment": string,
"failure_reason": string | null,
"id": string,
"order_id": string,
"provider": string,
"provider_fees_minor": number | null,
"provider_transaction_id": string | null,
"reference": string,
"status": string,
"verified_at": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "payment_attempts"
        isOneToOne: true
        isSetofReturn: false
      } },
"payment_attempt_set_url":
{ Args: { "p_reference": string,"p_url": string }; Returns: undefined
                           },
"payment_confirm":
{ Args: { "p_amount_minor": number,"p_channel"?: string,"p_currency": string,"p_environment": string,"p_fees_minor": number,"p_provider_tx_id": string,"p_reference": string,"p_status": string }; Returns: Json
                           },
"payout_recipient_mark_verified":
{ Args: { "p_recipient": string,"p_recipient_code": string,"p_resolved_name": string }; Returns: undefined
                           },
"payout_recipient_secret":
{ Args: { "p_recipient": string }; Returns: string
                           },
"payout_recipient_set":
{ Args: { "p_account_name": string,"p_account_number": string,"p_bank_code": string,"p_bank_name": string,"p_kind": string,"p_org": string }; Returns: string
                           },
"payout_request":
{ Args: { "p_amount_minor": number,"p_idempotency_key": string,"p_kind": string,"p_org": string }; Returns: string
                           },
"payout_transition":
{ Args: { "p_external_ref"?: string,"p_note"?: string,"p_payout": string,"p_to": Database["public"]['Enums']["payout_status"] }; Returns: undefined
                           },
"promoter_apply":
{ Args: { "p_note"?: string,"p_program": string,"p_version": string }; Returns: string
                           },
"promoter_dashboard":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"promoter_decide":
{ Args: { "p_enrollment": string,"p_rate_override_bps"?: number,"p_reason"?: string,"p_status": string }; Returns: undefined
                           },
"provider_event_mark":
{ Args: { "p_error"?: string,"p_id": string,"p_outcome": string }; Returns: undefined
                           },
"provider_event_record":
{ Args: { "p_dedupe_key": string,"p_event_type": string,"p_payload": Json,"p_provider": string,"p_reference"?: string,"p_signature_valid": boolean }; Returns: Json
                           },
"rate_limit_hit":
{ Args: { "p_key": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"record_event_view":
{ Args: { "p_event": string }; Returns: undefined
                           },
"record_provider_settlement":
{ Args: { "p_amount_minor": number,"p_note"?: string,"p_reference": string }; Returns: undefined
                           },
"referral_program_set_status":
{ Args: { "p_program": string,"p_reason"?: string,"p_status": string }; Returns: undefined
                           },
"referral_program_upsert":
{ Args: { "p_eligible_ticket_type_ids": (string)[],"p_ends_at"?: string,"p_enrollment_mode"?: string,"p_event": string,"p_maturity_days"?: number,"p_rate_bps": number,"p_starts_at"?: string,"p_terms": string,"p_window_days": number }; Returns: string
                           },
"referral_resolve":
{ Args: { "p_code": string,"p_session_hash"?: string }; Returns: Json
                           },
"refund_mark_result":
{ Args: { "p_failure"?: string,"p_provider_refund_id"?: string,"p_refund": string,"p_status": string }; Returns: undefined
                           },
"refund_request_create":
{ Args: { "p_include_used"?: boolean,"p_items": Json,"p_order": string,"p_reason": string }; Returns: string
                           },
"refund_retry":
{ Args: { "p_refund": string }; Returns: undefined
                           },
"refund_review":
{ Args: { "p_approve": boolean,"p_note": string,"p_refund": string }; Returns: undefined
                           },
"release_matured_earnings":
{ Args: { "p_limit"?: number }; Returns: number
                           },
"remove_member":
{ Args: { "p_org": string,"p_user": string }; Returns: undefined
                           },
"revoke_invitation":
{ Args: { "p_invitation": string }; Returns: undefined
                           },
"run_maintenance":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"run_reconciliation":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"test_provider_get":
{ Args: { "p_reference": string }; Returns: Json
                           },
"test_provider_refund":
{ Args: { "p_amount": number,"p_reference": string }; Returns: Json
                           },
"test_provider_upsert":
{ Args: { "p_amount": number,"p_currency": string,"p_email": string,"p_reference": string,"p_status": string }; Returns: Json
                           },
"ticket_reissue":
{ Args: { "p_reason": string,"p_ticket": string }; Returns: {
              "admission_number": number,
"attendee_email": string | null,
"attendee_name": string | null,
"check_in_count": number,
"event_id": string,
"first_checked_in_at": string | null,
"id": string,
"issued_at": string,
"order_id": string,
"order_item_id": string,
"public_ref": string,
"qr_hash": string | null,
"status": Database["public"]['Enums']["ticket_status"],
"ticket_type_id": string,
"token_version": number,
"unit_number": number,
"void_reason": string | null,
"voided_at": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "tickets"
        isOneToOne: true
        isSetofReturn: false
      } },
"tickets_set_qr_hashes":
{ Args: { "p_items": Json }; Returns: number
                           },
"unassign_event_staff":
{ Args: { "p_event": string,"p_user": string }; Returns: undefined
                           }
          }
          Enums: {
            "event_format": "in_person"|"online"|"hybrid","event_status": "draft"|"pending_review"|"published"|"paused"|"cancelled"|"completed"|"archived","event_visibility": "public"|"unlisted"|"private","moderation_status": "not_submitted"|"pending"|"approved"|"changes_requested"|"rejected","order_status": "pending_payment"|"expired"|"paid"|"fulfillment_exception"|"cancelled"|"partially_refunded"|"refunded","org_approval_status": "pending"|"approved"|"rejected","org_payout_status": "not_ready"|"pending_review"|"eligible"|"suspended","org_role": "owner"|"manager"|"finance"|"scanner","org_status": "active"|"suspended","org_verification_status": "unverified"|"verified","payment_method": "paystack"|"free"|"cash"|"pos_external"|"complimentary","payout_status": "pending"|"approved"|"processing"|"paid"|"failed"|"reversed"|"rejected"|"cancelled","platform_role": "super_admin"|"support"|"finance_admin","ticket_kind": "general"|"early_bird"|"regular"|"vip"|"vvip"|"student"|"group"|"free"|"complimentary","ticket_status": "valid"|"void"|"refunded","ticket_visibility": "public"|"hidden"|"access_code"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "event_format": ["in_person", "online", "hybrid"],"event_status": ["draft", "pending_review", "published", "paused", "cancelled", "completed", "archived"],"event_visibility": ["public", "unlisted", "private"],"moderation_status": ["not_submitted", "pending", "approved", "changes_requested", "rejected"],"order_status": ["pending_payment", "expired", "paid", "fulfillment_exception", "cancelled", "partially_refunded", "refunded"],"org_approval_status": ["pending", "approved", "rejected"],"org_payout_status": ["not_ready", "pending_review", "eligible", "suspended"],"org_role": ["owner", "manager", "finance", "scanner"],"org_status": ["active", "suspended"],"org_verification_status": ["unverified", "verified"],"payment_method": ["paystack", "free", "cash", "pos_external", "complimentary"],"payout_status": ["pending", "approved", "processing", "paid", "failed", "reversed", "rejected", "cancelled"],"platform_role": ["super_admin", "support", "finance_admin"],"ticket_kind": ["general", "early_bird", "regular", "vip", "vvip", "student", "group", "free", "complimentary"],"ticket_status": ["valid", "void", "refunded"],"ticket_visibility": ["public", "hidden", "access_code"]
          }
        }
} as const
