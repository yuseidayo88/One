-- ============================================================
-- AI Company — 職種テンプレートの初期投入
--
-- 正となる定義は src/lib/roles/registry.ts。
-- ここは管理画面での上書きと、SQL からの参照のためのミラー。
-- registry の ROLE_REGISTRY_VERSION を上げたら、このマイグレーションも更新する。
-- ============================================================

insert into role_definitions
  (role_key, name, version, allowed_capabilities, allowed_tools,
   allowed_data_scopes, allowed_artifact_types, prohibited_actions, approval_required_actions)
values
  ('director', '統括AI', '2026-08-17.1',
   '["business_understanding","task_decomposition","assignment","estimation","approval_request","progress_summary"]',
   '["llm_generate","memory_write","file_write"]',
   '["org_profile","business","project","own_memory","shared_memory","tasks","artifacts"]',
   '["document"]',
   '["legal_advice","investment_decision","auto_fund_movement","unapproved_external_send"]',
   '["high_cost_run"]'),

  ('market_research', '市場調査', '2026-08-17.1',
   '["market_research","competitor_analysis","customer_research","trend_research","interview_design"]',
   '["llm_generate","memory_write","file_write","web_search","web_fetch"]',
   '["business","project","own_memory","shared_memory","artifacts"]',
   '["research_report","competitor_matrix","csv","document"]',
   '["false_claims","unapproved_external_send"]',
   '[]'),

  ('marketing', 'マーケティング', '2026-08-17.1',
   '["persona","positioning","content_planning","ad_copy","landing_copy","kpi_design","marketing_analytics"]',
   '["llm_generate","memory_write","file_write","web_search","social_post","ads_publish"]',
   '["business","project","own_memory","shared_memory","artifacts"]',
   '["marketing_plan","document","csv"]',
   '["spam_bulk_outreach","false_claims","unapproved_external_send"]',
   '["social_post","ads_publish"]'),

  ('sales', '営業', '2026-08-17.1',
   '["lead_research","lead_scoring","sales_strategy","sales_list","proposal_writing","email_drafting","crm_organization"]',
   '["llm_generate","memory_write","file_write","web_search","email_draft","email_send","crm_write"]',
   '["business","project","own_memory","shared_memory","artifacts","contacts"]',
   '["sales_list","proposal","email_draft","csv","document"]',
   '["spam_bulk_outreach","impersonation","false_claims","unapproved_external_send"]',
   '["email_send","pii_external_send"]'),

  ('designer', 'デザイナー', '2026-08-17.1',
   '["ux_design","wireframe","design_spec","brand_direction","image_generation","video_storyboard"]',
   '["llm_generate","memory_write","file_write","image_generate","video_generate"]',
   '["business","project","own_memory","shared_memory","artifacts"]',
   '["ui_design","image","video","document","pdf"]',
   '["impersonation","unapproved_external_send"]',
   '["high_cost_run"]'),

  ('engineer', 'プログラマー', '2026-08-17.1',
   '["requirements","technical_design","coding","database_design","testing","bugfix","preview_environment","deploy_preparation"]',
   '["llm_generate","memory_write","file_write","web_search","web_fetch","code_write","code_run_sandbox","db_migration_plan","db_migration_apply","deploy_preview","deploy_production","dns_update"]',
   '["business","project","own_memory","shared_memory","artifacts","tasks"]',
   '["code","website","app_preview","database_schema","published_url","document"]',
   '["production_destructive","unapproved_external_send"]',
   '["publish_production","production_db_change","dns_update","data_deletion"]'),

  ('assistant', '事務・秘書', '2026-08-17.1',
   '["scheduling","meeting_notes","task_organization","email_triage","document_formatting","data_entry","reminder"]',
   '["llm_generate","memory_write","file_write","email_draft","email_send"]',
   '["org_profile","business","project","own_memory","shared_memory","tasks","artifacts"]',
   '["document","email_draft","csv","pdf"]',
   '["unapproved_external_send","spam_bulk_outreach"]',
   '["email_send"]'),

  ('legal', '法務・コンプライアンス調査', '2026-08-17.1',
   '["legal_research","policy_drafting","regulatory_risk","license_research","compliance_checklist"]',
   '["llm_generate","memory_write","file_write","web_search","web_fetch"]',
   '["business","project","own_memory","shared_memory","artifacts"]',
   '["legal_document","research_report","document"]',
   '["legal_advice","unapproved_external_send"]',
   '["contract_submission"]'),

  ('finance', '財務・経理サポート', '2026-08-17.1',
   '["budgeting","revenue_forecast","pl_simulation","cashflow","expense_classification","pricing_design","accounting_organization"]',
   '["llm_generate","memory_write","file_write","web_search","payment_execute"]',
   '["business","project","own_memory","shared_memory","artifacts","financials"]',
   '["financial_model","csv","document"]',
   '["tax_filing","investment_decision","auto_fund_movement","unapproved_external_send"]',
   '["payment","fund_transfer"]')

on conflict (role_key) do update set
  name = excluded.name,
  version = excluded.version,
  allowed_capabilities = excluded.allowed_capabilities,
  allowed_tools = excluded.allowed_tools,
  allowed_data_scopes = excluded.allowed_data_scopes,
  allowed_artifact_types = excluded.allowed_artifact_types,
  prohibited_actions = excluded.prohibited_actions,
  approval_required_actions = excluded.approval_required_actions,
  updated_at = now();
