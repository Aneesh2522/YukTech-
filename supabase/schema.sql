-- YUKTECH Admin CMS — run in Supabase SQL Editor as project owner.
create extension if not exists pgcrypto;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','editor','reviewer')),
  created_at timestamptz not null default now()
);

create or replace function public.has_role(allowed_roles text[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = any(allowed_roles)
  );
$$;
revoke all on function public.has_role(text[]) from public;
grant execute on function public.has_role(text[]) to anon, authenticated;

create table if not exists public.cms_content (
  id uuid primary key default gen_random_uuid(),
  content_key text not null,
  content_value text not null default '',
  content_type text not null default 'text' check (content_type in ('text','image_url','url')),
  status text not null default 'draft' check (status in ('draft','in_review','published','rejected')),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null default 'Technology',
  location text not null,
  work_type text not null default 'Full-time',
  experience text not null default '',
  description text not null,
  apply_url text not null default '',
  external_board text not null default 'website' check (external_board in ('website','linkedin','indeed','naukri','other')),
  external_job_id text,
  supersedes_id uuid references public.job_posts(id),
  status not null default 'draft' check (status in ('draft','in_review','published','rejected','closed')),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;
alter table public.cms_content enable row level security;
alter table public.job_posts enable row level security;
alter table public.audit_log enable row level security;

-- Users can see their own role; only admins can manage role assignments.
drop policy if exists "read own role or admin" on public.user_roles;
create policy "read own role or admin" on public.user_roles for select to authenticated
using (user_id = auth.uid() or public.has_role(array['admin']));
drop policy if exists "admin manages roles" on public.user_roles;
create policy "admin manages roles" on public.user_roles for all to authenticated
using (public.has_role(array['admin'])) with check (public.has_role(array['admin']));

-- Public visitors see published website content only.
drop policy if exists "public reads published content" on public.cms_content;
create policy "public reads published content" on public.cms_content for select to anon, authenticated
using (status = 'published' or public.has_role(array['admin','editor','reviewer']));
drop policy if exists "editors create drafts" on public.cms_content;
create policy "editors create drafts" on public.cms_content for insert to authenticated
with check (public.has_role(array['admin','editor']) and status in ('draft','in_review') and created_by = auth.uid());
drop policy if exists "editors update own drafts" on public.cms_content;
create policy "editors update own drafts" on public.cms_content for update to authenticated
using (public.has_role(array['admin']) or (public.has_role(array['editor']) and status in ('draft','rejected')) or public.has_role(array['reviewer']))
with check (public.has_role(array['admin','reviewer']) or (public.has_role(array['editor']) and status in ('draft','in_review','rejected')));
drop policy if exists "admin deletes content" on public.cms_content;
create policy "admin deletes content" on public.cms_content for delete to authenticated using (public.has_role(array['admin']));

-- Public visitors see only live jobs. Editors draft/submit; reviewers/admins approve or close.
drop policy if exists "public reads published jobs" on public.job_posts;
create policy "public reads published jobs" on public.job_posts for select to anon, authenticated
using (status = 'published' or public.has_role(array['admin','editor','reviewer']));
drop policy if exists "editors create job drafts" on public.job_posts;
create policy "editors create job drafts" on public.job_posts for insert to authenticated
with check (public.has_role(array['admin','editor']) and status in ('draft','in_review') and created_by = auth.uid());
drop policy if exists "editors update job drafts" on public.job_posts;
create policy "editors update job drafts" on public.job_posts for update to authenticated
using (public.has_role(array['admin']) or (public.has_role(array['editor']) and status in ('draft','rejected')) or public.has_role(array['reviewer']))
with check (public.has_role(array['admin','reviewer']) or (public.has_role(array['editor']) and status in ('draft','in_review','rejected')));
drop policy if exists "admin deletes jobs" on public.job_posts;
create policy "admin deletes jobs" on public.job_posts for delete to authenticated using (public.has_role(array['admin']));

-- Only administrators/reviewers can read audit history; direct inserts are not exposed to the browser.
drop policy if exists "reviewers read audit" on public.audit_log;
create policy "reviewers read audit" on public.audit_log for select to authenticated using (public.has_role(array['admin','reviewer']));
drop policy if exists "members write own audit events" on public.audit_log;
create policy "members write own audit events" on public.audit_log for insert to authenticated
with check (actor_id = auth.uid() and public.has_role(array['admin','editor','reviewer']));

-- Storage bucket for public website images. Upload/update/delete are restricted to admin/editor roles.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media','site-media',true,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];
drop policy if exists "public reads site media" on storage.objects;
create policy "public reads site media" on storage.objects for select to anon, authenticated using (bucket_id = 'site-media');
drop policy if exists "editors upload site media" on storage.objects;
create policy "editors upload site media" on storage.objects for insert to authenticated
with check (bucket_id = 'site-media' and public.has_role(array['admin','editor']));
drop policy if exists "editors update site media" on storage.objects;
create policy "editors update site media" on storage.objects for update to authenticated
using (bucket_id = 'site-media' and public.has_role(array['admin','editor']))
with check (bucket_id = 'site-media' and public.has_role(array['admin','editor']));
drop policy if exists "admins delete site media" on storage.objects;
create policy "admins delete site media" on storage.objects for delete to authenticated
using (bucket_id = 'site-media' and public.has_role(array['admin']));

-- Helpful index for the public Careers page.
create index if not exists job_posts_live_idx on public.job_posts(status, published_at desc);
create index if not exists cms_content_key_status_idx on public.cms_content(content_key, status);
