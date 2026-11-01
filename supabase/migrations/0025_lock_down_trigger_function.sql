-- `ensure_primary_pocket` is a trigger function: it only makes sense when fired
-- by the accounts trigger, yet being in `public` made it callable as an RPC by
-- anyone, signed in or not. Triggers run in the table's context rather than the
-- caller's, so taking EXECUTE away from the API roles stops the direct call
-- without affecting the trigger.
revoke execute on function public.ensure_primary_pocket() from public, anon, authenticated;
