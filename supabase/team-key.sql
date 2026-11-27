-- 스터디피크 수학 랩 — 학원 팀 키 (직원 계정의 AI 비용을 학원 API 키로)
--
-- 무엇을 하나: 대표가 API 키를 이 표에 한 번 넣어 두면, 팀원 목록에 이메일이 있는 선생님은
--   수학 랩에 로그인만 해도 그 키로 AI 가 동작한다(각자 키를 넣을 필요 없음, 비용은 학원 계정).
-- 누가 읽을 수 있나: 팀원 목록(team_members)에 있고 이메일 확인이 끝난 로그인 계정만 키를 읽는다(RLS).
--   목록에 없는 계정·로그인하지 않은 방문자는 한 줄도 읽지 못한다.
--   표를 고치는 것(키 바꾸기·팀원 넣고 빼기)은 Supabase 대시보드에서만 된다 — 사이트에서는 아무도 못 고친다.
-- 주의: 키는 팀원의 브라우저로 내려가므로, 팀원 본인은 마음먹으면 키를 볼 수 있다. 믿는 직원에게만 쓰고,
--   콘솔(console.anthropic.com)에서 이 용도의 키를 따로 만들어 월 한도를 걸어 두는 것을 권한다.
--
-- 사용법: Supabase 대시보드 → SQL Editor → 아래 ①을 그대로 붙여넣고 [Run] (처음 한 번)
--         그다음 ②·③의 따옴표 안만 바꿔서 [Run]. 키는 채팅·메일에 적지 말고 여기에만 넣는다.

-- ① 표와 읽기 규칙 (그대로 실행)
create table if not exists public.team_members (
  email    text primary key,
  added_at timestamptz not null default now()
);
create table if not exists public.team_config (
  id           text primary key default 'main',
  api_key      text not null default '',
  workspace_id text not null default '',
  updated_at   timestamptz not null default now()
);
alter table public.team_members enable row level security;
alter table public.team_config  enable row level security;

-- 지금 로그인한 계정이 팀원인가: 이메일 확인이 끝난 계정이고, 그 이메일이 목록에 있을 때만 참
create or replace function public.is_team_member()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users u
    join public.team_members m on lower(m.email) = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.is_team_member() from public;
revoke execute on function public.is_team_member() from anon;   -- Supabase 가 새 함수에 기본으로 주는 권한도 거둔다(로그인한 계정만 부른다)
grant execute on function public.is_team_member() to authenticated;

drop policy if exists "team members read key" on public.team_config;
create policy "team members read key" on public.team_config
  for select to authenticated using (public.is_team_member());
-- team_members 에는 읽기 규칙을 만들지 않는다 → 사이트에서는 목록을 볼 수 없다(대시보드에서만).
-- 쓰기 규칙도 없다 → 사이트에서는 키·목록을 아무도 바꿀 수 없다.

-- ② 학원 API 키 넣기·바꾸기 ('sk-ant-…' 자리에 실제 키)
-- insert into public.team_config (id, api_key) values ('main', 'sk-ant-여기에-키')
--   on conflict (id) do update set api_key = excluded.api_key, updated_at = now();

-- ③ 팀원 넣기 (수학 랩에 로그인하는 이메일, 여러 명이면 쉼표로 이어서)
-- insert into public.team_members (email) values ('teacher1@example.com'), ('teacher2@example.com')
--   on conflict (email) do nothing;

-- 팀원 빼기
-- delete from public.team_members where email = 'teacher1@example.com';
-- 팀 키 끄기(모두 각자 키로 돌아감)
-- delete from public.team_config where id = 'main';
