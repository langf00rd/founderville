-- founderville: bring a database created from the earlier docs/schema.sql up
-- to date. Run once in the Supabase SQL editor. Safe to re-run.
--
--   * saves are written on every action now, so drop the 2-second throttle
--   * raise the save size cap from 256KB to 1MB (uncompressed saves are ~210KB)

drop trigger if exists saves_throttle on public.saves;
drop function if exists public.saves_throttle();

alter table public.saves drop constraint if exists saves_state_check;
alter table public.saves add constraint saves_state_check check (octet_length(state) <= 1048576);
