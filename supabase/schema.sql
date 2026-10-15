-- 스터디피크 수학 랩 — 클라우드 동기화 스키마
-- 사용법: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → [Run]
-- 각 사용자(user_id)는 자기 행만 읽고 쓸 수 있다 (RLS).

create table if not exists public.problems (
  user_id    uuid    not null default auth.uid(),
  id         text    not null,
  data       jsonb   not null default '{}'::jsonb,
  updated_at bigint  not null default 0,
  deleted    boolean not null default false,
  primary key (user_id, id)
);

create table if not exists public.worksheets (
  user_id    uuid    not null default auth.uid(),
  id         text    not null,
  data       jsonb   not null default '{}'::jsonb,
  updated_at bigint  not null default 0,
  deleted    boolean not null default false,
  primary key (user_id, id)
);

alter table public.problems   enable row level security;
alter table public.worksheets enable row level security;

drop policy if exists "own rows" on public.problems;
create policy "own rows" on public.problems
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.worksheets;
create policy "own rows" on public.worksheets
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists problems_updated_idx   on public.problems   (user_id, updated_at);
create index if not exists worksheets_updated_idx on public.worksheets (user_id, updated_at);
