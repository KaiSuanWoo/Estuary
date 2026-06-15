/**
 * Hand-written to match supabase/migrations/0001_initial_schema.sql.
 *
 * Once you create a Supabase project and run the migration, regenerate this
 * file from the source of truth instead of editing it by hand:
 *
 *   supabase gen types typescript --project-id <ref> --schema public > src/lib/database.types.ts
 *
 * (or the Supabase MCP `generate_typescript_types` tool).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// --- domain string unions (mirror the CHECK constraints) -------------------
export type AccountType = "checking" | "savings" | "cash" | "investmentCash" | "credit";
export type SavingsType = "fixed" | "disposable" | "investment" | "custom";
export type CategoryKind = "expense" | "income";
export type CounterpartyType = "person" | "family" | "merchant";
export type TransactionType = "expense" | "income" | "transfer" | "adjustment";
export type ReimbursementStatus = "none" | "pending" | "partial" | "settled";
export type ImportBatchStatus = "committed" | "reverted";
export type RuleMatchField = "merchant" | "notes" | "amount" | "account";
export type RuleMatchOperator =
  | "contains"
  | "equals"
  | "startsWith"
  | "regex"
  | "amountRange";
export type FxRateSource = "api" | "manual";
export type ProfileStatus = "pending" | "approved" | "rejected";

export interface Database {
  public: {
    Tables: {
      settings: {
        Row: {
          user_id: string;
          base_currency: string;
          fx_api_enabled: boolean;
          pay_cycle: string;
          first_pay_date: string | null;
          onboarding_completed: boolean;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          base_currency?: string;
          fx_api_enabled?: boolean;
          pay_cycle?: string;
          first_pay_date?: string | null;
          onboarding_completed?: boolean;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          base_currency?: string;
          fx_api_enabled?: boolean;
          pay_cycle?: string;
          first_pay_date?: string | null;
          onboarding_completed?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          status: ProfileStatus;
          is_admin: boolean;
          created_at: string;
          approved_at: string | null;
          approved_by: string | null;
        };
        Insert: {
          id: string;
          email?: string | null;
          status?: ProfileStatus;
          is_admin?: boolean;
          created_at?: string;
          approved_at?: string | null;
          approved_by?: string | null;
        };
        Update: {
          id?: string;
          email?: string | null;
          status?: ProfileStatus;
          is_admin?: boolean;
          created_at?: string;
          approved_at?: string | null;
          approved_by?: string | null;
        };
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: AccountType;
          savings_type: SavingsType | null;
          currency: string;
          is_multi_currency: boolean;
          institution: string | null;
          opening_balance: number;
          target_amount: number | null;
          credit_limit: number | null;
          color: string | null;
          icon: string | null;
          display_order: number;
          is_archived: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          type: AccountType;
          savings_type?: SavingsType | null;
          currency: string;
          is_multi_currency?: boolean;
          institution?: string | null;
          opening_balance?: number;
          target_amount?: number | null;
          credit_limit?: number | null;
          color?: string | null;
          icon?: string | null;
          display_order?: number;
          is_archived?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          type?: AccountType;
          savings_type?: SavingsType | null;
          currency?: string;
          is_multi_currency?: boolean;
          institution?: string | null;
          opening_balance?: number;
          target_amount?: number | null;
          credit_limit?: number | null;
          color?: string | null;
          icon?: string | null;
          display_order?: number;
          is_archived?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          kind: CategoryKind;
          parent_id: string | null;
          icon: string | null;
          color: string | null;
          monthly_budget: number | null;
          display_order: number;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          kind: CategoryKind;
          parent_id?: string | null;
          icon?: string | null;
          color?: string | null;
          monthly_budget?: number | null;
          display_order?: number;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          kind?: CategoryKind;
          parent_id?: string | null;
          icon?: string | null;
          color?: string | null;
          monthly_budget?: number | null;
          display_order?: number;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      counterparties: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: CounterpartyType;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          type?: CounterpartyType;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          type?: CounterpartyType;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          color: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          color?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          color?: string | null;
        };
        Relationships: [];
      };
      budgets: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          amount: number;
          tag_id: string | null;
          start_date: string | null;
          end_date: string | null;
          color: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          amount: number;
          tag_id?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          color?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          amount?: number;
          tag_id?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          color?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      import_batches: {
        Row: {
          id: string;
          user_id: string;
          source: string | null;
          file_name: string | null;
          row_count: number;
          status: ImportBatchStatus;
          imported_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source?: string | null;
          file_name?: string | null;
          row_count?: number;
          status?: ImportBatchStatus;
          imported_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source?: string | null;
          file_name?: string | null;
          row_count?: number;
          status?: ImportBatchStatus;
          imported_at?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: TransactionType;
          date: string;
          account_id: string;
          amount: number;
          currency: string;
          category_id: string | null;
          merchant: string | null;
          counterparty_id: string | null;
          notes: string | null;
          is_reimbursable: boolean;
          reimbursement_status: ReimbursementStatus;
          linked_transaction_id: string | null;
          reimbursement_links: Json | null;
          flagged: boolean;
          excluded_from_cashflow: boolean;
          receipt_image_path: string | null;
          destination_account_id: string | null;
          destination_amount: number | null;
          fx_rate: number | null;
          external_id: string | null;
          import_batch_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: TransactionType;
          date: string;
          account_id: string;
          amount: number;
          currency: string;
          category_id?: string | null;
          merchant?: string | null;
          counterparty_id?: string | null;
          notes?: string | null;
          is_reimbursable?: boolean;
          reimbursement_status?: ReimbursementStatus;
          linked_transaction_id?: string | null;
          reimbursement_links?: Json | null;
          flagged?: boolean;
          excluded_from_cashflow?: boolean;
          receipt_image_path?: string | null;
          destination_account_id?: string | null;
          destination_amount?: number | null;
          fx_rate?: number | null;
          external_id?: string | null;
          import_batch_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: TransactionType;
          date?: string;
          account_id?: string;
          amount?: number;
          currency?: string;
          category_id?: string | null;
          merchant?: string | null;
          counterparty_id?: string | null;
          notes?: string | null;
          is_reimbursable?: boolean;
          reimbursement_status?: ReimbursementStatus;
          linked_transaction_id?: string | null;
          reimbursement_links?: Json | null;
          flagged?: boolean;
          excluded_from_cashflow?: boolean;
          receipt_image_path?: string | null;
          destination_account_id?: string | null;
          destination_amount?: number | null;
          fx_rate?: number | null;
          external_id?: string | null;
          import_batch_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      transaction_tags: {
        Row: {
          transaction_id: string;
          tag_id: string;
        };
        Insert: {
          transaction_id: string;
          tag_id: string;
        };
        Update: {
          transaction_id?: string;
          tag_id?: string;
        };
        Relationships: [];
      };
      categorization_rules: {
        Row: {
          id: string;
          user_id: string;
          priority: number;
          is_enabled: boolean;
          match_field: RuleMatchField;
          match_operator: RuleMatchOperator;
          match_value: string;
          set_category_id: string | null;
          set_reimbursable: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          priority?: number;
          is_enabled?: boolean;
          match_field: RuleMatchField;
          match_operator: RuleMatchOperator;
          match_value: string;
          set_category_id?: string | null;
          set_reimbursable?: boolean | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          priority?: number;
          is_enabled?: boolean;
          match_field?: RuleMatchField;
          match_operator?: RuleMatchOperator;
          match_value?: string;
          set_category_id?: string | null;
          set_reimbursable?: boolean | null;
          created_at?: string;
        };
        Relationships: [];
      };
      fx_rates: {
        Row: {
          id: string;
          user_id: string;
          base: string;
          quote: string;
          date: string;
          rate: number;
          source: FxRateSource;
        };
        Insert: {
          id?: string;
          user_id: string;
          base: string;
          quote: string;
          date: string;
          rate: number;
          source?: FxRateSource;
        };
        Update: {
          id?: string;
          user_id?: string;
          base?: string;
          quote?: string;
          date?: string;
          rate?: number;
          source?: FxRateSource;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
