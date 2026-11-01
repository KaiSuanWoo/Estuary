/**
 * Hand-written to match the migrations in supabase/migrations/.
 *
 * Deliberately *not* the generated file. `supabase gen types` widens every
 * CHECK-constrained column to `string`, so `TransactionType`, `BudgetPeriod`,
 * `Cadence` and the rest of the unions below — which the app relies on to make
 * a mistyped `type` a compile error rather than a runtime surprise — do not
 * survive a regeneration. Keep adding by hand, and diff against the generated
 * output when the schema changes:
 *
 *   supabase gen types typescript --project-id <ref> --schema public
 *
 * (or the Supabase MCP `generate_typescript_types` tool) — read it, then
 * reconcile, rather than overwriting this file with it.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// --- domain string unions (mirror the CHECK constraints) -------------------
export type AccountType =
  | "checking"
  | "savings"
  | "cash"
  | "trading"
  | "credit"
  | "investment";
export type SavingsType = "fixed" | "disposable" | "investment" | "custom";
export type CategoryKind = "expense" | "income";
export type BudgetDirection = "expense" | "saving";
export type BudgetPeriod = "weekly" | "monthly" | "yearly" | "custom";
export type BudgetType = "recurring" | "goal";
export type CounterpartyType = "person" | "family" | "merchant";
export type TransactionType = "expense" | "income" | "transfer" | "adjustment";
export type ReimbursementStatus = "none" | "pending" | "partial" | "settled";
/** Intervals `recurring_expenses` will report (migration 0031). */
export type Cadence =
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "quarterly"
  | "yearly";
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

/** One line of an external portfolio snapshot (e.g. a Zenith brokerage account). */
export interface InvestmentAccount {
  name: string;
  currency: string;
  value: number;
}

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
          external_source: string | null;
          external_key: string | null;
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
          external_source?: string | null;
          external_key?: string | null;
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
          external_source?: string | null;
          external_key?: string | null;
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
          is_fixed: boolean;
          parent_id: string | null;
          icon: string | null;
          color: string | null;
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
          is_fixed?: boolean;
          parent_id?: string | null;
          icon?: string | null;
          color?: string | null;
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
          is_fixed?: boolean;
          parent_id?: string | null;
          icon?: string | null;
          color?: string | null;
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
      account_currencies: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          currency: string;
          opening_balance: number;
          display_order: number;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id: string;
          currency: string;
          opening_balance?: number;
          display_order?: number;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          account_id?: string;
          currency?: string;
          opening_balance?: number;
          display_order?: number;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      budgets: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          amount: number;
          type: BudgetType;
          direction: BudgetDirection;
          period: BudgetPeriod;
          start_date: string | null;
          end_date: string | null;
          due_date: string | null;
          color: string | null;
          show_on_home: boolean;
          display_order: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          amount: number;
          type?: BudgetType;
          direction?: BudgetDirection;
          period?: BudgetPeriod;
          start_date?: string | null;
          end_date?: string | null;
          due_date?: string | null;
          color?: string | null;
          show_on_home?: boolean;
          display_order?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          amount?: number;
          type?: BudgetType;
          direction?: BudgetDirection;
          period?: BudgetPeriod;
          start_date?: string | null;
          end_date?: string | null;
          due_date?: string | null;
          color?: string | null;
          show_on_home?: boolean;
          display_order?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      budget_transaction_links: {
        Row: {
          budget_id: string;
          transaction_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          budget_id: string;
          transaction_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          budget_id?: string;
          transaction_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      budget_category_links: {
        Row: {
          budget_id: string;
          category_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          budget_id: string;
          category_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          budget_id?: string;
          category_id?: string;
          user_id?: string;
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
          destination_currency: string | null;
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
          destination_currency?: string | null;
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
          destination_currency?: string | null;
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
      investment_history: {
        Row: {
          user_id: string;
          source: string;
          date: string;
          total: number;
          base_currency: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          source?: string;
          date: string;
          total: number;
          base_currency: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          source?: string;
          date?: string;
          total?: number;
          base_currency?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      merchant_aliases: {
        Row: {
          user_id: string;
          raw: string;
          canonical: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          raw: string;
          canonical: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          raw?: string;
          canonical?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      reconciliations: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          date: string;
          stated_balance: number;
          currency: string;
          computed_balance: number;
          difference: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id: string;
          date: string;
          stated_balance: number;
          currency: string;
          computed_balance: number;
          difference: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          account_id?: string;
          date?: string;
          stated_balance?: number;
          currency?: string;
          computed_balance?: number;
          difference?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      investment_snapshots: {
        Row: {
          user_id: string;
          source: string;
          base_currency: string;
          total: number;
          as_of: string | null;
          accounts: InvestmentAccount[];
          updated_at: string;
        };
        Insert: {
          user_id: string;
          source?: string;
          base_currency: string;
          total?: number;
          as_of?: string | null;
          accounts?: InvestmentAccount[];
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          source?: string;
          base_currency?: string;
          total?: number;
          as_of?: string | null;
          accounts?: InvestmentAccount[];
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      /** Per-pocket balance computed in Postgres (migration 0024). */
      account_balances: {
        Row: {
          user_id: string;
          account_id: string;
          currency: string;
          balance: number;
        };
        Relationships: [];
      };
      /**
       * Every transaction with its gross and net-of-reimbursement value in the
       * user's base currency (migration 0027). The basis every cashflow and
       * category aggregate is grouped from.
       */
      transaction_net: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          account_id: string;
          category_id: string | null;
          type: TransactionType;
          currency: string;
          amount: number;
          merchant: string | null;
          excluded_from_cashflow: boolean;
          base_currency: string;
          gross_base: number | null;
          repaid_base: number;
          allocated_raw: number;
          net_base: number | null;
        };
        Relationships: [];
      };
      /** One row per (repayment, expense) allocation (migration 0027). */
      reimbursement_allocation: {
        Row: {
          user_id: string;
          expense_id: string;
          repayment_id: string;
          repayment_account_id: string;
          repayment_date: string;
          amount: number;
          amount_base: number | null;
        };
        Relationships: [];
      };
      /** Months the ledger has any entry in (migration 0028). */
      ledger_months: {
        Row: { user_id: string; month: string; entries: number };
        Relationships: [];
      };
      /** Per-month income and expense, gross and net (migration 0028). */
      monthly_cashflow: {
        Row: {
          user_id: string;
          month: string;
          income_gross: number;
          expense_gross: number;
          income_net: number;
          expense_net: number;
        };
        Relationships: [];
      };
      /** Per-category, per-month totals (migration 0028). */
      category_spend_by_month: {
        Row: {
          user_id: string;
          month: string;
          category_id: string | null;
          kind: CategoryKind;
          gross: number;
          net: number;
          entries: number;
        };
        Relationships: [];
      };
      /** Canonical merchant groups and what folds into them (migration 0030). */
      merchant_groups: {
        Row: {
          user_id: string;
          canonical: string;
          keys: string[];
          raws: string[];
          entries: number;
        };
        Relationships: [];
      };
      /** Balance immediately after each entry, per account (migration 0032). */
      account_running_balance: {
        Row: {
          transaction_id: string;
          user_id: string;
          account_id: string;
          date: string;
          balance_after: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      /** Net spend per budget in its current window (migration 0029). */
      budget_spend: {
        Args: { p_now?: string };
        Returns: {
          budget_id: string;
          window_from: string | null;
          window_to: string | null;
          spent: number;
        }[];
      };
      /** Spend per category within each budget (migration 0029). */
      budget_category_spend: {
        Args: { p_now?: string };
        Returns: { budget_id: string; category_id: string; spent: number }[];
      };
      /** Spend per closed monthly window per budget (migration 0029). */
      budget_cycles: {
        Args: { p_months?: number; p_now?: string };
        Returns: { budget_id: string; month: string; spent: number }[];
      };
      /** Cashflow per month over a range, optionally one account (0032). */
      cashflow_by_month: {
        Args: { p_from: string; p_to: string; p_account?: string | null };
        Returns: {
          month: string;
          income_gross: number;
          expense_gross: number;
          income_net: number;
          expense_net: number;
        }[];
      };
      /** Per-category totals over a range, optionally one account (0032). */
      category_spend: {
        Args: { p_from: string; p_to: string; p_account?: string | null };
        Returns: {
          category_id: string | null;
          kind: CategoryKind;
          gross: number;
          net: number;
        }[];
      };
      /** Detected subscriptions and regular bills (migration 0031). */
      recurring_expenses: {
        Args: { p_now?: string };
        Returns: {
          merchant: string;
          cadence: Cadence;
          typical_amount: number;
          monthly_equivalent: number;
          charge_count: number;
          last_date: string;
          next_due: string;
          maybe_stopped: boolean;
        }[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
