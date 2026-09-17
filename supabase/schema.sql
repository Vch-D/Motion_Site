-- =========================================================================
-- Motion Site · Project Manager · database schema
-- Run ONCE in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (idempotent).
-- =========================================================================
create extension if not exists pgcrypto;

-- people: one row per auth user
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text not null default '',
  title text default '',
  role text not null default 'creator' check (role in ('owner', 'creator')),
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client text default '',
  type text default 'Video',
  priority text default 'Normal',
  due date,
  assignee uuid references public.profiles(id) on delete set null,
  status text not null default 'brief',
  progress int not null default 0,
  brief text default '',
  step_dates jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  size bigint default 0,
  type text default '',
  path text,          -- object path in the project-files bucket
  url text,           -- or a public url (static assets)
  received boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  from_id uuid references public.profiles(id) on delete set null,
  text text default '',
  file jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.project_reads (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- ---------- helpers (security definer: policies can look up roles without recursion) ----------
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner');
$$;

create or replace function public.can_see_project(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner()
      or exists (select 1 from public.projects where id = pid and assignee = auth.uid());
$$;

-- profile for every new auth user; the very first account becomes the owner
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, title, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.raw_user_meta_data->>'title', ''),
    case when not exists (select 1 from public.profiles) then 'owner'
         else coalesce(new.raw_user_meta_data->>'role', 'creator') end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- same thing on demand (covers accounts created before this script ran)
create or replace function public.ensure_profile() returns void
language plpgsql security definer set search_path = public as $$
declare u record;
begin
  if auth.uid() is null or exists (select 1 from public.profiles where id = auth.uid()) then return; end if;
  select * into u from auth.users where id = auth.uid();
  insert into public.profiles (id, email, name, title, role)
  values (
    u.id, u.email,
    coalesce(u.raw_user_meta_data->>'name', split_part(coalesce(u.email, ''), '@', 1)),
    coalesce(u.raw_user_meta_data->>'title', ''),
    case when not exists (select 1 from public.profiles) then 'owner'
         else coalesce(u.raw_user_meta_data->>'role', 'creator') end
  )
  on conflict (id) do nothing;
end;
$$;
grant execute on function public.ensure_profile() to authenticated;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- ---------- row level security ----------
alter table public.profiles      enable row level security;
alter table public.projects      enable row level security;
alter table public.project_files enable row level security;
alter table public.messages      enable row level security;
alter table public.project_reads enable row level security;

drop policy if exists "profiles read"        on public.profiles;
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles read"        on public.profiles for select to authenticated using (true);
create policy "profiles self update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "projects read"         on public.projects;
drop policy if exists "projects owner insert" on public.projects;
drop policy if exists "projects update"       on public.projects;
drop policy if exists "projects owner delete" on public.projects;
create policy "projects read"         on public.projects for select to authenticated using (public.can_see_project(id));
create policy "projects owner insert" on public.projects for insert to authenticated with check (public.is_owner());
create policy "projects update"       on public.projects for update to authenticated using (public.can_see_project(id)) with check (public.can_see_project(id));
create policy "projects owner delete" on public.projects for delete to authenticated using (public.is_owner());

drop policy if exists "files read"         on public.project_files;
drop policy if exists "files insert"       on public.project_files;
drop policy if exists "files update"       on public.project_files;
drop policy if exists "files owner delete" on public.project_files;
create policy "files read"         on public.project_files for select to authenticated using (public.can_see_project(project_id));
create policy "files insert"       on public.project_files for insert to authenticated with check (public.can_see_project(project_id));
create policy "files update"       on public.project_files for update to authenticated using (public.can_see_project(project_id));
create policy "files owner delete" on public.project_files for delete to authenticated using (public.is_owner());

drop policy if exists "messages read"   on public.messages;
drop policy if exists "messages insert" on public.messages;
create policy "messages read"   on public.messages for select to authenticated using (public.can_see_project(project_id));
create policy "messages insert" on public.messages for insert to authenticated with check (public.can_see_project(project_id) and from_id = auth.uid());

drop policy if exists "reads own" on public.project_reads;
create policy "reads own" on public.project_reads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- private storage bucket: project files and chat attachments ----------
insert into storage.buckets (id, name, public) values ('project-files', 'project-files', false)
  on conflict (id) do nothing;
drop policy if exists "pf read"         on storage.objects;
drop policy if exists "pf insert"       on storage.objects;
drop policy if exists "pf owner delete" on storage.objects;
create policy "pf read"         on storage.objects for select to authenticated using (bucket_id = 'project-files' and public.can_see_project(((storage.foldername(name))[1])::uuid));
create policy "pf insert"       on storage.objects for insert to authenticated with check (bucket_id = 'project-files' and public.can_see_project(((storage.foldername(name))[1])::uuid));
create policy "pf owner delete" on storage.objects for delete to authenticated using (bucket_id = 'project-files' and public.is_owner());

-- ---------- live updates (chat, progress, files) ----------
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.projects;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.project_files;
exception when duplicate_object then null; end $$;
