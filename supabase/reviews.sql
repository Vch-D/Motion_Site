-- =========================================================================
-- Motion Site · Project Manager · Reviews
-- Creators send tests, previews and final renders; the owner watches them, leaves notes on frames,
-- approves or asks for changes.
-- Run ONCE in Supabase: Dashboard → SQL Editor → New query → paste this whole file → Run.
-- Safe to re-run. (supabase/schema.sql contains the same block for fresh setups.)
-- =========================================================================

-- one row per version sent for review
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version int not null,
  kind text not null default 'preview' check (kind in ('test', 'preview', 'final')),
  note text not null default '',
  name text not null default '',   -- uploaded file (empty when only a link was sent)
  size bigint not null default 0,
  type text not null default '',
  path text,                       -- object in the project-files bucket: <project id>/deliveries/...
  poster text,                     -- a poster frame (jpg) for the lists
  link text,                       -- a link to a big / full-quality file (Drive, Dropbox, WeTransfer, Vimeo...)
  width int,
  height int,
  duration real,
  status text not null default 'pending' check (status in ('pending', 'changes', 'approved')),
  feedback text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  notified_at timestamptz,         -- when the owner was emailed about it (api/notify.js)
  unique (project_id, version)
);

-- chat entries can belong to a version: a note at a moment of the video, or sent / approved / changes
alter table public.messages add column if not exists delivery_id uuid references public.deliveries(id) on delete cascade;
alter table public.messages add column if not exists at_time real;
alter table public.messages add column if not exists event text;

grant select, insert, update, delete on public.deliveries to authenticated, service_role;
alter table public.deliveries enable row level security;
drop policy if exists "deliveries read"         on public.deliveries;
drop policy if exists "deliveries insert"       on public.deliveries;
drop policy if exists "deliveries owner update" on public.deliveries;
drop policy if exists "deliveries owner delete" on public.deliveries;
-- everyone on the project sees its versions; a new one is always "waiting for review";
-- only the owner decides (approve / changes) and deletes
create policy "deliveries read"         on public.deliveries for select to authenticated using (public.can_see_project(project_id));
create policy "deliveries insert"       on public.deliveries for insert to authenticated with check (public.can_see_project(project_id) and created_by = auth.uid() and status = 'pending' and reviewed_by is null);
create policy "deliveries owner update" on public.deliveries for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "deliveries owner delete" on public.deliveries for delete to authenticated using (public.is_owner());

-- live updates
do $$
begin
  alter publication supabase_realtime add table public.deliveries;
exception when duplicate_object then null; end $$;

-- The files themselves go to the existing private bucket 'project-files' under the project's folder,
-- so the storage rules from schema.sql already apply (only the owner and the project's creator can read them).

-- How much the bucket holds right now (run on its own whenever you like):
--   select bucket_id, count(*) as files, round(sum((metadata->>'size')::bigint) / 1048576.0, 1) as mb
--   from storage.objects group by bucket_id;
