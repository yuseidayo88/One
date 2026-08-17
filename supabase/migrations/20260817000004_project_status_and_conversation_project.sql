-- ============================================================
-- 統括AIの配置を projectStatus から導出できるようにする
--
--  1. projects.status を 7 段階へ拡張
--  2. conversations.project_id を追加（中央→右パネルで同じ会話を引き継ぐ）
-- ============================================================

-- ── 1. プロジェクト状態 ──────────────────────────────
create type project_status as enum (
  'draft',
  'planning',
  'ready',
  'active',
  'paused',
  'completed',
  'cancelled'
);

-- 旧: text + check ('active','paused','archived')
alter table projects drop constraint if exists projects_status_check;

alter table projects
  alter column status drop default;

-- archived は completed へ寄せる（他はそのまま）
alter table projects
  alter column status type project_status
  using (
    case status
      when 'archived' then 'completed'
      when 'active' then 'active'
      when 'paused' then 'paused'
      else 'draft'
    end::project_status
  );

alter table projects
  alter column status set default 'draft'::project_status;

-- ── 2. 会話をプロジェクトへ紐づける ────────────────────
alter table conversations
  add column if not exists project_id uuid references projects(id) on delete cascade;

-- 統括AIの会話は、1 プロジェクトにつき 1 本
create unique index if not exists conversations_one_director_per_project
  on conversations (project_id)
  where kind = 'director' and project_id is not null;

create index if not exists conversations_project_idx
  on conversations (organization_id, project_id);

-- 既存の統括AI会話を、その組織の最初のプロジェクトへ割り当てる
update conversations c
set project_id = p.id
from (
  select distinct on (organization_id) organization_id, id
  from projects
  order by organization_id, created_at asc
) p
where c.project_id is null
  and c.kind = 'director'
  and c.organization_id = p.organization_id;
