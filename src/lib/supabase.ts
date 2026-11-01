import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local",
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** PostgREST's row ceiling for a select that asks for no range. */
export const PAGE_SIZE = 1000;

/**
 * Read every row a query matches, a page at a time.
 *
 * An unbounded select silently stops at {@link PAGE_SIZE} rows — no error, no
 * flag, just a short array. Anything derived from a whole table (a balance, a
 * cashflow, a rule sweep) is then quietly wrong, and stays wrong in a way that
 * looks like bad data rather than a bad query. Use this wherever completeness
 * is what makes the answer correct.
 *
 * `page` is a builder, not a query: `.range()` can't be re-applied to one that
 * has already been awaited, so each page has to start a fresh select.
 */
export async function fetchAllPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}
