-- One cloud save per user: the same SaveData JSON as localStorage. Run once in the Supabase SQL editor.

create table public.user_saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  save_data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint user_saves_size_check check (octet_length(save_data::text) <= 262144) -- 256 KB
);

alter table public.user_saves enable row level security;

-- Works even when the project's default privileges were changed.
grant select, insert, update, delete on public.user_saves to authenticated;

-- (select auth.uid()) is evaluated once per statement, not once per row.
create policy "user_saves_select_own" on public.user_saves
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_saves_insert_own" on public.user_saves
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_saves_update_own" on public.user_saves
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_saves_delete_own" on public.user_saves
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Lets a signed-in player delete their own account (the save row goes with it, by cascade).
-- No service_role key is needed anywhere in the client.
create function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
