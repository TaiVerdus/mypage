# 接入 WeClone：把数字分身的「大脑」换成微调模型

> **状态（2026-09-23，V2.7 续六十一）**：**页面侧已经接好，等后端。**
> `script.js` 里的 `CHAT_BACKEND.url` 现在是空的 ⇒ 走本地知识库，**页面行为和接后端之前一模一样**。
> 等下面第 5 步的地址有了，把它填进那一个字段就行，**不用改任何其它代码**。

---

## 1. 先说清楚它是什么、不是什么

[WeClone](https://github.com/xming521/WeClone)（18.2k★，**AGPL-3.0**，Python）是一条
**训练 + 服务**的链路：

```
聊天记录 → 清洗（Presidio 脱敏）→ LoRA 微调（走 LLaMA-Factory）→ vLLM 推理 → OpenAI 兼容 API
```

⚠️ **它不提供网页前端。** 官方路径是把模型接到 Telegram / 微信 / Discord 的聊天机器人上。
所以本站的做法是 **换大脑、留界面**：聊天窗、设计系统、无障碍那一整套**原样不动**，
只把回答来源从 `KNOWLEDGE` 换成它的 API。

> 顺带一个好处：官方文档要求「接机器人时先关掉工具调用」，因为微调过的模型容易被工具带偏。
> 我们**自己直接调 API**，本来就没有工具这一层，少一个坑。

---

## 2. 页面侧：只有一个开关

`script.js` 顶部（`交互三：数字分身`）的 `CHAT_BACKEND`：

| 字段 | 说明 |
| --- | --- |
| `url` | **`weclone-cli server` 起来的地址**，末尾要带 `/v1/chat/completions`。留空 = 只用本地知识库 |
| `model` | WeClone 不校验模型名；官方文档里前端填的就是 `gpt-3.5-turbo` |
| `system` | ⚠️ **必须与微调时用的 `default_system` 一致**（官方明确要求）。留空则不发送 system |
| `timeoutMs` | 单次请求上限，到点就落回知识库（默认 8000） |
| `historyTurns` | 带上最近几轮，对话才有连续性（默认 6） |
| `breakerMax` / `breakerCoolMs` | 断路器：连续失败几次跳闸、冷却多久（默认 2 次 / 2 分钟） |

### 它的行为（三条都验过，见 `tools/test-chat-backend.js`）

- **`url` 为空** ⇒ 只用本地知识库，页面表现和以前**一模一样**
- **`url` 有值** ⇒ 先问微调分身。**任何**失败都落回知识库并加一个「离线版回答」小标记：
  超时 / 非 200 / 坏 JSON / 空回复 / **被跨域拦掉**
- **连续失败 2 次 ⇒ 跳闸 2 分钟**，这期间**完全不碰网络**。
  ⚠️ 没有这一步的话，后端一挂，**访客每问一句都要干等 8 秒** —— 那比直接答知识库还糟。

---

### 2.1 先跑通链路：本地联调桩（**不需要 WSL、不需要模型**）

在装那一大堆东西（WSL / CUDA / vLLM / 模型）之前，**先用一个假端点把
「页面 → HTTP → OpenAI 兼容接口」这一段跑通**。这一步能在你自己的浏览器里验证
三件最容易翻车的事：**URL 形状 / CORS / 超时**。

```bash
# 另开一个终端，在仓库根目录：
python tools/openai-stub.py

# 然后在浏览器里打开（不改任何文件、也不会被提交）：
#   index.html?chat=http://127.0.0.1:8005/v1/chat/completions
```

- 回答应该来自桩（会写明「我是本地假服务」），**且气泡下没有「离线版回答」标记**
- 验**降级**：`python tools/openai-stub.py --fail 500` ⇒ 回答变回知识库 + 出现标记；
  **连问两句后第三句不再等待**（断路器跳闸）
- 验**超时**：`python tools/openai-stub.py --delay 12`（比页面默认的 8 秒长）
- 强制走知识库：`index.html?chat=off`

> `?chat=` 只影响你自己那次打开；公开页面不带这个参数，一切照旧。

**接真后端之前，先用这个探一下它能不能被页面用上：**

```bash
node tools/probe-openai-endpoint.js http://127.0.0.1:8005/v1/chat/completions
```

它检查 **响应形状 / CORS 有没有放行 / 耗时有没有超过页面的 8 秒超时** ——
这三条正是「curl 明明是好的，页面上就是不动」最常见的三个原因。

---

### 2.2 最快路径：本机 ollama（0 元，2026-09-23 实测）

不需要云、不需要 WSL、不需要管理员。本机实测：**ollama 认到 RTX 5070 Laptop（compute `12.0`，
CUDA v13，可用 6.8 GiB）** ⇒ Blackwell 那条顾虑在这条路上不存在。

```bash
# 1. 起服务（托盘程序会自动起；或手动）
ollama serve

# 2. 拉模型（≈4.7GB；qwen2.5 与 WeClone 默认基座同族，以后换微调版最省事）
ollama pull qwen2.5:7b

# 3. ⚠️ 不要双击 index.html —— 改成本地 http 服务（见下面那条实测）
python -m http.server 8000
# 然后打开： http://localhost:8000/
```

**页面会自动接上本机 ollama**，不需要改任何配置 —— `script.js` 的 `CHAT_BACKEND.localUrl`
只在**本机打开时**（`file://` 或 `localhost` / `127.0.0.1`）才接管；
**公网域名下永远不生效**，绝不会去连访客自己的机器（这条有回归测试盯着，见
`tools/test-chat-backend.js` 第 9 节）。

#### ⚠️ 为什么必须用 `http://localhost` 而不是双击（实测）

| 页面来源 | 浏览器发的 Origin | ollama **默认**白名单 |
| --- | --- | --- |
| `file://`（双击打开） | `null` | **403 Forbidden** ✗ |
| `http://localhost:8000` | `http://localhost:8000` | **200 + `Access-Control-Allow-Origin`** ✓ |

想让双击也能用，就得把 `OLLAMA_ORIGINS` 设成 `*` 再重启 ollama；
**但它不设也照样能用 —— 只要用 `http://localhost` 打开**（这也更接近真实部署的样子）。

#### ⚠️ 这台机器上 ollama 自身的两个坑

1. **模型目录被改到了 `D:\ollama`**（`OLLAMA_MODELS=D:\ollama`）。
   ⚠️ `C:\Users\wshix\.ollama\models` 里还躺着一个**完整的 `deepseek-r1:7b`（4.4GB）**，
   **服务端根本不看那个目录** ⇒ 那 4.4GB 是白占的（要清理的话挪走/删掉都行）。
2. **`OLLAMA_HOST` 被设成了 `0.0.0.0:11434`** ⇒ **CLI 会连不上**
   （`ollama list` 会说「something went wrong, please see the ollama server logs」，
   而服务端日志里那条 `/api/tags` 明明是 200）。**服务本身是好的**，只是客户端连 `0.0.0.0` 在
   Windows 上不通。绕过：命令行前加 `OLLAMA_HOST=127.0.0.1:11434`，或用 HTTP 接口。

> **人物设定放在页面里**（`script.js` 的 `CHAT_BACKEND.system`），不放在 ollama 那边 ——
> 这样它跟着 git 走、有版本记录，而且以后换成 WeClone 微调模型时是同一个位置。

---

## 3. 后端：六步

### 第 0 步 · 环境

- **WSL**（README 明确写了「Windows 环境未严格测试，建议用 WSL」）
- NVIDIA 驱动 + **CUDA ≥ 12.6**、**Python 3.12**、`uv`

### 第 1 步 · 拉代码、建环境

```bash
git clone https://github.com/xming521/WeClone.git && cd WeClone
uv venv .venv --python=3.12 && source .venv/bin/activate
uv pip install --group main -e .
cp settings.template.jsonc settings.jsonc
```

### 第 2 步 · 数据（微信）

⚠️ 这一步是整个链路**最不确定**的一环，先说实话：

- **Telegram 是它唯一「完全支持」的数据源**：桌面版直接导出 JSON，丢进 `./dataset/telegram` 就能用
- **微信**这边项目里有对应的数据解析路径（配套的是 PyWxDump 一类工具：**解密本地微信数据库**）。
  它牵涉微信版本、解密方式、平台规则，**命令以它仓库当时的文档为准** —— 我不在这里编一条给你
- 社区经验：**导出单聊、避开群聊**。数据越「只有你」，微调出来越像你

### 第 3 步 · 清洗

```bash
weclone-cli make-dataset        # 走 Presidio 脱敏 + 屏蔽词过滤，产出训练集
```

⚠️ 它做的是**自动**脱敏（手机号 / 邮箱 / 身份证这类），**不保证 100%**。
你自己要维护屏蔽词表；涉及别人的敏感信息，手动再过一遍。

### 第 4 步 · 微调

```bash
weclone-cli train-sft
```

显存对照（README 原表，7B）：

| 方法 | 7B 需要 |
| --- | --- |
| Full（bf16） | 120 GB |
| LoRA | **16 GB** |
| **QLoRA 4bit** | **≈ 6 GB** ← 你的 RTX 5070 8GB 走这条 |
| QLoRA 2bit | 4 GB |

⚠️ 两条预期管理：
- README **自己说 7B 效果「average」**，14B 以上才有明显提升。8GB 本机只能 4bit + 小 batch + 截短 `cutoff_len`
- 真想看效果，租一台 24GB 的云卡训 14B，比在本机硬压 7B 划算

### 第 5 步 · 起服务

```bash
weclone-cli server      # 起一个 OpenAI 兼容的 API（默认在 :8005）
```

服务起来后先自己确认一遍接口通不通：

```bash
curl http://127.0.0.1:8005/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"在吗"}]}'
```

### 第 6 步 · 接上页面

把地址填进 `CHAT_BACKEND.url`（末尾 `/v1/chat/completions`），刷新页面即可。

---

### 3.1 本机现状（2026-09-23 实测，**装之前先看这段**）

| 项 | 实测结果 | 影响 |
| --- | --- | --- |
| GPU | **RTX 5070 Laptop**，8151 MiB，驱动 591.91 | 是 **Blackwell `sm_120`**；显存 8GB（比台式 5070 的 12GB 更紧） |
| **torch 钉** | WeClone 钉 `torch==2.7.1+cu126` | ⚠️⚠️ **cu126 的 wheel 里没有 `sm_120` 的 kernel，在这张卡上一定跑不起来** —— 报 `no kernel image is available for execution on the device`。必须把 `pyproject.toml` 里的 index 换成 `.../whl/cu128` 并把钉改成 `+cu128`（torch 版本不用变） |
| WSL | 只有 `docker-desktop`，**没有 Linux 发行版** | `vllm` / `triton` 都标了 `platform_system == 'Linux'` ⇒ 官方那条 `weclone-cli server` 需要先 `wsl --install -d Ubuntu`（**管理员权限 + 可能重启**） |
| GitHub | 直连 `000`（不通） | 克隆走镜像：`https://ghfast.top/https://github.com/...`（实测通） |
| PyPI / `download.pytorch.org` | 都 `200` ✓ | 装依赖、下 cu128 wheel 没问题 |
| `hf-mirror.com` | 不通 | 模型走 **ModelScope**（LLaMA-Factory 设 `USE_MODELSCOPE_HUB=1`） |
| 磁盘 | C: 空 619GB / D: 空 73GB | 装在 C:（venv + 模型 ≈ 30GB 起） |

⚠️ 另有一条 Blackwell 的坑：**FlashAttention-2 目前没有 `sm_120` 的预编译 wheel**。
如果哪个教程让你加 `attn_implementation="flash_attention_2"`，改成 `"sdpa"` 或 `"eager"`。

---

### 3.2 两条路怎么选（2026-09-23）

**如果只在这两条里选：选租云。** 本机那条有三个未知数，每一个都能吃掉一小时：

| 未知数 | 为什么危险 |
| --- | --- |
| WSL2 GPU 透传 | 要现场验；而且 WSL2 默认只给 50% 内存，还得改 `.wslconfig` |
| **vLLM 0.10.0 在 `sm_120` 上有没有 kernel** | **最大的一条** —— `weclone-cli server` 就是 vLLM，而它的预编译 wheel 对 Blackwell 的支持没有保证 |
| 8GB 能不能真训 7B | README 说 QLoRA 4bit ≈6GB，但那是**纯文本 7B**；WeClone 默认 `Qwen2.5-VL-7B`，多一个视觉塔、更胖。WSL / Windows 桌面还要占 0.5~1.5GB |

云上这三个未知数直接消失：24GB 卡 ⇒ 7B 用**常规 LoRA（不量化）**，效果好一档、还更快。代价：1–3 小时卡时，几块钱。

**但这个选择可以绕开 —— 训练和服务不必在同一台机器上：**

| 环节 | 放哪 | 代价 |
| --- | --- | --- |
| 训练 | **租云 GPU** | 几块钱 |
| **服务** | **本机 ollama** | 0 元、**不需要 WSL、不需要管理员** |

ollama 这条路核过官方文档，四条都对得上：

- **明确支持 compute capability `12.0` = RTX 50xx**（5070 在列），要求驱动 531+（本机 591.91 ✓）
- Windows 装到 `%LOCALAPPDATA%\Programs\Ollama`，**不需要管理员**（官方验证命令就是「PowerShell，不是管理员」）
- **自带 CUDA 运行时，不用手装 CUDA**
- 8–12GB 是 8B 模型的甜点区（`qwen3:8b` 的 Q4_K_M 只有 5.2GB）⇒ 8GB 能全量上卡
- 提供 **OpenAI 兼容的 `/v1/chat/completions`** ⇒ 页面一个字都不用改

⇒ **推荐顺序（把风险摊开）**：

1. **今晚 / 0 元 / 半小时**：装 ollama + 拉一个 8B 量化模型，用系统提示词让它扮演分身 ⇒ 页面接上。
   得到的是**真·大模型版分身**（会推理、能答开放问题），**但还不是他的语气**。
   好处：所有「运行时」的坑（CORS / 8GB 够不够 / 页面链路）在**花钱之前**全部验完
2. **有空时 / 几块钱**：租卡跑 WeClone 微调出他的语气 ⇒ 合并 LoRA ⇒ 转 GGUF ⇒ 换进 ollama。
   这时只剩「数据」和「训练」两件新事，其余都已跑通

**只有一种情况该选本机 WSL**：**你不想让聊天记录离开本机** —— 这是唯一的硬理由。
那就得认下上面那三个未知数，外加 8GB 训练要降配（文本版 7B + QLoRA 4bit + batch 1 + 短 `cutoff_len`）。
装的时候注意两条：**只装 `cuda-toolkit`，不要装整个 `cuda` 包**（会覆盖 WSL 的 `libcuda.so` stub）；
torch 用 **cu130**（12.8 已被 PyTorch 的构建矩阵淘汰）。

**一句话**：在意隐私 → 本机；在意成功率与时间 → 云；**想最快看到东西 → 先走第 1 步（两条路都不用）**。

---

## 4. ⚠️ 三个一定会踩的坑

| 坑 | 现象 | 怎么绕 |
| --- | --- | --- |
| **CORS** | 页面上永远是「离线版回答」，控制台报跨域 | 页面与 API 不同源时，服务端必须放行 `Access-Control-Allow-Origin`。本机服务 + 公网页面这条路**必然踩** |
| **混合内容** | 同上，控制台报 Mixed Content | 页面走 https（如 GitHub Pages）就**不能**调 `http://` 的地址。要么给服务挂 https，要么页面也走 http |
| **隧道断了** | 电脑一合盖、隧道一重连换域名，就全落回知识库 | 用固定域名的隧道（Cloudflare Tunnel 的 named tunnel），别用每次随机的那种临时域名 |

> 这三个在代码里**表现完全一样**：落回知识库 + 「离线版回答」。
> 分不出原因是有意的（访客不该看到技术细节），但**主人看到这个标记频繁出现，就知道该去查了**。

---

## 5. ⚠️ 两条红线（不是技术问题，是规矩）

**① 数据是别人的话。** 训练集是你和**别人**的聊天记录；微调出来的模型会学到**对方**的说话方式。
而这个页面是**公开**的 —— 模型一旦对外可查，任何人问它都可能问出别人的事。

WeClone 自己的免责声明原文写着：

> 用户应确保上传的聊天记录等数据符合相关法律法规；**用户应获得数据相关人员的适当授权**；
> 本项目不对数据泄露或隐私侵犯负责。

⇒ 公开上线前想清楚这条。内向的做法：只自己与机器人聊、页面保持知识库（现在的状态）。

**② 许可证是 AGPL-3.0。** 只把它当**工具**跑、从 HTTP 调它的 API ⇒ 一般没问题；
但**改了它的代码再对外提供服务** ⇒ 要按 AGPL 开源你的改动。
⚠️ **别把它的代码抄进本站仓库** —— 本站是自己的作品，抄进来许可证会跟着变，
这也正是这门课「版权红黄绿灯（Reference ≠ Copy）」在考的东西。

---

## 6. 验收清单（接完照这个过一遍）

- [ ] `url` 留空时，页面行为和以前**一模一样**（知识库回答、无标记）
- [ ] 填上 `url`、服务在跑 ⇒ 回答来自微调分身，**没有**「离线版回答」标记
- [ ] 手动把服务停掉 ⇒ 同一条问题变成知识库回答 **+ 出现标记**，页面**不报错、不空白**
- [ ] 停掉后再连问两句 ⇒ 第三句**不再等待**（断路器跳闸，直接答知识库）
- [ ] `node tools/test-chat-backend.js` 全过
- [ ] `node tools/test-chat-kb.js` 全过（知识库那侧没被带坏）
- [ ] 手机上点一遍（窄屏 + 真实网络）
