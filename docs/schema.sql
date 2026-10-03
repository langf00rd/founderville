-- founderville: Supabase schema.
-- Run in the Supabase SQL editor. Safe to re-run: drops and recreates.
--
-- Security model:
--   runs  - public read (it's a public leaderboard), insert only as yourself,
--           and NO update/delete policies, so scores are append-only and a
--           signed-in player cannot edit or delete anyone's row.
--   saves - one row per account, readable and writable only by its owner.

drop table if exists public.saves;
drop table if exists public.runs;
drop function if exists public.submit_run(text, text, text, text, integer, bigint, integer, integer, text, bigint, text, text);

-- ---------------------------------------------------------------- leaderboard

create table public.runs (
  id           text primary key,                  -- client run id, g_<seed>_<ts>
  user_id      uuid not null references auth.users(id) on delete cascade,
  founder      text not null check (char_length(founder) between 1 and 40),
  product_id   text not null,
  product_name text not null,
  days         integer not null check (days between 1 and 120),
  real_ms      bigint  not null check (real_ms between 0 and 86400000),
  actions      integer not null default 0 check (actions >= 0 and actions <= 20000),
  ad_spend     integer not null default 0 check (ad_spend >= 0 and ad_spend <= 10000000),
  badge        text not null check (badge in ('gold', 'silver', 'bronze', 'iron')),
  seed         bigint not null check (seed >= 0),
  customer_seg text,
  channel      text,
  verified     boolean not null default false,
  finished_at  timestamptz not null default now()   -- server clock: ties can't be backdated
);

create index runs_rank_idx on public.runs (days asc, real_ms asc, finished_at asc);
create index runs_product_rank_idx on public.runs (product_id, days asc, real_ms asc, finished_at asc);
create index runs_user_idx on public.runs (user_id);

alter table public.runs enable row level security;

create policy runs_read on public.runs
  for select to anon, authenticated using (true);

create policy runs_insert_own on public.runs
  for insert to authenticated with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- save games

-- state is a gzip+base64 blob ("gz:..."), ~23KB, or plain JSON ("js:...").
create table public.saves (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      text not null,
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;

create policy saves_own on public.saves
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- submit score

-- security invoker, so the insert policy above is what actually authorises the
-- write: this function cannot be used to post a score under someone else's id.
create or replace function public.submit_run(
  p_run_id       text,
  p_founder      text,
  p_product_id   text,
  p_product_name text,
  p_days         integer,
  p_real_ms      bigint,
  p_actions      integer,
  p_ad_spend     integer,
  p_badge        text,
  p_seed         bigint,
  p_customer_seg text,
  p_channel      text
) returns table (rank integer, total bigint)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_owner    uuid;
  v_days     integer;
  v_real_ms  bigint;
  v_finished timestamptz;
  v_rank     integer;
  v_total    bigint;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  insert into public.runs (id, user_id, founder, product_id, product_name, days,
                           real_ms, actions, ad_spend, badge, seed, customer_seg, channel)
  values (p_run_id, v_uid, p_founder, p_product_id, p_product_name, p_days,
          p_real_ms, coalesce(p_actions, 0), coalesce(p_ad_spend, 0),
          p_badge, p_seed, p_customer_seg, p_channel)
  on conflict (id) do nothing;   -- idempotent: re-clicking "claim" is harmless

  select r.user_id, r.days, r.real_ms, r.finished_at
    into v_owner, v_days, v_real_ms, v_finished
    from public.runs r where r.id = p_run_id;

  if v_owner is null or v_owner is distinct from v_uid then
    raise exception 'run id already in use' using errcode = '42501';
  end if;

  select count(*) + 1 into v_rank
    from public.runs r
    where (r.days, r.real_ms, r.finished_at, r.id) < (v_days, v_real_ms, v_finished, p_run_id);

  select count(*) into v_total from public.runs;

  return query select v_rank, v_total;
end;
$$;

revoke all on function public.submit_run(text, text, text, text, integer, bigint, integer, integer, text, bigint, text, text) from anon;
grant execute on function public.submit_run(text, text, text, text, integer, bigint, integer, integer, text, bigint, text, text) to authenticated;

-- Leaderboard read, if you ever want it behind a view:
--   select id, founder, product_name, days, real_ms, badge, finished_at
--   from public.runs order by days, real_ms, finished_at limit 50;
--
-- Known gap: real_ms and days are still client-supplied, so a determined
-- player can post a fake score. js/engine.js is deterministic from the seed,
-- so the real fix is to POST the action log and replay it server-side, then
-- write to runs.verified. See README.