-- ============================================================
-- May 2026 transactions — CommBank Smart Access xx7742
-- Parsed from TransactionSummary (1).pdf  (01/05/26–31/05/26)
--
-- HOW TO RUN:
--   1. Set up your Supabase project and run the main migration.
--   2. Sign in to the app once so your auth.users row exists.
--   3. Create at least one account (e.g. "CommBank Smart Access", AUD, checking).
--   4. Paste this file into the Supabase SQL editor and click Run.
-- ============================================================

DO $$
DECLARE
  v_user_id  uuid;
  v_acct_id  uuid;
  v_batch_id uuid;
BEGIN
  -- Locate the signed-in user
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'kaisuanwoo@gmail.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User kaisuanwoo@gmail.com not found — sign in to the app first.';
  END IF;

  -- Prefer a checking account; fall back to any account
  SELECT id INTO v_acct_id
  FROM public.accounts
  WHERE user_id = v_user_id AND type = 'checking'
  ORDER BY created_at
  LIMIT 1;

  IF v_acct_id IS NULL THEN
    SELECT id INTO v_acct_id
    FROM public.accounts
    WHERE user_id = v_user_id
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_acct_id IS NULL THEN
    RAISE EXCEPTION 'No account found — create one in the app first (e.g. CommBank Smart Access, AUD, checking).';
  END IF;

  -- Create a reversible import batch
  INSERT INTO public.import_batches (user_id, source, file_name, row_count)
  VALUES (v_user_id, 'seed', 'TransactionSummary_May2026.pdf', 103)
  RETURNING id INTO v_batch_id;

  -- ── Insert all 103 transactions ──────────────────────────────────────────
  INSERT INTO public.transactions
    (user_id, account_id, type, amount, currency, date, merchant, notes, import_batch_id)
  VALUES
    -- 1 May
    (v_user_id, v_acct_id, 'expense',  1.00,    'AUD', '2026-05-01', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  0.90,    'AUD', '2026-05-01', 'George Street News',        NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  253.50,  'AUD', '2026-05-01', 'Aunty on Wandoo St',        NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  0.77,    'AUD', '2026-05-01', 'Officeworks',               NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'income',   151.06,  'AUD', '2026-05-01', 'AGA Assistance',            'Direct Credit',       v_batch_id),
    -- 2 May
    (v_user_id, v_acct_id, 'expense',  1.00,    'AUD', '2026-05-02', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'income',   1000.00, 'AUD', '2026-05-02', 'Transfer from own account', 'Woo Kai Suan',        v_batch_id),
    -- 3 May
    (v_user_id, v_acct_id, 'expense',  750.00,  'AUD', '2026-05-03', 'Rent — Jude',               'CommBank App',        v_batch_id),
    -- 4 May
    (v_user_id, v_acct_id, 'income',   1387.16, 'AUD', '2026-05-04', 'Ichiban Sushi Pay',         'FOUNTAINSTAR 60 PTY', v_batch_id),
    -- 5 May
    (v_user_id, v_acct_id, 'expense',  1.00,    'AUD', '2026-05-05', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  12.00,   'AUD', '2026-05-05', 'Coles',                     NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  4.50,    'AUD', '2026-05-05', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  19.95,   'AUD', '2026-05-05', 'KFC',                       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  1.00,    'AUD', '2026-05-05', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  39.09,   'AUD', '2026-05-05', 'Zhang Liang City',          NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  156.19,  'AUD', '2026-05-05', 'The Standard Market',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  24.95,   'AUD', '2026-05-05', 'Anytime Fitness',           NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  67.85,   'AUD', '2026-05-05', 'Kitchen Warehouse',         NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  9.95,    'AUD', '2026-05-05', 'Kitchen Warehouse',         NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  6.00,    'AUD', '2026-05-05', 'Coles',                     NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'income',   15.00,   'AUD', '2026-05-05', 'Jude Tan',                  'wifi jude',           v_batch_id),
    -- 6 May
    (v_user_id, v_acct_id, 'expense',  4.15,    'AUD', '2026-05-06', 'BWS',                       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  84.00,   'AUD', '2026-05-06', 'Water — Jude',              'CommBank App',        v_batch_id),
    (v_user_id, v_acct_id, 'income',   15.00,   'AUD', '2026-05-06', 'Fabian Cahyadi',            'Wifi',                v_batch_id),
    -- 7 May
    (v_user_id, v_acct_id, 'expense',  1.00,    'AUD', '2026-05-07', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  44.99,   'AUD', '2026-05-07', 'TPG Internet',              NULL,                  v_batch_id),
    -- 8 May
    (v_user_id, v_acct_id, 'expense',  1.00,    'AUD', '2026-05-08', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  31.00,   'AUD', '2026-05-08', 'Event Cinemas Myer Centre', NULL,                  v_batch_id),
    -- 9 May
    (v_user_id, v_acct_id, 'expense',  1.00,    'AUD', '2026-05-09', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  34.00,   'AUD', '2026-05-09', 'Claude.ai',                 'Subscription',        v_batch_id),
    (v_user_id, v_acct_id, 'expense',  42.00,   'AUD', '2026-05-09', 'Hwiju Na',                  'Funny funny',         v_batch_id),
    -- 11 May
    (v_user_id, v_acct_id, 'expense',  33.26,   'AUD', '2026-05-11', 'Medibank Private',          'Health insurance',    v_batch_id),
    -- 12 May
    (v_user_id, v_acct_id, 'expense',  1.00,    'AUD', '2026-05-12', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  0.50,    'AUD', '2026-05-12', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  7.01,    'AUD', '2026-05-12', 'LS South Brisbane Mess',    NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  63.88,   'AUD', '2026-05-12', 'Haeduri Chicken',           NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  91.00,   'AUD', '2026-05-12', 'Aesop',                     NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  1.00,    'AUD', '2026-05-12', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  24.95,   'AUD', '2026-05-12', 'Anytime Fitness',           NULL,                  v_batch_id),
    -- 13 May
    (v_user_id, v_acct_id, 'expense',  1.00,    'AUD', '2026-05-13', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  6.99,    'AUD', '2026-05-13', 'Chemist Warehouse',         NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  35.58,   'AUD', '2026-05-13', 'Mebami',                    NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  2.45,    'AUD', '2026-05-13', 'Coles',                     NULL,                  v_batch_id),
    -- 14 May
    (v_user_id, v_acct_id, 'expense',  1.50,    'AUD', '2026-05-14', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  21.21,   'AUD', '2026-05-14', 'Mr. Tall Pork Noodles',     NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  8.25,    'AUD', '2026-05-14', 'McDonald''s',               NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  62.03,   'AUD', '2026-05-14', 'Woolworths',                NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  750.00,  'AUD', '2026-05-14', 'Rent — Jude',               'CommBank App',        v_batch_id),
    -- 15 May
    (v_user_id, v_acct_id, 'expense',  1.50,    'AUD', '2026-05-15', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  6.50,    'AUD', '2026-05-15', 'Woolworths',                NULL,                  v_batch_id),
    -- 16 May
    (v_user_id, v_acct_id, 'expense',  1.00,    'AUD', '2026-05-16', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  59.61,   'AUD', '2026-05-16', 'DooDee Boran',              NULL,                  v_batch_id),
    -- 17 May
    (v_user_id, v_acct_id, 'expense',  53.61,   'AUD', '2026-05-17', 'Didi',                      NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'income',   1078.41, 'AUD', '2026-05-17', 'Ichiban Sushi Pay',         'FOUNTAINSTAR 60 PTY', v_batch_id),
    (v_user_id, v_acct_id, 'income',   52.00,   'AUD', '2026-05-17', 'Zecheng Chen',              'Thx for eyt. U r always the best', v_batch_id),
    -- 19 May
    (v_user_id, v_acct_id, 'expense',  1.50,    'AUD', '2026-05-19', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  1.50,    'AUD', '2026-05-19', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  1.50,    'AUD', '2026-05-19', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  16.93,   'AUD', '2026-05-19', 'Coles',                     NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  19.70,   'AUD', '2026-05-19', 'Lune Croissanterie',        NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  50.50,   'AUD', '2026-05-19', 'LS Hai Hai West End',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  24.95,   'AUD', '2026-05-19', 'Anytime Fitness',           NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  18.20,   'AUD', '2026-05-19', 'Woolworths',                NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'income',   1567.38, 'AUD', '2026-05-19', 'Telstra',                   'Salary',              v_batch_id),
    -- 20 May
    (v_user_id, v_acct_id, 'expense',  23.30,   'AUD', '2026-05-20', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  41.00,   'AUD', '2026-05-20', 'Electric bill — Jude',      'CommBank App',        v_batch_id),
    -- 21 May
    (v_user_id, v_acct_id, 'expense',  0.50,    'AUD', '2026-05-21', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  3.00,    'AUD', '2026-05-21', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  4.49,    'AUD', '2026-05-21', 'Apple',                     'Monthly subscription', v_batch_id),
    (v_user_id, v_acct_id, 'expense',  21.21,   'AUD', '2026-05-21', 'Mr. Tall Pork Noodles',     NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  3.10,    'AUD', '2026-05-21', 'Coles',                     NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  33.65,   'AUD', '2026-05-21', 'Woolworths',                NULL,                  v_batch_id),
    -- 22 May
    (v_user_id, v_acct_id, 'expense',  1.00,    'AUD', '2026-05-22', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  21.21,   'AUD', '2026-05-22', 'Mr. Tall Pork Noodles',     NULL,                  v_batch_id),
    -- 23 May
    (v_user_id, v_acct_id, 'expense',  1.00,    'AUD', '2026-05-23', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  20.20,   'AUD', '2026-05-23', 'Mr. Tall Pork Noodles',     NULL,                  v_batch_id),
    -- 24 May
    (v_user_id, v_acct_id, 'expense',  1312.00, 'AUD', '2026-05-24', 'Jetstar Airways',           'Booking JRS14K',      v_batch_id),
    (v_user_id, v_acct_id, 'income',   80.00,   'AUD', '2026-05-24', 'Fabian Cahyadi',            NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  5.00,    'AUD', '2026-05-24', 'Fabian Cahyadi',            'Wrap',                v_batch_id),
    -- 25 May
    (v_user_id, v_acct_id, 'expense',  33.26,   'AUD', '2026-05-25', 'Medibank Private',          'Health insurance',    v_batch_id),
    -- 26 May
    (v_user_id, v_acct_id, 'expense',  1.00,    'AUD', '2026-05-26', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  129.90,  'AUD', '2026-05-26', 'Uniqlo',                    NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  1.50,    'AUD', '2026-05-26', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  59.56,   'AUD', '2026-05-26', 'Coles',                     NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  13.00,   'AUD', '2026-05-26', 'BWS',                       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  1.00,    'AUD', '2026-05-26', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  20.20,   'AUD', '2026-05-26', 'Mr. Tall Pork Noodles',     NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  24.95,   'AUD', '2026-05-26', 'Anytime Fitness',           NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  18.98,   'AUD', '2026-05-26', 'Udon Kompira',              NULL,                  v_batch_id),
    -- 27 May
    (v_user_id, v_acct_id, 'expense',  3.00,    'AUD', '2026-05-27', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  405.42,  'AUD', '2026-05-27', 'Traveloka',                 'Flight booking',      v_batch_id),
    (v_user_id, v_acct_id, 'expense',  7.00,    'AUD', '2026-05-27', 'Foster & Black',            NULL,                  v_batch_id),
    -- 28 May
    (v_user_id, v_acct_id, 'expense',  1.00,    'AUD', '2026-05-28', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  10.70,   'AUD', '2026-05-28', 'McDonald''s',               NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  44.45,   'AUD', '2026-05-28', 'Woolworths',                NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'income',   1000.00, 'AUD', '2026-05-28', 'Transfer from own account', 'Woo Kai Suan',        v_batch_id),
    (v_user_id, v_acct_id, 'expense',  750.00,  'AUD', '2026-05-28', 'Rent — Jude',               'CommBank App',        v_batch_id),
    (v_user_id, v_acct_id, 'expense',  111.31,  'AUD', '2026-05-28', 'GFP Events',                NULL,                  v_batch_id),
    -- 29 May
    (v_user_id, v_acct_id, 'expense',  1.50,    'AUD', '2026-05-29', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  2.45,    'AUD', '2026-05-29', 'Coles',                     NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  26.00,   'AUD', '2026-05-29', 'Coles',                     NULL,                  v_batch_id),
    -- 30 May
    (v_user_id, v_acct_id, 'expense',  2.00,    'AUD', '2026-05-30', 'Translink Ticketing',       NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  103.42,  'AUD', '2026-05-30', 'Haidilao',                  NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  22.50,   'AUD', '2026-05-30', 'TPG Internet',              NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  4.40,    'AUD', '2026-05-30', 'Cotti Coffee',              NULL,                  v_batch_id),
    (v_user_id, v_acct_id, 'expense',  328.00,  'AUD', '2026-05-30', 'Jetstar Airways',           'Booking EQCERQ',      v_batch_id),
    -- 31 May
    (v_user_id, v_acct_id, 'income',   300.00,  'AUD', '2026-05-31', 'Zecheng Chen',              'Talsey',              v_batch_id),
    (v_user_id, v_acct_id, 'income',   600.00,  'AUD', '2026-05-31', 'Transfer from own account', 'Woo Kai Suan',        v_batch_id);

  RAISE NOTICE 'Done — 103 transactions inserted (batch %).', v_batch_id;
END;
$$;
