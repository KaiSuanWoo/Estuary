import type { Database } from "./database.types";

/** Convenience row aliases so feature code reads cleanly. */
type Tables = Database["public"]["Tables"];

export type Account = Tables["accounts"]["Row"];
export type AccountInsert = Tables["accounts"]["Insert"];
export type AccountUpdate = Tables["accounts"]["Update"];

export type Category = Tables["categories"]["Row"];
export type CategoryInsert = Tables["categories"]["Insert"];
export type CategoryUpdate = Tables["categories"]["Update"];

export type Counterparty = Tables["counterparties"]["Row"];
export type CounterpartyInsert = Tables["counterparties"]["Insert"];

export type Tag = Tables["tags"]["Row"];
export type TagInsert = Tables["tags"]["Insert"];

export type Budget = Tables["budgets"]["Row"];
export type BudgetInsert = Tables["budgets"]["Insert"];
export type BudgetUpdate = Tables["budgets"]["Update"];

export type Transaction = Tables["transactions"]["Row"];
export type TransactionInsert = Tables["transactions"]["Insert"];
export type TransactionUpdate = Tables["transactions"]["Update"];

export type CategorizationRule = Tables["categorization_rules"]["Row"];
export type CategorizationRuleInsert = Tables["categorization_rules"]["Insert"];
export type CategorizationRuleUpdate = Tables["categorization_rules"]["Update"];
export type FxRate = Tables["fx_rates"]["Row"];
export type ImportBatch = Tables["import_batches"]["Row"];
export type Settings = Tables["settings"]["Row"];
export type SettingsUpdate = Tables["settings"]["Update"];

export type Profile = Tables["profiles"]["Row"];
export type ProfileUpdate = Tables["profiles"]["Update"];

export type {
  AccountType,
  SavingsType,
  CategoryKind,
  CounterpartyType,
  TransactionType,
  ReimbursementStatus,
} from "./database.types";
