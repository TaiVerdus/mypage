# 反馈后台（V3）：它怎么工作、你要做哪几步

> 面向两件事：**课程验收**（能解释清楚表 / SQL / 权限 / 密钥）和**以后自己回看**。
> 代码在 `index.html`（抽屉表单）、`style.css`（`.fb-*` 那一段）、`script.js`（末尾「交互十：反馈抽屉」）。
> 建表脚本在 `supabase/feedback.sql`。

## 1. 一次反馈的数据流

```
访客打开主页 → 点右下角「留个反馈」→ 填表（不跳页）
    → 浏览器把数据发给 Supabase（带项目地址 + publishable key）
        → Supabase 按 RLS 规则判断：这条允许插入吗？ → 写进 feedback 表
    → 前端收到成功/失败 → 显示「收到了，谢谢」或人话错误 + 保留已填内容
你：登录 Supabase 控制台 → Table Editor 看记录
```

⚠️ 关键：是**浏览器**直接向 Supabase 提交，不是 GitHub Pages 替你写数据库。
GitHub Pages 只负责把 `index.html / style.css / script.js` 这些静态文件发给访客。

## 2. 表结构：一条反馈 = 一行

| 列（字段） | 类型 | 含义 | 谁填 |
| --- | --- | --- | --- |
| `id` | bigint，主键 | 每条记录的唯一编号 | 数据库自动 |
| `name` | text | 昵称（可选，允许匿名） | 访客 |
| `relation` | text | 与主页主人的关系（同学/老师/家人/朋友/同事/其他/不便透露） | 访客选 |
| `device` | text | 这条反馈针对的设备（电脑/手机/平板/其他） | 访客选 |
| `message` | text，必填 | 反馈正文（1~1000 字） | 访客 |
| `version` | text | 网站版本（前端提交时自动带上 `V3.0`） | 前端自动 |
| `created_at` | timestamptz | 提交时间 | **数据库** `now()` |

对照概念：**表**（table）= feedback；**行**（记录）= 一条反馈；**列** = 上表的一行；
**主键** = `id`，每条记录的唯一编号。

## 3. 建表脚本在做什么（`supabase/feedback.sql`）

1. `create table` —— 建表；`message` 上挂了 `check`，**空的和超 1000 字的在数据库层就挡掉**（不只靠前端）。
2. `created_at default now()` —— 时间由数据库记，**不信客户端**（访客改不了自己的提交时间）。
3. `enable row level security` —— 开 RLS ⇒ **默认拒绝一切**，必须显式写策略放行。
4. `create policy ... for insert to anon` —— 只放行一件事：**匿名访客插入新反馈**。
5. `grant insert on ... to anon` —— 表级权限上再确认一次「只能插入」。

**为什么没有读策略**：访客读不到别人的反馈、也改不了删不了 —— 这不是靠页面上藏按钮，
而是数据库层根本不允许。你自己能看到，是因为控制台用的是高权限（service_role，绕过 RLS）。

## 4. 两种密钥，别搞混

| | 能不能放前端 | 在本项目的用途 |
| --- | --- | --- |
| **publishable key**（旧称 anon key） | ✅ 可以 —— 它设计上就是给浏览器用的，权限由 RLS 兜着 | 填在 `script.js` 的 `SUPABASE_CONFIG` |
| **secret key**（旧称 service_role）/ 数据库密码 | ❌ **永远不进前端、不进 git、不给 AI** | 你只在控制台里用，本项目任何文件都不需要它 |

⚠️ 本项目对 AI 的实际做法：**只把 publishable key 和项目地址给它**，secret 从不提供（课件第 21 / 30 页的红线）。

## 5. 你要做的步骤

1. 注册 / 登录 Supabase，新建一个项目（记下数据库密码，别丢、也别给任何人）。
2. 进 **SQL Editor** → 把 `supabase/feedback.sql` 整段粘进去 → Run。
3. 进 **Table Editor**，应该能看到空的 `feedback` 表（字段与第 2 节一致）。
4. 进 **Project Settings → API**，复制 **Project URL** 和 **publishable key**（**不是** secret）。
5. 把这两项填进 `script.js` 的：
   ```js
   var SUPABASE_CONFIG = {
     url: 'https://xxxx.supabase.co',
     publishableKey: 'sb_publishable_xxxxxxxx'
   };
   ```
6. 本地打开页面（`node server.js` 后访问 `http://127.0.0.1:8080/`，或直接双击 `index.html` 也行 ——
   反馈这条路不依赖本机代理），点右下角「留个反馈」，**用带唯一标记的内容**提交一次，例如：
   `测试-A7K3 电脑端字有点小`
7. 回 **Table Editor** 找到那条记录：**字段齐全、时间正确**才算真的成功（这是课件的验收标准）。
8. 发布到 GitHub Pages（见 `DEPLOY.md` 与课件 Part 4），再用**公开网址**在手机和电脑上各提交一条。

## 6. 没接上后台时会怎样（演示模式）

`SUPABASE_CONFIG` 还是空的时候，表单**可以照常填**，但提交后显示的是**演示模式**文案：
这条没真的发出去。这是故意的 —— 界面能先给人看，但绝不假装「已经收到了」。

## 7. 出问题先看这几条

| 现象 | 大概率原因 |
| --- | --- |
| 提示「数据库拒绝了这条记录」 | RLS 策略没建 / 跑脚本时漏了 `create policy` |
| 提示「表不存在」之类 | SQL 没跑成功（回 SQL Editor 看有没有红字） |
| 提示「客户端初始化失败」 | `url` / `publishableKey` 填错或还空着 |
| 提示「客户端库没加载出来」 | 页面上那个 Supabase CDN 脚本没加载成功（网络/被拦） |
| 提交成功但 Table Editor 找不到 | 表建在别的 schema，或看错项目 |

## 8. 已知限制（V3 范围之内，不当 bug 修）

- **公开网站上数字分身会落回本地知识库**：它的在线大脑是本机的 `server.js` 代理（保管 DeepSeek key），
  而 GitHub Pages 只能托管静态文件、跑不了 Node。想让它也上线，得把代理搬到别处（Supabase Edge Function 之类）—— 那是下一步的事。
- **没有防刷**：这里只防「误点重复提交」（提交中禁用按钮）。长期公开挨刷的话要额外加限流 / 验证码（课件第 29 页也这么提醒）。
