-- founderville: Supabase schema.
-- Run in the Supabase SQL editor. Safe to re-run: drops and recreates.
--
-- Security model:
--   profiles - one row per signed-in account, filled from the GitHub/Google
--           profile by a trigger on auth.users. Public read (the leaderboard
--           shows it), no client writes.
--   runs  - public read (it's a public leaderboard). No insert, update or
--           delete rights for players: scores only go in through submit_run,
--           which takes the user id from auth.uid() and rate-limits each
--           account to one run per 10 seconds and 30 per day.
--   saves - one row per account, readable and writable only by its owner,
--           capped at 256KB and at one write every 2 seconds.

drop trigger if exists on_auth_user_saved on auth.users;
drop function if exists public.sync_profile();
drop table if exists public.saves;
drop function if exists public.saves_throttle();
drop table if exists public.runs;
drop function if exists public.submit_run(text, text, text, text, integer, bigint, integer, integer, text, bigint, text, text);
drop table if exists public.profiles;

-- ---------------------------------------------------------------- profiles

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text,
  full_name   text,
  avatar_url  text,
  email       text,
  provider    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- email stays private: the column grant below leaves it out
create policy profiles_read on public.profiles
  for select to anon, authenticated using (true);
revoke all on public.profiles from anon, authenticated;
grant select (id, username, full_name, avatar_url, created_at) on public.profiles to anon, authenticated;

-- Runs on sign-up and on every sign-in (Supabase rewrites the metadata then),
-- so a changed GitHub name or avatar flows through.
create or replace function public.sync_profile() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, username, full_name, avatar_url, email, provider)
  values (
    new.id,
    left(coalesce(m->>'user_name', m->>'preferred_username'), 40),
    left(coalesce(m->>'full_name', m->>'name'), 80),
    left(m->>'avatar_url', 500),
    new.email,
    new.raw_app_meta_data->>'provider'
  )
  on conflict (id) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    avatar_url = excluded.avatar_url,
    email      = excluded.email,
    provider   = excluded.provider,
    updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_saved
  after insert or update of raw_user_meta_data, email on auth.users
  for each row execute function public.sync_profile();

-- accounts that signed up before this table existed
insert into public.profiles (id) select id from auth.users on conflict do nothing;
update auth.users set raw_user_meta_data = raw_user_meta_data where id in (select id from public.profiles where username is null and full_name is null);

-- ---------------------------------------------------------------- leaderboard

create table public.runs (
  id           text primary key                   -- client run id, g_<seed>_<ts>
               check (id ~ '^g_[0-9a-z]{1,16}_[0-9a-z]{1,16}$'),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  founder      text not null check (char_length(founder) between 1 and 40),
  product_id   text not null check (char_length(product_id) <= 40 and product_id ~ '^[a-z0-9_-]+$'),
  product_name text not null check (char_length(product_name) <= 80),
  days         integer not null check (days between 1 and 120),
  real_ms      bigint  not null check (real_ms between 0 and 86400000),
  actions      integer not null default 0 check (actions >= 0 and actions <= 20000),
  ad_spend     integer not null default 0 check (ad_spend >= 0 and ad_spend <= 10000000),
  badge        text not null check (badge in ('gold', 'silver', 'bronze', 'iron')),
  seed         bigint not null check (seed >= 0),
  customer_seg text check (char_length(customer_seg) <= 40),
  channel      text check (char_length(channel) <= 40),
  verified     boolean not null default false,
  finished_at  timestamptz not null default now()   -- server clock: ties can't be backdated
);

create index runs_rank_idx on public.runs (days asc, real_ms asc, finished_at asc);
create index runs_product_rank_idx on public.runs (product_id, days asc, real_ms asc, finished_at asc);
create index runs_user_time_idx on public.runs (user_id, finished_at desc);

alter table public.runs enable row level security;

create policy runs_read on public.runs
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.runs from anon, authenticated;

-- ---------------------------------------------------------------- save games

-- state is a gzip+base64 blob ("gz:..."), ~23KB, or plain JSON ("js:...").
create table public.saves (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  state      text not null check (octet_length(state) <= 262144),
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;

create policy saves_own on public.saves
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- For players, the server sets updated_at and a row cannot be rewritten more
-- than once every 2 seconds. Dashboard and service-role edits are untouched. The client flushes every 30s and swallows a rejected
-- write, retrying on the next save.
create or replace function public.saves_throttle() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'UPDATE' and old.updated_at > now() - interval '2 seconds' then
      raise exception 'saving too often' using errcode = '54000';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger saves_throttle before insert or update on public.saves
  for each row execute function public.saves_throttle();

-- ---------------------------------------------------------------- submit score

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
-- definer, because players no longer have insert rights on runs. The user id
-- always comes from auth.uid(), never from the arguments.
security definer
set search_path = ''
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

  -- one submitter per account at a time, so parallel calls cannot slip past
  -- the limits below
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  if not exists (select 1 from public.runs r where r.id = p_run_id) then
    if exists (select 1 from public.runs r
               where r.user_id = v_uid and r.finished_at > now() - interval '10 seconds') then
      raise exception 'slow down: one score every 10 seconds' using errcode = '54000';
    end if;
    if (select count(*) from public.runs r
        where r.user_id = v_uid and r.finished_at > now() - interval '1 day') >= 30 then
      raise exception 'daily score limit reached' using errcode = '54000';
    end if;
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

revoke all on function public.submit_run(text, text, text, text, integer, bigint, integer, integer, text, bigint, text, text) from public, anon;
grant execute on function public.submit_run(text, text, text, text, integer, bigint, integer, integer, text, bigint, text, text) to authenticated;

-- Leaderboard read, if you ever want it behind a view:
--   select id, founder, product_name, days, real_ms, badge, finished_at
--   from public.runs order by days, real_ms, finished_at limit 50;
--
-- Known gap: real_ms and days are still client-supplied, so a determined
-- player can post a fake score. js/engine.js is deterministic from the seed,
-- so the real fix is to POST the action log and replay it server-side, then
-- write to runs.verified. See README.