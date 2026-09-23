-- ============================================================================
--  feedback 表：访客反馈的存放处（V3 · 2026-09-24）
--
--  怎么用：Supabase 控制台 → SQL Editor → 新建 query → 整段粘贴 → Run。
--         跑完到 Table Editor 里应该能看到一张空的 feedback 表。
--  ⚠️ 这个脚本可以重复跑：表用 if not exists，策略先 drop 再建。
--  ⚠️ 这里**不该出现**任何密钥 —— 建表不需要密钥，别把 secret key 贴进来。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 建表：一条访客反馈 = 表里的一行；每个字段是一列
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id         bigint generated always as identity primary key,  -- 唯一编号，数据库自动生成
  name       text,                                            -- 昵称，可选（允许匿名）
  relation   text,                                            -- 与主页主人的关系
  device     text,                                            -- 这条反馈针对的设备
  message    text not null                                    -- 反馈正文，必填
             check (char_length(message) between 1 and 1000),  -- 空的和超长的都在数据库层挡掉
  version    text,                                            -- 网站版本，提交时前端自动附带
  created_at timestamptz not null default now()               -- 提交时间：**数据库**记，不信客户端
);

-- 想按时间倒序看反馈时用得着（数据多了才明显）
create index if not exists feedback_created_at_idx on public.feedback (created_at desc);

-- ---------------------------------------------------------------------------
-- 2. 打开行级安全（RLS）
--    ⚠️ 打开后**默认拒绝一切**，必须显式写策略放行 —— 这是「安全在数据库层」的意思。
--    ⚠️ 红线：不要为了消掉报错就关掉 RLS 或写一条 using (true) 的读策略。
-- ---------------------------------------------------------------------------
alter table public.feedback enable row level security;

-- ---------------------------------------------------------------------------
-- 3. 策略：只放行「匿名访客插入新反馈」这一件事
--    anon = 前端用 publishable key 访问时的角色（访客没有账号，就是这个角色）
-- ---------------------------------------------------------------------------
drop policy if exists "anon 可以提交反馈" on public.feedback;
create policy "anon 可以提交反馈"
  on public.feedback
  for insert
  to anon
  with check (true);        -- 只限制「能插入」；内容合法性由上面的 check 约束管

-- ⚠️ 故意的：**没有** select / update / delete 策略 ⇒ 访客读不到别人的反馈、
--    改不了、删不了。你自己在控制台看得到，是因为控制台用的是更高权限（service_role）。
--    另外这里也不给 anon 发 select/update/delete 的表级权限，作为第二道（RLS 之外还有权限位）。

-- ---------------------------------------------------------------------------
-- 4. 表级权限（RLS 之外的第二道闸）
--    Supabase 默认会给 public schema 里的新表配好权限，这里只**显式**确认「能插入」。
-- ---------------------------------------------------------------------------
grant insert on public.feedback to anon;

-- ---------------------------------------------------------------------------
-- 5. 自检：跑完这几句看看现状（应该看到 rls_enabled = true、只有一条 insert 策略）
-- ---------------------------------------------------------------------------
-- select relname, relrowsecurity from pg_class where relname = 'feedback';
-- select policyname, cmd, roles from pg_policies where tablename = 'feedback';
