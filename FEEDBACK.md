# 反馈后台（V3）：它怎么工作、你在哪看数据

> 面向两件事：**课程验收**（能解释清楚表 / SQL / 权限 / 密钥）和**以后自己回看**。
> 后端 = **WorkBuddy 云服务**（托管 PostgreSQL + PostgREST 接口 + 行级安全 RLS），
> 应用 `个人主页`（`wbapp_aEH7ucbFjEJiB6me355TAg`）。
> 代码在 `index.html`（抽屉表单）、`style.css`（`.fb-*` 那一段）、`script.js`（末尾「交互十：反馈抽屉」）。

## 1. 一次反馈的数据流

```
访客打开主页 → 点右下角「留个反馈」→ 填表（不跳页）
    → 浏览器用官方 SDK（@tencent-ai/workbuddy-cloud-sdk）把数据发给云服务
        → 云服务按 RLS + 授权判断：这条允许插入吗？ → 写进 feedback 表
    → 前端收到成功/失败 → 显示「收到了，谢谢」或人话错误 + 保留已填内容
你：打开云服务面板 → 数据管理 → feedback 表看记录
```

⚠️ 关键：**是「浏览器」向后台提交数据**，不是托管页面的服务替访客写数据库。
静态托管只负责把 `index.html / style.css / script.js` 发给访客。

## 2. 表结构：一条反馈 = 一行（这就是数据库概念的样子）

| 列（字段） | 类型 | 含义 | 谁填 |
| --- | --- | --- | --- |
| `id` | bigint，**主键** | 每条记录的唯一编号（自增） | 数据库自动 |
| `name` | text | 昵称（可空，允许匿名） | 访客（选填） |
| `relation` | text | 与主页主人的关系（同学/老师/家人/朋友/同事/其他/不便透露） | 访客选 |
| `device` | text | 这条反馈针对的设备（电脑/手机/平板/其他） | 访客选 |
| `message` | text，必填 | 反馈正文（1~1000 字，超了数据库会拒） | 访客 |
| `version` | text | 网站版本，提交时前端自动带上 `V3.0` | 前端自动 |
| `created_at` | timestamptz | 提交时间 | **数据库** `now()` |

**表（table）** = `feedback`；**行** = 一条反馈；**列** = 上表的一行；**主键** = `id`。
⚠️ 注意**没有** `owner_id`：本表的访客是匿名的，不存在「这条属于谁」的问题 —— 权限靠下面的策略管。

## 3. 实际跑过的 SQL（逐句什么意思）

```sql
-- 建表：一条反馈一行。message 上的 CHECK 让「空的 / 超 1000 字」在数据库层就被挡掉
CREATE TABLE feedback (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT,
  relation   TEXT,
  device     TEXT,
  message    TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
  version    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()      -- 时间由**数据库**记，不信客户端
)
```
```sql
CREATE INDEX feedback_created_at_idx ON feedback (created_at DESC)  -- 按时间倒序看反馈更快
COMMENT ON TABLE feedback IS '访客反馈：一条反馈=一行（V3，2026-09-24）'
```
```sql
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY                 -- 开 RLS ⇒ 默认拒绝一切，必须显式放行
GRANT INSERT ON TABLE public.feedback TO authenticated, anon   -- 第一道门：表级授权，只给「插入」
DROP POLICY IF EXISTS feedback_insert_anyone ON feedback       -- PG 没有 CREATE POLICY IF NOT EXISTS
CREATE POLICY feedback_insert_anyone ON feedback               -- 第二道门：行级策略
  FOR INSERT TO authenticated, anon WITH CHECK (true)
```

**两道门都要过**（这正是课件第 18~20 页讲的那件事）：
1. **表级授权**：只 `GRANT INSERT` ⇒ 谁都没有 `SELECT / UPDATE / DELETE` 的权力；
2. **行级策略**：只建了一条 INSERT 策略，**没有** SELECT 策略 ⇒ 读了也是空。

⇒ 结果：**访客只能提交新反馈，读不到别人的、改不了、删不了**。这不是靠页面上藏按钮，
是数据库层根本不允许 —— 第 6 节脚本的 ② 号检查就是去证明这一点。

## 4. 两种凭据，别搞混

| | 能不能放前端 | 本项目里在哪 |
| --- | --- | --- |
| **公开配置**：`endpoint` + `publishableKey` | ✅ 可以 —— 设计上就是给浏览器用的，权限由 RLS 兜着 | `script.js` 顶部的 `CLOUD_CONFIG` |
| **平台侧高权限凭据**（数据库密码 / 平台密钥 / service_role 之类） | ❌ **永不进前端、不进 git、不给 AI** | 只在平台那一侧 |

⚠️ 本项目对 AI 的实际做法：**只把公开配置交给 AI**，高权限凭据自始至终没提供过（课件第 21 / 30 页的红线）。

## 5. 你要做的（已经很短了）

后端我已经建好并验过（表 / 权限 / 写入 / 拒绝读，见第 6 节），你只需要：

1. **看数据**：打开 **云服务面板 → 数据管理**，找到 `feedback` 表 —— 现在里面有一条
   `自查-XYGJ` 的测试记录（验收脚本写的，认完可以删）。
2. **自己真提交一条**：本地打开页面（双击 `index.html`，或访问 `http://127.0.0.1:8080/`），
   点右下角「留个反馈」，写一条**带唯一标记**的（如 `本地-A7K3 手机上字有点小`），提交后回面板核对。
3. **正式地址已上线**：**`https://mypage-38202.app.workbuddy.host/`**（2026-09-24 发布）。
   打开它 → 提交一条**带唯一标记**的（如 `线上-A7K3 手机上字有点小`）→ 回数据管理核对；
   再用**手机**开一次做同样的事 —— 课件的验收标准是「本地成功 ≠ 线上成功」，这两条线上测试不能省。
   （GitHub Pages 上的 `taiverdus.github.io/mypage/` 是**镜像**：页面能看，但镜像上收不了反馈，
   页面自己会提示并指向正式地址 —— 原因见 `DEPLOY.md` §8.6/§8.7/§8.8。）
4. **收集 3 人反馈**（下一步就是拿这些反馈做 V4）。

## 6. 怎么自己验后台（不用高权限凭据）

```bash
NODE_PATH=<隔离的 node 工作区>/node_modules node tools/test-feedback-db.js
```

它用**和浏览器同款的官方 SDK**、以及从 `script.js` 现读的公开配置，问数据库三件事：

| 检查 | 期待 | 为什么这条重要 |
| --- | --- | --- |
| ① 匿名插入一条 | 成功 | 「能收到、能存下」 |
| ② 匿名读回 | **空数组 / 被拒** | 「权限在数据库层」——页面藏起来不算数 |
| ③ 提交空内容 | 失败 | 约束在数据库层，不只靠前端拦 |

**2026-09-24 实测：三条全过**；并从数据库侧读回了那条记录
（`id=1`、字段齐全、`created_at = 2026-09-24T09:39:04+08:00`、`version = V3.0`）。

## 7. 出问题先看这几条

| 现象 | 大概率原因 |
| --- | --- |
| 「数据库里还没有这张表」 | 表没建（错误码 `42P01`） |
| 「数据库权限拒绝了这条记录」 | 授权或 RLS 策略没配好（`42501`，两道门都要查） |
| 「内容不合法：反馈正文要 1~1000 字」 | 正文空或超长（`23514`，CHECK 在拦） |
| 「客户端库没加载出来」 | 那个 SDK 的 CDN `<script>` 没加载成功（网络 / 被拦） |
| 「后端的凭据没通过」 | 平台侧凭据问题（HTTP 401）——不是页面能修的，照实报给平台 |

## 8. 已知限制（V3 范围之内，不当 bug 修）
- **反馈只在「正式地址 / 本机 / 双击打开」收得到**（2026-09-24 用预检逐项实测）：
  云服务后台的跨域预检放行「应用自己的域名 + localhost/127.0.0.1 + file://」，**其它公开网站一律 403**。
  所以页面若被挂到 GitHub Pages 这类镜像上，表单**发不出去** —— 页面已做成如实提示
  （镜像站上会显示「这是镜像站，收不了反馈」并给出正式地址链接，判断逻辑在 `script.js` 的 `isMirrorSite()`）。
  正式地址 = WorkBuddy 发布出来的应用域名（见 `DEPLOY.md` §8.6/§8.7）。
- **公开网站上数字分身会落回本地知识库**：它的在线大脑是本机的 `server.js` 代理（保管 DeepSeek key），
  静态托管跑不了 Node。想让它也上线，得把代理搬到云服务 / Edge Function 之类的地方 —— 下一步的事。
- **没有防刷**：只防「误点重复提交」（提交中禁用按钮）。长期公开挨刷要另加限流 / 验证码
  （课件第 29 页也这么提醒）。
- **课件原路径备查**：`supabase/feedback.sql` 是「用 Supabase 做同一件事」的脚本，**本项目没有采用**
  （用户选择直接用 WorkBuddy 云服务）。留着是为了讲解时能对照两种后台，或以后想切回去。

## 9. 反馈专区（V3.1 加入，2026-09-26）：访客自己选公开还是私密

页面第 5 个板块（`#feedback`，导航里叫「反馈」）是一块**留言墙**：访客写一条，自己选这条给谁看。

| 选项 | 谁能看到 | 怎么存 |
| --- | --- | --- |
| **私密**（默认） | 只有你 | 直接进 `feedback` 表；页面上**没有任何读取路径** |
| **公开** | 所有访客，**立刻** | 直接进表即上墙（`status` 默认 `approved`）；想撤下就把 `status` 改成 `pending` |

### 9.1 权限是怎么做的（两道锁 + 一张收窄的视图）

- 基础表 `feedback` 仍是老规矩：`anon` 只能 INSERT，**RLS 开着、没有读策略** ⇒ 读出来是空数组（私密内容就靠这层）；
- 新增视图 **`feedback_public`**：只含 `visibility='public' AND status='approved'` 的行，
  且**只暴露 `id / name / message / created_at` 四个字段**（`relation`、`device`、`version`、`status` 一概不出去）；
- 只给 `anon` 这一张视图的 `SELECT`（视图的写权限已 REVOKE）—— 页面读墙走的就是它。

⚠️ 一个容易看错的地方：查权限时会看到 `anon` 对基础表**也有 SELECT 授权**（平台默认给的），
但**真正挡数据的是 RLS**（没有读策略 ⇒ 读出空数组）。所以判断「私密安不安全」要看 RLS 策略，不能只看 GRANT。

### 9.2 你要做的：撤下某条公开反馈（可选，几秒钟一条）

**公开是即时上墙**（你 2026-09-26 定的）—— 访客一提交，墙上立刻就有。所以日常你**什么都不用做**；
只有想撤下某条时：云服务面板 → 数据管理 → `feedback` 表 → 把那一行的 `status` 改成 `pending` → 页面刷新即消失
（想重新放上去就改回 `approved`；彻底不要了直接删行）。

⚠️ 代价说清楚：**没有人工审核 = 公开区可被任意写入**。朋友之间留言没问题；真被刷了，
把 `status` 改回 `pending` 是最快的止血，或者告诉我，我给公开区加一层确认（改视图条件一行的事）。

### 9.3 怎么验（两条命令，都是真机跑权限，不是看提示）

```bash
NODE_PATH=<隔离的 node 工作区>/node_modules node tools/test-feedback-visibility.js
# 插入一私密一公开两条 → 证明：私密读不到、未审核的公开也不显示、基础表被 RLS 锁着

NODE_PATH=<隔离的 node 工作区>/node_modules node tools/verify-public-wall-query.js
# 证明：公开墙的查询链可用，且视图只暴露那四个字段
```

**2026-09-26 实测**：私密不可读 ✓ / 公开**即时**上墙 ✓ / 撤下（改 pending）后从墙上消失 ✓ / 基础表空数组 ✓ / 视图字段集正确 ✓。

### 9.4 已知限制

- **公开区没有人工审核**（即时显示是明确的选择）：可被任意写入，撤下靠改 `status`（见 9.2）；
- **镜像站看不到墙**：GitHub Pages 上的页面读不到后台（跨域策略，见 `DEPLOY.md` §8.6），
  页面会如实显示「这是镜像站，读不到反馈墙」；
- **公开内容会留着**：墙默认显示最近 24 条；要下架就手动改 `status`；
- 右下角那个抽屉（V3 课件交付物）**保留不变** —— 它只发私密反馈，是「随时说一句」的入口；
  这块是「写给人看」的入口。两个入口共用一个客户端与一份错误翻译（桥：`script.js` 的 `MYPAGE_FB`）。
