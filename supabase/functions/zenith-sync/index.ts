// zenith-sync — receives portfolio snapshots pushed by the Zenith client and
// materialises them as Estuary data for the matching user.
//
// Auth (no shared secrets): the caller sends its *Zenith* session token; we
// verify it against Zenith's auth server and trust the verified email. The
// user must have a confirmed Estuary account under the same email
// (`user_id_by_email`, service-role-only RPC) — otherwise 404.
//
// Writes, per push:
//   * upsert `investment_snapshots` (user_id, source='zenith')
//   * upsert one `accounts` row per snapshot account
//     (type 'investment', keyed on external_source='zenith' + external_key=name)
//   * archive zenith-linked accounts that vanished from the snapshot
//
// Deployed with verify_jwt=false — the bearer token is Zenith's, not ours.

import { createClient } from "npm:@supabase/supabase-js@2";

// Zenith project location + anon key. The anon key is public by design (it
// ships in Zenith's client bundle); it only lets us ask Zenith's auth server
// "whose valid token is this?".
const ZENITH_URL = "https://wxkrtssbfudsxrqimriv.supabase.co";
const ZENITH_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4a3J0c3NiZnVkc3hycWltcml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MjYwNjUsImV4cCI6MjA5ODEwMjA2NX0.z--lG8brx1NK49MDNrsj0jhBQPHw35pWbC8snphlGLg";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

interface SnapshotAccount {
  name: string;
  currency: string;
  value: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  // 1. Who is calling? Ask Zenith's auth server to validate the token.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer "))
    return json(401, { error: "Missing bearer token" });

  const who = await fetch(`${ZENITH_URL}/auth/v1/user`, {
    headers: { apikey: ZENITH_ANON_KEY, Authorization: authHeader },
  });
  if (!who.ok) return json(401, { error: "Invalid Zenith session" });
  const zenithUser = (await who.json()) as { email?: string };
  if (!zenithUser.email) return json(401, { error: "Token has no email" });

  // 2. Map the verified email onto an Estuary user.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: userId, error: mapErr } = await admin.rpc("user_id_by_email", {
    p_email: zenithUser.email,
  });
  if (mapErr) return json(500, { error: mapErr.message });
  if (!userId) return json(404, { error: "No Estuary user with this email" });

  // 3. Validate the snapshot payload.
  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: "Body must be JSON" });
  }
  const base_currency =
    typeof payload.base_currency === "string"
      ? payload.base_currency.toUpperCase()
      : "";
  const total = Number(payload.total);
  if (!base_currency || !Number.isFinite(total))
    return json(400, { error: "Need base_currency and numeric total" });
  const as_of = typeof payload.as_of === "string" ? payload.as_of : new Date().toISOString();
  const accounts: SnapshotAccount[] = (Array.isArray(payload.accounts) ? payload.accounts : [])
    .map((a) => {
      const r = (a ?? {}) as Record<string, unknown>;
      return {
        name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : "Account",
        currency: typeof r.currency === "string" ? r.currency.toUpperCase() : base_currency,
        value: Number(r.value) || 0,
      };
    });

  // 4. Store the snapshot (per-account values live in its jsonb).
  const { error: snapErr } = await admin.from("investment_snapshots").upsert(
    {
      user_id: userId,
      source: "zenith",
      base_currency,
      total,
      as_of,
      accounts,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,source" },
  );
  if (snapErr) return json(500, { error: snapErr.message });

  // 5. Materialise investment accounts. Only sync-owned columns are written,
  //    so user customisations (color, icon, order, notes) survive re-pushes.
  if (accounts.length > 0) {
    const { error: accErr } = await admin.from("accounts").upsert(
      accounts.map((a) => ({
        user_id: userId,
        name: a.name,
        type: "investment",
        currency: a.currency,
        external_source: "zenith",
        external_key: a.name,
        is_archived: false,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,external_source,external_key" },
    );
    if (accErr) return json(500, { error: accErr.message });
  }

  // 6. Archive linked accounts that no longer exist in Zenith.
  const keys = accounts.map((a) => a.name);
  let archive = admin
    .from("accounts")
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("external_source", "zenith");
  if (keys.length > 0)
    archive = archive.not("external_key", "in", `(${keys.map((k) => `"${k.replaceAll('"', '\\"')}"`).join(",")})`);
  const { error: archErr } = await archive;
  if (archErr) return json(500, { error: archErr.message });

  return json(200, { ok: true, accounts: accounts.length });
});
