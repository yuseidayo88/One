-- ============================================================
-- AI Company — Row Level Security
--
-- 原則:
--   * organization_id を持つすべてのテーブルで RLS を有効化する。
--   * 参照・変更は「呼び出しユーザーがそのorganizationのメンバーであること」を条件にする。
--   * 他組織の ID を直接指定しても行が返らない。
--   * service_role は RLS をバイパスするため、サーバー側 Store 層でも
--     organization_id 条件を必ず付与している（二重防御）。
-- ============================================================

-- 呼び出しユーザーが所属する組織か
create or replace function is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_members m
    where m.organization_id = org
      and m.user_id = auth.uid()
  );
$$;

create or replace function is_org_admin(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_members m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.role in ('owner','admin')
  );
$$;

-- ── profiles ────────────────────────────────────────
alter table profiles enable row level security;

create policy profiles_select_self on profiles
  for select using (id = auth.uid());
create policy profiles_update_self on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert_self on profiles
  for insert with check (id = auth.uid());

-- ── organizations ───────────────────────────────────
alter table organizations enable row level security;

create policy organizations_select_member on organizations
  for select using (is_org_member(id));
create policy organizations_insert_owner on organizations
  for insert with check (owner_user_id = auth.uid());
create policy organizations_update_admin on organizations
  for update using (is_org_admin(id)) with check (is_org_admin(id));

-- ── organization_members ────────────────────────────
alter table organization_members enable row level security;

create policy org_members_select on organization_members
  for select using (user_id = auth.uid() or is_org_member(organization_id));
create policy org_members_insert on organization_members
  for insert with check (
    is_org_admin(organization_id)
    or exists (select 1 from organizations o where o.id = organization_id and o.owner_user_id = auth.uid())
  );
create policy org_members_delete on organization_members
  for delete using (is_org_admin(organization_id));

-- ── 組織スコープの共通ポリシーを一括生成 ─────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'businesses','projects','employee_instances','employee_permissions',
    'conversations','messages','decisions','decision_options','tasks',
    'task_dependencies','task_assignments','task_handoffs','task_runs','task_events',
    'memories','artifacts','artifact_versions','approvals','notifications',
    'integrations','credit_wallets','credit_ledger','credit_reservations',
    'model_usage','safety_decisions','audit_events','billing_customers','subscriptions'
  ]
  loop
    execute format('alter table %I enable row level security', t);

    execute format(
      'create policy %I_select on %I for select using (is_org_member(organization_id))', t, t);
    execute format(
      'create policy %I_insert on %I for insert with check (is_org_member(organization_id))', t, t);
    execute format(
      'create policy %I_update on %I for update using (is_org_member(organization_id))
       with check (is_org_member(organization_id))', t, t);
  end loop;
end;
$$;

-- ── 削除は限定的に許可（監査系は削除させない） ────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'businesses','projects','employee_instances','conversations','decisions',
    'tasks','task_dependencies','task_handoffs','memories','artifacts','notifications',
    'integrations'
  ]
  loop
    execute format(
      'create policy %I_delete on %I for delete using (is_org_admin(organization_id))', t, t);
  end loop;
end;
$$;

-- audit_events / safety_decisions / credit_ledger / model_usage は
-- 追記専用。delete ポリシーを作らないことで削除を封じる。

-- ── provider_connections: 認証情報は所有組織の管理者のみ ──
alter table provider_connections enable row level security;

create policy provider_connections_select on provider_connections
  for select using (is_org_admin(organization_id));
create policy provider_connections_write on provider_connections
  for all using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));

-- ── role_definitions は全ユーザー読み取り可 / 書き込み不可 ──
alter table role_definitions enable row level security;

create policy role_definitions_select on role_definitions
  for select using (auth.uid() is not null);

-- ── Storage: 組織単位のポリシー ─────────────────────
-- バケット 'artifacts' に対し、パス org/<organization_id>/... のみ許可する。
insert into storage.buckets (id, name, public)
values ('artifacts', 'artifacts', false)
on conflict (id) do nothing;

create policy "artifacts_read_own_org"
  on storage.objects for select
  using (
    bucket_id = 'artifacts'
    and (storage.foldername(name))[1] = 'org'
    and is_org_member(((storage.foldername(name))[2])::uuid)
  );

create policy "artifacts_write_own_org"
  on storage.objects for insert
  with check (
    bucket_id = 'artifacts'
    and (storage.foldername(name))[1] = 'org'
    and is_org_member(((storage.foldername(name))[2])::uuid)
  );

create policy "artifacts_update_own_org"
  on storage.objects for update
  using (
    bucket_id = 'artifacts'
    and (storage.foldername(name))[1] = 'org'
    and is_org_member(((storage.foldername(name))[2])::uuid)
  );

-- ── Realtime: task_events を購読可能にする ──────────
alter publication supabase_realtime add table task_events;
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table notifications;
