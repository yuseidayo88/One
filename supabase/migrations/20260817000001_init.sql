-- ============================================================
-- AI Company — 初期スキーマ
-- Postgres / Supabase
-- ============================================================

create extension if not exists "pgcrypto";

-- ── 列挙型 ────────────────────────────────────────────
create type role_key as enum (
  'director','market_research','marketing','sales','designer',
  'engineer','assistant','legal','finance'
);

create type employee_status as enum (
  'working','idle','awaiting_approval','awaiting_info','done','error','paused'
);

create type task_status as enum (
  'idea','todo','queued','running','awaiting_approval','revising','done','blocked'
);

create type task_priority as enum ('low','normal','high','urgent');

create type safety_level as enum ('GREEN','YELLOW','ORANGE','RED');

create type memory_scope as enum ('organization','business','project','employee','run');

create type approval_status as enum ('pending','approved','rejected','expired');

create type approval_action as enum (
  'email_send','social_post','ads_publish','publish_production','domain_purchase',
  'dns_update','payment','fund_transfer','production_db_change','data_deletion',
  'oauth_grant','contract_submission','high_cost_run','pii_external_send'
);

create type ledger_entry_type as enum ('grant','purchase','reserve','settle','release','adjust','expire');
create type ledger_bucket as enum ('monthly','purchased','system');
create type reservation_status as enum ('reserved','settled','released');

create type run_status as enum ('queued','running','succeeded','failed','cancelled');

create type task_event_type as enum (
  'created','assigned','queued','started','step','handoff','artifact_created',
  'approval_requested','approved','rejected','paused','resumed','cancelled',
  'failed','completed','safety_blocked'
);

create type audit_event_type as enum (
  'login','logout','employee_hired','employee_assigned','permission_changed',
  'tool_invoked','email_sent','published','domain_operation','payment',
  'data_deleted','safety_decision','approval','model_used','credit_changed','emergency_stop'
);

create type artifact_type as enum (
  'research_report','competitor_matrix','sales_list','csv','proposal','email_draft',
  'marketing_plan','image','video','ui_design','code','website','app_preview','pdf',
  'published_url','database_schema','legal_document','financial_model','document'
);

-- ── ルート ───────────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references profiles(id) on delete restrict,
  plan_key text not null default 'free',
  locale text not null default 'ja',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create table organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index on organization_members (user_id);

-- ── 事業・プロジェクト ────────────────────────────────
create table businesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  summary text not null default '',
  target_customer text not null default '',
  problem text not null default '',
  progress text not null default '',
  budget_jpy bigint,
  deadline timestamptz,
  owner_can_do text not null default '',
  delegate_to_ai text not null default '',
  market text not null default 'domestic' check (market in ('domestic','overseas','both')),
  regulated_notes text not null default '',
  hypotheses jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  business_id uuid references businesses(id) on delete set null,
  name text not null,
  description text not null default '',
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

-- ── 職種と社員 ────────────────────────────────────────
-- 職種テンプレートは Role Registry (コード) が正だが、
-- 管理画面から上書きできるようテーブルにも保持する。
create table role_definitions (
  id uuid primary key default gen_random_uuid(),
  role_key role_key not null unique,
  name text not null,
  version text not null,
  allowed_capabilities jsonb not null default '[]'::jsonb,
  allowed_tools jsonb not null default '[]'::jsonb,
  allowed_data_scopes jsonb not null default '[]'::jsonb,
  allowed_artifact_types jsonb not null default '[]'::jsonb,
  prohibited_actions jsonb not null default '[]'::jsonb,
  approval_required_actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table employee_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  role_key role_key not null,
  name text not null,
  specialty text not null default '',
  status employee_status not null default 'idle',
  current_task_id uuid,
  avatar_seed text not null default '',
  hired_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create index on employee_instances (organization_id, role_key);

-- 社員ごとの権限上書き（既定は role_definitions）
create table employee_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references employee_instances(id) on delete cascade,
  allowed_tools jsonb not null default '[]'::jsonb,
  allowed_data_scopes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id)
);

-- ── 会話 ─────────────────────────────────────────────
create table conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid references employee_instances(id) on delete cascade,
  title text not null default '',
  kind text not null default 'director' check (kind in ('director','employee')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  author text not null check (author in ('user','employee','system')),
  employee_id uuid references employee_instances(id) on delete set null,
  content text not null,
  contains_untrusted_data boolean not null default false,
  created_at timestamptz not null default now()
);

create index on messages (conversation_id, created_at);

-- ── 意思決定（選択カード） ────────────────────────────
create table decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  summary text not null default '',
  questions jsonb not null default '[]'::jsonb,
  hypotheses jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','executed','dismissed')),
  safety_level safety_level not null default 'GREEN',
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  created_by uuid references profiles(id)
);

create table decision_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  decision_id uuid not null references decisions(id) on delete cascade,
  kind text not null check (kind in ('hire','assign','queue','task','info','alternative')),
  title text not null,
  description text not null default '',
  role_key role_key,
  employee_id uuid references employee_instances(id) on delete set null,
  reason text not null default '',
  estimated_duration_minutes integer not null default 0,
  estimated_work_tokens integer not null default 0,
  risk_level safety_level not null default 'GREEN',
  recommended boolean not null default false,
  payload jsonb not null default '{}'::jsonb
);

-- ── タスク ───────────────────────────────────────────
create table tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  description text not null default '',
  status task_status not null default 'todo',
  priority task_priority not null default 'normal',
  assignee_employee_id uuid references employee_instances(id) on delete set null,
  required_capabilities jsonb not null default '[]'::jsonb,
  due_date timestamptz,
  tools jsonb not null default '[]'::jsonb,
  estimated_work_tokens integer not null default 0,
  used_work_tokens integer not null default 0,
  safety_level safety_level not null default 'GREEN',
  parent_task_id uuid references tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create index on tasks (organization_id, status);

-- 1社員1メインタスク: running のタスクは社員ごとに 1 件まで
create unique index tasks_one_running_per_employee
  on tasks (assignee_employee_id)
  where status = 'running' and assignee_employee_id is not null;

alter table employee_instances
  add constraint employee_current_task_fk
  foreign key (current_task_id) references tasks(id) on delete set null;

create table task_dependencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  depends_on_task_id uuid not null references tasks(id) on delete cascade,
  unique (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create table task_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  employee_id uuid not null references employee_instances(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz
);

create table task_handoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  from_employee_id uuid references employee_instances(id) on delete set null,
  to_employee_id uuid references employee_instances(id) on delete set null,
  to_role_key role_key not null,
  reason text not null default '',
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected')),
  created_at timestamptz not null default now()
);

create table task_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  employee_id uuid references employee_instances(id) on delete set null,
  status run_status not null default 'queued',
  idempotency_key text not null,
  reservation_id uuid,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create table task_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  run_id uuid references task_runs(id) on delete set null,
  type task_event_type not null,
  message text not null default '',
  employee_id uuid references employee_instances(id) on delete set null,
  node_key text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index on task_events (organization_id, task_id, created_at);

-- ── メモリ ───────────────────────────────────────────
create table memories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  scope memory_scope not null,
  scope_ref_id uuid,
  employee_id uuid references employee_instances(id) on delete cascade,
  title text not null,
  content text not null,
  source text not null default '',
  confidentiality text not null default 'internal'
    check (confidentiality in ('public','internal','confidential')),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create index on memories (organization_id, scope, scope_ref_id);

-- ── 成果物 ───────────────────────────────────────────
create table artifacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  employee_id uuid references employee_instances(id) on delete set null,
  type artifact_type not null default 'document',
  title text not null,
  summary text not null default '',
  current_version integer not null default 1,
  status text not null default 'draft' check (status in ('draft','review','approved','published')),
  citations jsonb not null default '[]'::jsonb,
  used_work_tokens integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create table artifact_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  artifact_id uuid not null references artifacts(id) on delete cascade,
  version integer not null,
  content text not null default '',
  content_type text not null default 'markdown'
    check (content_type in ('markdown','json','csv','code','url','image')),
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  unique (artifact_id, version)
);

-- ── 承認・通知 ────────────────────────────────────────
create table approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  action approval_action not null,
  task_id uuid references tasks(id) on delete cascade,
  artifact_id uuid references artifacts(id) on delete cascade,
  employee_id uuid references employee_instances(id) on delete set null,
  title text not null,
  what text not null default '',
  affects text not null default '',
  service text not null default '',
  destination text not null default '',
  diff text not null default '',
  estimated_cost_jpy numeric(12,2) not null default 0,
  estimated_work_tokens integer not null default 0,
  reversible boolean not null default true,
  risk text not null default '',
  status approval_status not null default 'pending',
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  kind text not null check (kind in ('artifact_ready','approval_required','task_done','task_failed','safety','system')),
  title text not null,
  body text not null default '',
  link_artifact_id uuid references artifacts(id) on delete set null,
  link_task_id uuid references tasks(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── 連携 ─────────────────────────────────────────────
create table integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('email','image','video','search','deployment','database','billing')),
  provider text not null,
  status text not null default 'not_connected'
    check (status in ('not_connected','mock','connected','error')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 認証情報は暗号化して保存し、クライアントへは絶対に返さない
create table provider_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null,
  encrypted_credentials text not null,
  scopes jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── ワークトークン ────────────────────────────────────
create table credit_wallets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade unique,
  balance bigint not null default 0 check (balance >= 0),
  reserved bigint not null default 0 check (reserved >= 0),
  updated_at timestamptz not null default now()
);

create table credit_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  employee_id uuid references employee_instances(id) on delete set null,
  amount bigint not null check (amount >= 0),
  settled_amount bigint,
  status reservation_status not null default 'reserved',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- リトライで二重に予約されないことを DB レベルで保証する
  unique (organization_id, idempotency_key)
);

create table credit_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  type ledger_entry_type not null,
  bucket ledger_bucket not null default 'system',
  amount bigint not null,
  balance_after bigint not null,
  task_id uuid references tasks(id) on delete set null,
  employee_id uuid references employee_instances(id) on delete set null,
  reservation_id uuid references credit_reservations(id) on delete set null,
  idempotency_key text,
  note text not null default '',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index credit_ledger_idempotency
  on credit_ledger (organization_id, idempotency_key)
  where idempotency_key is not null;

create table model_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  employee_id uuid references employee_instances(id) on delete set null,
  logical_model text not null,
  physical_model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_jpy numeric(12,4) not null default 0,
  work_tokens integer not null default 0,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index model_usage_idempotency
  on model_usage (organization_id, idempotency_key)
  where idempotency_key is not null;

-- ── 安全性・監査 ──────────────────────────────────────
create table safety_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  employee_id uuid references employee_instances(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  level safety_level not null,
  categories jsonb not null default '[]'::jsonb,
  stage text not null check (stage in ('input','plan','pre_tool','output')),
  public_reason text not null default '',
  internal_detail text not null default '',
  created_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_user_id uuid references profiles(id) on delete set null,
  actor_employee_id uuid references employee_instances(id) on delete set null,
  type audit_event_type not null,
  target text not null default '',
  detail jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);

create index on audit_events (organization_id, created_at);

-- ── 課金 ─────────────────────────────────────────────
create table billing_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade unique,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  stripe_subscription_id text unique,
  plan_key text not null default 'free',
  status text not null default 'active'
    check (status in ('active','trialing','past_due','canceled','incomplete')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── updated_at 自動更新 ──────────────────────────────
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','organizations','businesses','projects','role_definitions',
    'employee_instances','employee_permissions','conversations','tasks','memories',
    'artifacts','integrations','provider_connections','credit_reservations','subscriptions'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at before update on %I
       for each row execute function set_updated_at()', t, t);
  end loop;
end;
$$;
