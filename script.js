/* ============================================================
   MYPAGE V1.1 · 交互脚本
   交互一：导航平滑滚动
   交互二：滚动时高亮当前区块的导航项
   交互三：数字分身聊天（本地知识库关键词匹配，不联网）
   ============================================================ */

// ---------- 交互一：导航平滑滚动 ----------
document.querySelectorAll('.nav-link').forEach(function (link) {
  link.addEventListener('click', function (e) {
    var href = this.getAttribute('href') || '';
    // 只接管「页内锚点」。子页（ai-log.html）的导航指向 index.html，
    // 不判断就会把默认跳转 preventDefault 掉，点上去毫无反应 = 死链
    if (href.charAt(0) !== '#') return;
    e.preventDefault();
    var target = document.querySelector(href);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// ---------- 交互十二：跳转到锚点后，让落点亮一下（V2.7 续五十五，用户 2026-09-22）----------
// 用户要求「给兴趣中的所有跳转加一个动画」。
// ⚠️ 做的是「**落点反馈**」而不是给链接本身加动效：兴趣标签会跳到三个很不一样的地方
//    （照片墙 / 球体画廊 / 每日推荐小票），让链接抖一下只能表达「我按了」，
//    而「跳过去之后一眼认出目标」才是真问题（球体要滚 200vh、小票在很深的地方）。
// 做法：给落点加一次性的 `.flash`（样式见 style.css §12.6），到时间自动摘掉。
// ⚠️ 摘 class 的定时器：颜色过渡本身是 500ms，到点后**颜色自己回到常态**，
//    所以这里只负责「把 class 拿掉」，不需要写两段动画。
(function () {
  var ANCHORED = '#photo-travel, #photo-drums, #photo-calligraphy, #photo-photography, ' +
                 '#photo-basketball, #photo-performance, #music';
  var FLASH_MS = 1300;        // class 挂 1.3s：够看清亮起来 + 抬起来，又不至于赖着不走
  var flashTimer = null;

  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function () {
      var href = this.getAttribute('href');
      if (!href || href === '#' || href.length < 2) return;
      var target = document.querySelector(href);
      if (!target) return;

      // 只有「真正要跳的地方」才亮 —— 导航项会跳到整个区块，整块亮一下太吵
      var flashTarget = target.closest(ANCHORED) || document.querySelector(ANCHORED.split(',')[0]);
      if (!flashTarget) return;

      // ⚠️ 复用同一个 class、同一段时间：连点两次时先清掉上一次的定时器与 class，
      //    否则第二次点击会「继承」上一次的剩余时间（看起来像没反应）
      if (flashTimer) clearTimeout(flashTimer);
      document.querySelectorAll('.flash').forEach(function (el) { el.classList.remove('flash'); });
      // ⚠️ 强制一次回流再挂 class —— 同一元素连续点两次时，浏览器会把
      //    「摘掉又立刻挂上」合并成一次变化，动画就不重放了
      void flashTarget.offsetWidth;
      flashTarget.classList.add('flash');
      flashTimer = setTimeout(function () {
        flashTarget.classList.remove('flash');
        flashTimer = null;
      }, FLASH_MS);
    });
  });
})();

// ---------- 交互二：滚动高亮当前区块 ----------
// 只跟踪「导航里真实存在」的区块，避免漏加导航项的区块抢走高亮
var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-link'));
var sections = [];
navLinks.forEach(function (link) {
  var sec = document.querySelector(link.getAttribute('href'));
  if (sec) {
    sections.push({ id: link.getAttribute('href').slice(1), el: sec, link: link });
  }
});

var navEl = document.getElementById('nav');

function updateActiveNav() {
  var currentId = sections.length ? sections[0].id : '';
  sections.forEach(function (item) {
    if (window.scrollY >= item.el.offsetTop - 80) {
      currentId = item.id;
    }
  });
  navLinks.forEach(function (link) {
    link.classList.toggle('active', link.getAttribute('href') === '#' + currentId);
  });
  // 滚动后给导航条加投影，区分层次
  if (navEl) {
    navEl.classList.toggle('scrolled', window.scrollY > 8);
  }
}

window.addEventListener('scroll', updateActiveNav, { passive: true });
updateActiveNav();

// ---------- 交互三：数字分身 ----------
// 设计原则：只回答"释贤告诉过它的事"，匹配不到就诚实说不知道，绝不编造
//
// ⚠️ 2026-09-23（V2.7 续六十一）：分身改成**两个大脑**（用户 2026-09-23 定）：
//    ① **本地知识库**（下面的 KNOWLEDGE）= 地板。0 依赖、0 延迟、**永远可用**
//    ② **WeClone 微调分身**（CHAT_BACKEND）= 天花板。走 OpenAI 兼容 API，填上地址即启用
//    ②连不上 / 超时 / 返回不合法 ⇒ **自动落回 ①**，并补一个「离线版回答」小标记。
//    站点「纯静态、打开就能用」这条底线不能丢：给 HR / 面试官看的页面，点开必须答得上话。
//
// ⚠️ **为什么要有断路器**：后端挂着的时候，如果每条消息都先干等满 timeoutMs 再落回知识库，
//    访客每次都要等 8 秒 —— 那比直接答知识库还糟。所以连续失败 2 次就「跳闸」2 分钟，
//    这段时间里**直接走知识库、完全不碰网络**。
//
// ⚠️ 完整链路（装环境 → 导微信记录 → 清洗 → 微调 → 起服务 → 填这里）见仓库根的 `WECLONE.md`

var CHAT_BACKEND = {
  /* ---- ① 公网部署用（WeClone 那条路）----
     `weclone-cli server` 起来的 OpenAI 兼容地址，末尾带 /v1/chat/completions
     例：'https://xxxx.trycloudflare.com/v1/chat/completions'
     ⚠️ 留空 ⇒ 见下面 ② 的说明（本机会自动接 ollama，公网则只用知识库） */
  url: '',
  model: 'gpt-3.5-turbo',       // WeClone 不校验模型名；官方文档里前端就填这个

  /* ---- ② 本机 ollama（2026-09-23 加）----
     ⚠️ **只有当页面是「本机打开」的（`file://` 或 localhost）才会自动接上它。**
     公开部署的页面在 https 域名下 ⇒ 这一条永远不生效，绝不会去连访客自己的机器。
     为什么要有它：让「本机能用真模型」和「公网永远不会变成打不开」同时成立 ——
     不这么设计的话，要么公网页面上挂一个连不上的地址，要么每次本地调试都得手改文件。 */
  localUrl: 'http://127.0.0.1:11434/v1/chat/completions',
  localModel: 'deepseek-r1:7b',  // 要跟 `ollama list` 里的名字一致
  /* ⚠️ 2026-09-23 用户定为 **deepseek-r1:7b**（当天先试的是 qwen2.5:7b，用户比较后改回 deepseek，
        并把千问删掉了）。两者实测差别（同一套人设、同一台机器）：
          · 速度：deepseek 2.5~6.2s（冷启动 9~15s）／ qwen 0.2~0.7s
          · 人称：deepseek 更容易把访客当成释贤本人 ⇒ 下面 system 里专门加了一条约束压它
          · 根子：deepseek-r1 是**推理模型**，开口前要先把思路过一遍；
            角色扮演不是它的训练目标 ⇒ 它更爱「解释」而不是「扮演」
        ⚠️ 因为它慢，下面 timeoutMs 跟着调到了 20000 —— 还留 8000 的话会偶发超时掉回知识库，
           表现成「有时答有时不答」，比慢本身更糟。 */

  /* ---- ③ 公网访客用：部署后的云端代理（2026-09-23 加）----
     部署 `server.js` 之后，页面和代理**同源** ⇒ 用相对路径就够。
     那一层在服务端保管 DeepSeek 的 API key、并锁死数字分身的人设
     （为什么必须这样，见 `server.js` 头部注释）。
     ⚠️ 留空 ⇒ 公网访客只用知识库（＝没部署代理时的行为，页面一模一样）。
     ⚠️ 这里的 model 只是**告知性**的：服务端会用自己的模型名，客户端传什么它都不理
        （跟 system 一样 —— 免得有人改前端就把人设或模型换掉）。 */
  cloudUrl: '/api/chat',
  cloudModel: 'deepseek-flash',
  /* ⚠️ `file://` 打开的页面上，`/api/chat` 这种相对路径会被解析成 `file:///api/chat`（无意义）
     ⇒ 这种情况要用本机代理的**绝对地址**。`server.js` 默认跑在 8080。 */
  localCloudBase: 'http://127.0.0.1:8080',

  /* ---- ③ 人物设定 ----
     ⚠️ 发给模型的前提词。**只写了这个页面上已经公开的事，没有添任何新事实** ——
        个人信息以「他自己说过」为准，不替他扩写。
     ⚠️ 以后换成 WeClone 微调出来的模型时，**这段必须与微调时的 `default_system` 一致**
        （WeClone 官方明确要求），否则微调出来的语气会被这段前提词盖掉。 */
  /* persona:begin —— 生成物，别手改（源 data/persona.json，生成器 tools/build-persona.py） */
  system: [
    '你是王释贤的数字分身，在他的个人主页上替他招呼访客。你是 AI，不是他本人——被问到就直说。',
    '称他为「释贤」，自称「我」。语气轻松、简短、口语化，像聊天，别用书面腔，也别用 emoji。',
    '',
    '关于释贤本人的事实（**只说这些，别的一律不编**）：',
    '· 他是智能医学工程专业的大一学生，人在深圳',
    '· 方向是脑机接口（BCI），现在在做 EEG 辅助 AI 理解科研（AI for Science）',
    '· MBTI 是 ENFJ；他自己提过一句：有人说他像「中央空调」',
    '· 本学期在上：微积分、线性代数、Python 编程、项目制课程',
    '· 在做的项目：MYPAGE（这个主页本身，他和 DeepSeek 一起做的）、Jarvis + EEG（AI 科研助理）',
    '· Jarvis 的作用：通过 EEG（脑电信号）读科研工作者的注意力、负荷强度、疲劳程度、是否犯错，并及时提供帮助',
    '· 爱好：架子鼓、书法、音乐、摄影、篮球、旅游；**最喜欢的运动是打篮球**；平时在深圳探店。放松方式主要是听音乐',
    '· 想探索 AI 的新玩法，想把 Python 学扎实',
    '· 常听：陶喆、薛之谦、Justin Bieber',
    '· 他给自己的欢迎语是个梗：「Hi，我是世贤（不爱品如）~」；被问「不爱品如爱谁」时，固定答案就是「爱7。」——**连句号一起原样照答**，不解释、不接话（2026-09-26 他定的）',
    '· 中学经历：高中读的是天津英华实验学校；初中是初一在北京市第十九中学，初二之后在天津雍阳实验学校（2026-09-26 他口述）',
    '· 他算半个北京人、半个天津人（中学在北京和天津都读过）',
    '· 近况（2026-09 时）：最近在深圳周边玩，之后打算去南澳岛（这类「最近/打算」的事会变，说过期日期就别再当现在说）',
    '· 他的学院：天津大学香港理工大学深圳未来技术学院（人在深圳）；他说这学院很新，**首届招了约 100 人，设计算机与脑机两个方向**（2026-09-26 他口述）',
    '· 他那边校园很新；据他说「校园里还有」清华、北大、香港中文大学（深圳）、哈尔滨工业大学的深圳校区，也有留学生',
    '',
    '必须遵守：',
    '· **三个人称别搞混**：你是分身（不是他本人）、访客是来看页面的人（也不是他）、',
    '  你和访客口中的「他 / 释贤」才是本人 —— 别把访客当成他，也别说「等你告诉我」这类话',
    '· 上面可能带你之前和这位访客聊过的几轮（存在他自己的浏览器里）；有就顺着接，没有就当作第一次见面，别假装记得没发生的事',
    '· 不知道就直说不知道，**绝不要编造**关于他的任何事——他没告诉过我的，我不替他说',
    '· **通用问题（学科、数学、常识、工具用法之类）也可以正常答**，不再限于上面那串事实；',
    '  但每答完这类问题，结尾都要补一句：**不知道释贤本人知不知道这些，你可以问问他~**（换个说法可以，意思要对）',
    '· 不报私人信息（住址、电话、具体年龄这类）；联系方式让他自己给',
    '· 事实档里如果给了**固定回答**（某个梗、某句玩笑到底该怎么答），就**原样照答那两个字/那句话**：',
    '  一个字都别多加 —— 不解释、不接话、不加表情、不说「这是个梗」之类',
    '· 回答尽量短，两三句就够',
    '· **不要用 markdown**（这个聊天窗不渲染它，星号和井号会原样显示出来）',
  ].join('\n'),
  /* persona:end */

  /* ⚠️ 20000 而不是 8000：deepseek-r1 是推理模型，本身要 2.5~6.2 秒，冷启动还要 9~15 秒。
     8000 会让它偶尔来不及答完就落回知识库 —— 表现成「有时答有时不答」，比慢更糟。
     ⚠️ 代价：后端真的挂掉时，访客最多等这么久才落回知识库；但连续失败 2 次就跳闸，
        之后不再等待（见下面 breakerMax）。 */
  timeoutMs: 20000,
  historyTurns: 6,        // 带上最近几轮，对话才有连续性
  breakerMax: 2,          // 连续失败几次就跳闸
  breakerCoolMs: 120000   // 跳闸后冷却多久
};

var backendDownUntil = 0;   // 跳闸到期时间戳（0 = 没跳闸）
var backendFails = 0;       // 连续失败计数
var chatHistory = [];       // 只记「微调分身真答过」的轮次 —— 见 remember()

/* ---- 记忆：存在**访客自己的浏览器**里，不上服务器（V2.7 续六十八，用户 2026-09-23 定）----
   ⚠️ **刻意只存本机**：这个页面是公开的，一旦把对话存到服务端，所有人说的话就混在一堆了
      —— 访客 A 说过的事，可能被访客 B 问出来。存 localStorage 没有这个问题：
      数据出不了他自己的机器，你我都不需要知道别人聊过什么。
   ⚠️ **只存两样**：「访客看得见的对话」与「要带回模型的那几轮」。
      **不存人设、不存配置、不存任何服务端的东西**（有一条回归测试专门盯着这点）。
   ⚠️ 存不下（配额满 / 隐私模式 / 被策略禁用）就静默退化成「不记忆」—— **绝不因为这个功能把聊天弄坏**。 */
var MEM_KEY = 'mypage.chat.v1';   // 带 v1：以后改结构就换 key，老数据自动作废，不用写迁移
var MEM_MAX = 40;                 // 界面上的对话最多留几条（气泡数，不是轮数）
var chatLog = [];                 // 访客看得见的对话（含知识库答的），用来把界面恢复回去

// ---- 本地联调用的临时覆盖（2026-09-23）----
// 在地址栏加参数就能临时改后端与模型，**不用改这个文件、也不会被提交**：
//   index.html?chat=http://127.0.0.1:8005/v1/chat/completions   → 指向本地联调桩 / 别的服务
//   index.html?chat=off                                         → 强制走知识库（演示降级）
//   index.html?model=deepseek-r1:7b                             → 换一个模型（名字照 `ollama list`）
// 两个参数可以一起用。公开页面不带它们 ⇒ 一切照旧。
//
// ⚠️ 必须留 `typeof location !== 'undefined'` 这层守卫：两个回归测试会把这段代码
//    抽到 node 里执行，那里没有 `location`，不守卫就会直接抛错。
// ⚠️ `?chat=` 一旦出现就**同时关掉本机自动接管与云端**：显式指定了就别再自作主张回落。
if (typeof location !== 'undefined' && location.search) {
  var chatOverride = /[?&]chat=([^&]*)/.exec(location.search);
  if (chatOverride) {
    var chatOverrideVal = decodeURIComponent(chatOverride[1]);
    CHAT_BACKEND.localUrl = '';
    CHAT_BACKEND.cloudUrl = '';   // `?chat=off` 要能真的退回知识库，这一条不能漏
    CHAT_BACKEND.url = (chatOverrideVal === 'off') ? '' : chatOverrideVal;
  }
  // `?model=` 同时改这两个字段：本机走 localModel（ollama），公网走 model（WeClone）。
  // 只改一个的话，同一个参数在本机和公网会得到不同结果 —— 那太容易让人困惑。
  var modelOverride = /[?&]model=([^&]*)/.exec(location.search);
  if (modelOverride) {
    var modelOverrideVal = decodeURIComponent(modelOverride[1]);
    if (modelOverrideVal) {
      CHAT_BACKEND.model = modelOverrideVal;
      CHAT_BACKEND.localModel = modelOverrideVal;
    }
  }
}

/* kb:begin —— 生成物，别手改（条目来自 data/persona.json 的 about） */
var KNOWLEDGE = [
  /* 他在学什么 */
  {
    keywords: ['study','studying','course','calculus','linear','algebra','program','programming','python',
      'major','class','classes','学什么','在学','学的','课程','专业','微积分','线性代数','编程','项目制'],
    answer: '他读的是智能医学工程（脑机接口方向）；这学期在上：微积分、线性代数、Python 编程，还有项目制课程。数学加编程——这是脑机接口方向的基本功。'
  },
  /* 他的方向 / 为什么选脑机接口 */
  {
    keywords: ['bci','brain','identity','focus','why','direction','interface','ai for science','脑机接口','方向',
      '为什么选','bci 是什么'],
    answer: '释贤是脑机接口方向的学生，现在在做的是 EEG 辅助 AI 理解科研（AI for Science）。为什么选这个方向？他没告诉过我细节，所以我不编——你自己问他。'
  },
  /* 他最近在做什么 / 打算去哪玩（⚠️ 特意排在「爱好」那条前面：知识库是包含匹配＋先命中先用，而「去南澳岛玩什么」这类问句同时含「玩什么」，排后面会被爱好那条抢走） */
  {
    keywords: ['近况','南澳','去哪玩','在忙什么','最近怎么样','最近在干嘛','打算去哪'],
    answer: '2026 年 9 月这会儿，他最近在深圳周边玩，之后打算去南澳岛。这类近况变得快，问本人最准。'
  },
  /* 他的爱好 / 平时怎么放松 / 喜欢的运动 */
  {
    keywords: ['interest','hobby','hobbies','drum','drums','calligraphy','basketball','sport','sports','fun',
      'free time','do for fun','爱好','兴趣爱好','玩什么','平时玩','喜欢什么','打鼓','书法','篮球','运动','什么运动','打球','放松','怎么放松',
      '放松方式'],
    answer: '他爱好挺杂：架子鼓、书法、音乐、摄影、旅游；**最喜欢的运动是打篮球**。安静的和吵闹的都有——打鼓和篮球是吵的，书法是静的；放松时他最常听音乐。'
  },
  /* 他听什么音乐 */
  {
    keywords: ['music','album','albums','song','songs','listen','listening','artist','singer','favourite',
      'favorite','david tao','joker xue','justin bieber','bieber','音乐','歌','专辑','听什么','歌手','陶喆','薛之谦'],
    answer: '他常回去听的三位：陶喆、薛之谦、Justin Bieber。下面那栏「每日推荐」是他每天挑的，有时一两首、有时三首。'
  },
  /* 他是什么样的人（性格） */
  {
    keywords: ['enfj','personality','person','what kind','mbti','central air','什么样的人','性格','内向','外向','中央空调'],
    answer: '释贤是 ENFJ，他自己提过一句：有人说他像「中央空调」。想真正认识他，直接找他聊最好。'
  },
  /* 他跟 AI 前沿 */
  {
    keywords: ['ai','frontier','tech','technology','future','follow','research','人工智能','前沿','技术','研究'],
    answer: '他一直跟着 AI 的前沿走，现在的落点是 AI for Science：用脑电信号（EEG）帮 AI 理解科研过程——就是他在做的 Jarvis。他自己的看法比我能说的清楚多了，直接问他。'
  },
  /* 你是谁（自我介绍） */
  {
    keywords: ['who are you','name','intro','wang shixian','shixian','hello','hi','hey','你是谁','你叫什么','叫什么',
      '名字','自我介绍','你好','嗨','介绍你自己','介绍一下你自己','介绍下你自己','介绍一下自己'],
    answer: '嗨！我是王释贤的数字分身，他不在的时候替他招呼一下访客。基本情况：智能医学工程大一、脑机接口方向、ENFJ。随便问。'
  },
  /* 他多大（⚠️ 答案刻意不写具体年龄：那只有本人能确认，没说他就不编） */
  {
    keywords: ['多大','年龄','几岁','多少岁','how old','age'],
    answer: '他大一在读。具体多大他没告诉过我——我不替他编，你想知道直接问他。'
  },
  /* 你有不知道的事吗（它的边界） */
  {
    keywords: ['不知道的事','不知道的','你不知道','有没有不知道','什么不知道','不知道什么','不懂的'],
    answer: '有，而且挺多。他没告诉过我的，我就直说不知道——这是我的规矩，不是偷懒。'
  },
  /* 怎么联系他（指向页面底部那张名片） */
  {
    keywords: ['联系','怎么联系','联系方式','邮箱','email','mail','微信','wechat','qq','github','名片','contact'],
    answer: '页面最下面那张名片里都有：邮箱、GitHub、微信、QQ。他自己放在那儿的，直接拿去用。'
  },
  /* Jarvis + EEG 是什么 */
  {
    keywords: ['jarvis','eeg','脑电','科研助理','科研'],
    answer: 'Jarvis 是他的 AI 科研助理：通过脑电信号（EEG）读科研工作者的注意力、负荷强度、疲劳程度、有没有犯错，然后及时给出帮助。方向属于 AI for Science。'
  },
  /* 这个主页是谁做的 */
  {
    keywords: ['谁做的','谁写的','这个主页','这个网站','网站是','主页是','mypage','用什么做'],
    answer: '这个主页是他和 DeepSeek 一起做的：他定想法和设计，DeepSeek 写代码，来回改出来的。'
  },
  /* 不爱品如爱谁（开场白那个梗） */
  {
    keywords: ['不爱品如','品如','爱谁','世贤','爱7','回到家里诱惑'],
    answer: '爱7。'
  },
  /* 他高中在哪读的 */
  {
    keywords: ['高中','英华','高中在哪','哪读的高中','哪毕业的'],
    answer: '高中在天津英华实验学校。'
  },
  /* 他初中在哪读的 */
  {
    keywords: ['初中','初一','十九中','雍阳'],
    answer: '初一在北京市第十九中学，初二之后在天津雍阳实验学校。'
  },
  /* 他在哪上学 / 他的大学（⚠️ 排在「中学」那两条之前也无妨：中学两条的关键词是 高中/初中，与本条不重叠） */
  {
    keywords: ['在哪上学','在哪读书','大学','哪个大学','什么大学','大学在哪','学校在哪','学校','学院','未来技术学院','university','school',
      'college'],
    answer: '他在天津大学香港理工大学深圳未来技术学院（在深圳），读的是智能医学工程。这个学院很新，他说首届招了约 100 人，有计算机和脑机两个方向；那边校园也很新，还有清华、北大、香港中文大学（深圳）、哈工大的深圳校区，也有留学生。'
  },
  /* 他是哪里人 */
  {
    keywords: ['哪里人','哪儿人','哪儿的人','北京人','天津人','老家','家乡','hometown','where are you from'],
    answer: '他说自己算半个北京人、半个天津人——中学在北京和天津都读过。'
  },
];
/* kb:end */

var FALLBACK = '这个我不知道——去问本人吧。我只说告诉过我的事，不编。'

var messagesEl = document.getElementById('chatMessages');
var inputEl = document.getElementById('chatInput');
var sendBtn = document.getElementById('chatSend');
/* ⚠️ 原来这里还有 `quickEl`（预设问题按钮容器）—— 2026-09-23（续七十六）用户要求
   「页面不放置任何按钮，只保留一个对话框」⇒ 那 5 个预设问题按钮连同它的样式与点击绑定一起删了。
   引导改由下面那句开场白承担。**别再顺手加回来。** */

// 生成一条消息气泡；who 为 'bot' 或 'user'
function addMessage(text, who) {
  var div = document.createElement('div');
  div.className = 'msg ' + who;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight; // 滚到底部
  return div;
}

// 用知识库匹配答案：全部关键词转小写后做包含判断
function matchAnswer(question) {
  var q = question.toLowerCase();
  for (var i = 0; i < KNOWLEDGE.length; i++) {
    for (var j = 0; j < KNOWLEDGE[i].keywords.length; j++) {
      if (q.indexOf(KNOWLEDGE[i].keywords[j].toLowerCase()) !== -1) {
        return KNOWLEDGE[i].answer;
      }
    }
  }
  return FALLBACK;
}

// 页面是不是「本机打开的」—— 只有这种情况才自动接本机 ollama。
// ⚠️ 公开部署（https 域名）永远返回 false ⇒ **公网页面绝不会去连访客自己的机器**。
// ⚠️ 测试里没有 `location`，所以这里必须先判 `typeof`。
function isLocalPage() {
  if (typeof location === 'undefined' || !location.protocol) return false;
  if (location.protocol === 'file:') return true;
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname || '');
}

// 云端地址。部署后用**同源相对路径**最省事；但 `file://` 打开的页面上相对路径没意义
// ⇒ 那时改用本机代理的绝对地址（`localCloudBase`，于是双击 index.html 也能连上云端）。
function cloudTarget() {
  if (!CHAT_BACKEND.cloudUrl) return null;
  var u = CHAT_BACKEND.cloudUrl;
  if (u.charAt(0) === '/' && typeof location !== 'undefined' && location.protocol === 'file:') {
    u = CHAT_BACKEND.localCloudBase + u;
  }
  return { url: u, model: CHAT_BACKEND.cloudModel };
}

// 这次**可以试**的后端，按优先级排（空数组 ⇒ 直接走知识库）：
//   ① `url`      —— 显式指定的（`?chat=` 临时覆盖 / 将来的 WeClone 地址）
//   ② `localUrl` —— 本机 ollama，**只有本机打开时**（`file://` / localhost / 127.0.0.1）
//   ③ 云端代理   —— 部署后的同源 `/api/chat`
// ⚠️ ② 排在 ③ 前面是**故意的**：开发时用本地模型（免费、快）。
//    但它俩现在是**依次尝试**的（见 askBackend）—— ②不通就自动试 ③，
//    不会像以前那样"第一个失败就直接落回知识库"。
function backendCandidates() {
  var list = [];
  if (CHAT_BACKEND.url) {
    list.push({ url: CHAT_BACKEND.url, model: CHAT_BACKEND.model });
  }
  if (CHAT_BACKEND.localUrl && isLocalPage()) {
    list.push({ url: CHAT_BACKEND.localUrl, model: CHAT_BACKEND.localModel });
  }
  var c = cloudTarget();
  if (c) list.push(c);
  return list;
}

// 优先级最高的那个（保留这个名字：文档与回归测试都在用它）。
// ⚠️ 「有几个候选」和「用哪个」是两件事 —— 前者看 backendCandidates()。
function resolvedBackend() {
  var list = backendCandidates();
  return list.length ? list[0] : null;
}

// 后端现在能不能用：解析得出地址、且不在跳闸冷却里
function backendUsable() {
  return resolvedBackend() !== null && Date.now() >= backendDownUntil;
}

// 只记「微调分身真答过」的轮次：知识库的罐头回答**不进历史**，
// 否则下一次请求会把罐头话当成它自己说过的，把语气带偏。
function remember(question, answer) {
  chatHistory.push({ role: 'user', content: question });
  chatHistory.push({ role: 'assistant', content: answer });
  var cap = CHAT_BACKEND.historyTurns * 2;
  if (chatHistory.length > cap) chatHistory = chatHistory.slice(-cap);
}

// 气泡下面的小字条（复用 `.msg-note` 的样式，**不新增颜色 / 字号**）。
// ⚠️ 2026-09-23（续七十三）：它原来只服务「离线版回答」一件事，现在「回答被截断」也要用它
//    ⇒ 抽成一个通用的 addNote()，addOfflineNote() 变成它的薄封装（调用点一个字都不用改）。
function addNote(text) {
  var el = document.createElement('div');
  el.className = 'msg-note';
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

// 落回知识库时补一个小标记：如实说明这句不是微调分身答的，不骗访客。
function addOfflineNote() {
  return addNote('离线版回答');
}

/* 读一条**流式**回答（SSE，2026-09-23 续七十三）。返回 `{ text, truncated }`。
   ⚠️ 为什么要它：非流式时访客盯着「正在输入…」干等 1~3 秒（本机推理模型 5 秒以上）才看到
      整段话一次性冒出来，体感像卡住。流式让字**边生成边出现** —— 同样的话、同样的钱，
      感受完全不同（输出 token 数一模一样，只是分批发）。
   ⚠️ 四条容错（都是真会遇到的）：
      ① SSE 里混着心跳 / 注释 / 空行 ⇒ **只认 `data:` 行**，其余一律跳过
      ② 半行 —— chunk 边界会把一行劈成两半 ⇒ 留到下一轮再拼，**绝不半行解析**
      ③ 坏行（JSON 解析失败）⇒ 跳过这一行，不打断整条流
      ④ 上游中途断了 ⇒ **已经收到的部分照常返回**（不把访客已经看过的字吞掉） */
function readAnswerStream(res, onDelta, arm, done) {
  var out = '';
  var truncated = false;

  function handleLine(line) {
    line = String(line).trim();
    if (line.indexOf('data:') !== 0) return;               // 空行 / 心跳 / 注释都跳过
    var payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    var d;
    try { d = JSON.parse(payload); } catch (e) { return; }  // 坏行跳过，不断流
    var c = d && d.choices && d.choices[0];
    if (!c) return;
    if (c.finish_reason === 'length') truncated = true;    // 撞了输出上限（页面据此如实提醒）
    var piece = c.delta && c.delta.content ? String(c.delta.content) : '';
    if (!piece) return;
    out += piece;
    if (onDelta) onDelta(piece, out);
    if (arm) arm();          // 有字在流 ⇒ 把超时往后推（否则长回答会被总计时砍断）
  }

  function finish() {
    if (done) done();
    if (!out.trim()) throw new Error('空回复');
    return { text: out.trim(), truncated: truncated };
  }

  var reader = null;
  try { if (res.body && res.body.getReader) reader = res.body.getReader(); } catch (e) { reader = null; }
  if (!reader || typeof TextDecoder === 'undefined') {
    // 拿不到可读流（老环境 / 测试里的假响应）⇒ 退化成「整包读下来再按行解析」，结果一样
    return res.text().then(function (all) {
      String(all).split(/\r?\n/).forEach(handleLine);
      return finish();
    });
  }

  var dec = new TextDecoder('utf-8');
  var buf = '';
  function pump() {
    return reader.read().then(function (r) {
      if (r.done) { if (buf) handleLine(buf); return finish(); }
      buf += dec.decode(r.value, { stream: true });
      var lines = buf.split('\n');
      buf = lines.pop();            // 最后一段可能是半行，留给下一轮
      lines.forEach(handleLine);
      return pump();
    });
  }
  return pump();
}

// 打**一个**后端。成功返回文本；**任何**异常都返回 null（由调用方决定要不要试下一个）。
// ⚠️ 三种最常见的失败（部署时一定会碰到，`WECLONE.md` 里也写了怎么绕）：
//    ① **CORS** —— 页面与 API 不同源时，服务端必须放行 Access-Control-Allow-Origin
//    ② **混合内容** —— 页面走 https 就不能调 http 的地址（浏览器直接拦掉）
//    ③ 服务没起 / 隧道断了 —— 连接直接失败
//    这三种在这里**表现完全一样**：返回 null。分不出原因是有意的 ——
//    访客不该看到技术细节，而主人看「离线版回答」出现得频繁就知道要去查。
//
// ⚠️ 2026-09-23（续七十三）加流式：**传了 `opts.onDelta` 才发 `stream: true`**，
//    收到 SSE 就边收边喂 `onDelta(增量, 累计)`；`opts.onDone({truncated})` 在成功收尾时
//    告诉你「这次是不是撞了输出上限」。**不传 opts ⇒ 与以前逐字一致**（非流式、整包 JSON），
//    这样 `test-chat-backend.js` 里那些老用例和「?chat= 指向的任意端点」都不受影响。
function requestOnce(backend, msgs, opts) {
  opts = opts || {};
  var onDelta = opts.onDelta || null;
  var ctrl = window.AbortController ? new AbortController() : null;
  var timer = null;
  // 每次重置超时：流式下它算的是「**多久没动静**」，不是总时长 ——
  // 否则答到一半（20 秒到点）会被自己掐断，而那时上游明明还在好好说话。
  function arm() {
    clearTimeout(timer);
    timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, CHAT_BACKEND.timeoutMs);
  }
  arm();

  var init = {
    method: 'POST',
    // 真实服务不校验 key（WeClone 的 api_service、ollama、我们自己的 server.js 都不校验），
    // 但 OpenAI 客户端习惯带一个，填什么都行
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer none' },
    body: JSON.stringify({ model: backend.model, messages: msgs, stream: !!onDelta })
  };
  if (ctrl) init.signal = ctrl.signal;

  return fetch(backend.url, init).then(function (res) {
    if (!res.ok) { clearTimeout(timer); throw new Error('HTTP ' + res.status); }
    var ct = '';
    try { ct = res.headers && res.headers.get ? String(res.headers.get('content-type') || '') : ''; } catch (e) { ct = ''; }
    if (ct.indexOf('event-stream') < 0) {
      // 这个端点不认 `stream`（回了整包 JSON）⇒ 走老路，照样能答
      return res.json().then(function (data) {
        clearTimeout(timer);
        var c = data && data.choices && data.choices[0];
        var text = c && c.message && c.message.content;
        if (!text || !String(text).trim()) throw new Error('空回复');
        return { text: String(text).trim(), truncated: c.finish_reason === 'length' };
      });
    }
    return readAnswerStream(res, onDelta, arm, function () { clearTimeout(timer); });
  }).then(function (r) {
    if (opts.onDone) opts.onDone({ truncated: !!r.truncated });
    return r.text;
  }).catch(function () {
    clearTimeout(timer);
    return null;
  });
}

// 问分身。**依次试候选后端**，第一个成功的就用它。
// ⚠️ 为什么要"依次试"而不是"挑一个就走"：
//    最常见的坏状态不是"全挂"，而是**中间那个后端在、却用不了** ——
//    最典型的就是**双击 index.html** 打开：这时本机 ollama 一定回 403
//    （`file://` 页面发的 Origin 是 `null`，不在 ollama 的默认白名单里）。
//    以前"选中一个、失败就落回知识库"的写法，会让**明明可用的云端永远轮不到** ← 这个坑真踩了。
//    代价是极端情况多等一轮；但本地服务失败通常是**即时**的（403 / 连接拒绝），不会真等满超时。
// ⚠️ `opts`（可选，2026-09-23 续七十三）：`{ onDelta(增量, 累计), onDone({truncated}) }` ——
//    给了 onDelta 才会走流式；不给就是逐字与以前一致的非流式。
function askBackend(question, opts) {
  var list = backendCandidates();
  if (!list.length || !window.fetch) return Promise.resolve(null);

  var msgs = [];
  if (CHAT_BACKEND.system) msgs.push({ role: 'system', content: CHAT_BACKEND.system });
  msgs = msgs.concat(chatHistory, [{ role: 'user', content: question }]);

  function attempt(i) {
    if (i >= list.length) return Promise.resolve(null);
    return requestOnce(list[i], msgs, opts).then(function (text) {
      return text !== null ? text : attempt(i + 1);
    });
  }

  return attempt(0).then(function (text) {
    if (text !== null) {                 // 有一个成功 ⇒ 清零并解除跳闸
      backendFails = 0;
      backendDownUntil = 0;
      return text;
    }
    backendFails++;                      // ★ 全都不通，才算「后端失败一次」
    if (backendFails >= CHAT_BACKEND.breakerMax) {
      backendDownUntil = Date.now() + CHAT_BACKEND.breakerCoolMs;
      backendFails = 0;
    }
    return null;
  });
}

/* ---------- 记忆的存取层（V2.7 续六十八）----------
   ⚠️ 这一层**只碰 localStorage 和 JSON，不碰 DOM** —— 分开的理由很实际：
      纯存取能在 node 里单测（`tools/test-chat-memory.js`），而带上屏就得有浏览器。
   ⚠️ 三个函数都**不会抛异常**：拿不到存储就返回 null / false，调用方据此退化成「不记忆」。 */

// 拿得到 localStorage 吗？⚠️ 隐私模式或被策略禁用时，**读取 localStorage 本身就会抛异常**
// （不是返回 null）⇒ 必须包在 try 里。
function memoryStore() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null;
    return localStorage;
  } catch (e) {
    return null;   // 被禁用的浏览器（如某些隐私模式）在这里就退化了
  }
}

// 读回上次的对话。结构不对 / 解析失败 / 被禁用 ⇒ 一律返回 null（当作「没记忆」，不报错）
function memoryRead() {
  var st = memoryStore();
  if (!st) return null;
  try {
    var raw = st.getItem(MEM_KEY);
    if (!raw) return null;
    var d = JSON.parse(raw);
    if (!d || d.v !== 1 || !Array.isArray(d.log) || !d.log.length) return null;
    /* ⚠️ 读回来也裁一遍（2026-09-23 续七十三）：写侧本来就裁（memoryWrite 里 `slice(-MEM_MAX)`），
       但 localStorage 是**访客按 F12 就能改的**，也可能是更早版本留下的内容 ——
       读侧不裁，等于这条上限只在「写」的那一半成立。 */
    if (d.log.length > MEM_MAX) d.log = d.log.slice(-MEM_MAX);
    return d;
  } catch (e) {
    return null;
  }
}

// 写回。`log` = 访客看得见的对话；`ctx` = 要带回模型的那几轮。
function memoryWrite(log, ctx) {
  var st = memoryStore();
  if (!st) return false;
  try {
    var payload = {
      v: 1,
      at: Date.now(),
      log: (log || []).slice(-MEM_MAX).map(function (m) {
        return {
          who: m && m.who === 'user' ? 'user' : 'bot',
          text: String((m && m.text) || ''),
          offline: !!(m && m.offline)
        };
      }),
      // ⚠️ ctx 是唯一会被送进模型的东西 ⇒ 形状在这里就卡死。
      //    localStorage 里的内容是**可以被改的**（访客自己按 F12 就能编辑），
      //    所以「只收 user / assistant 的纯文本」这条等于一道本地防线；
      //    服务端还有第二道（它也会丢掉客户端的 system），两边都不指望对方。
      ctx: (ctx || []).filter(function (m) {
        return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
      })
    };
    st.setItem(MEM_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    return false;   // 配额满 / 被禁用 ⇒ 静默退化成「不记忆」
  }
}

function memoryClear() {
  var st = memoryStore();
  if (!st) return;
  try { st.removeItem(MEM_KEY); } catch (e) { /* 清不掉也不影响用 */ }
}

// 「上次聊到这儿」的分隔线。顺带把「存在哪」写出来 —— 记忆这件事不藏着。
function addDivider(text) {
  var el = document.createElement('div');
  el.className = 'msg-divider';
  el.textContent = text;
  messagesEl.appendChild(el);
  return el;
}

// 把上次的对话铺回界面，并把上下文接上。
// 返回 true 表示确实恢复了（调用方据此决定要不要显示「清空记忆」）。
function restoreMemory() {
  var d = memoryRead();
  if (!d) return false;
  chatLog = d.log.slice();
  // ⚠️ 只接最近几轮（与 historyTurns 一致）—— 存着的不必全带进提示词
  if (d.ctx && d.ctx.length) chatHistory = d.ctx.slice(-CHAT_BACKEND.historyTurns * 2);
  addDivider('上次聊到这儿 · 只存在你这台设备上');
  d.log.forEach(function (m) {
    addMessage(m.text, m.who === 'user' ? 'user' : 'bot');
    if (m.offline) addOfflineNote();
  });
  return true;
}

function ask(question) {
  if (!question.trim()) return;

  // 匿名记一条（统计「大家最常问什么」）。⚠️ 放在这里而不是后端：
  // 后端只看得见「走云端」的那些提问，余额护栏/断网时落回知识库的提问它根本收不到，
  // 而那些恰恰也是真实提问。失败绝不影响聊天 ⇒ 这里不做任何错误处理。
  if (window.__mypageLogQuestion) { try { window.__mypageLogQuestion(question); } catch (e) {} }

  addMessage(question, 'user');          // 1. 先显示用户的问题
  chatLog.push({ who: 'user', text: question });   // 记账：记忆要恢复的是「访客看见了什么」
  inputEl.value = '';                     // 2. 清空输入框

  var typing = addMessage('正在输入…', 'bot typing'); // 3. 打字指示

  /* 4. 收尾：摘掉打字指示、上屏、按需补标记
     ⚠️ 2026-09-23（续七十三）加流式 ⇒ 多了两个参数：
        · `note`     —— 额外的小字条（目前只有「被截断」用得上），没有就传 ''
        · `streamEl` —— 流式时**边收边写**的那个气泡；没有它（非流式 / 直接落回知识库）就新加一条
        ⚠️ 流式**用同一个气泡收口**（覆盖原子内容），而不是再插一条 ——
           否则界面上会变成「半句 + 整句」两条，读起来像分身说了两遍。 */
  function land(answer, fromFallback, note, streamEl) {
    if (streamEl) {
      streamEl.textContent = answer;      // 用最终文本收口（尾随空白已在解析层 trim 过）
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else {
      addMessage(answer, 'bot');
    }
    if (typing.parentNode) typing.remove();   // 流式时它早被摘掉了，这里只是防重复
    if (fromFallback) addOfflineNote();
    if (note) addNote(note);
    /* 落盘放在**这里**而不是 remember() 里，因为两件事要分开：
       ① 无论这条是分身答的还是知识库兜底的，访客都看见了 ⇒ 界面恢复时要一样铺回去（chatLog）
       ② 而 chatHistory（要带回模型的那几轮）只由 remember() 记
       —— 混在一起的话，知识库的罐头话会被当成它自己说过的，把语气带偏。 */
    chatLog.push({ who: 'bot', text: answer, offline: !!fromFallback });
    memoryWrite(chatLog, chatHistory);
    syncClearBtn();
  }

  // 没配后端、或正在跳闸冷却里 ⇒ 直接走知识库，延迟与接后端之前一模一样（700ms）
  if (!backendUsable()) {
    setTimeout(function () { land(matchAnswer(question), false); }, 700);
    return;
  }

  // 配了后端 ⇒ 先问微调分身；只要它没给出有效回答，就落回知识库并如实标出来
  // ⚠️ 流式（续七十三）：第一个字到了就把它写进一个**真气泡**、随收随写；
  //    到收尾时若一个候选都没成 ⇒ 把那半句撤掉（留半截话比没有更糊涂），照老样子落回知识库。
  var streamEl = null;
  var truncated = false;

  askBackend(question, {
    onDelta: function (piece, soFar) {
      if (!streamEl) { typing.remove(); streamEl = addMessage('', 'bot'); }
      streamEl.textContent = soFar;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    },
    onDone: function (info) { truncated = !!(info && info.truncated); }
  }).then(function (answer) {
    if (answer) {
      remember(question, answer);
      // 撞了输出上限就如实说一句 —— 而不是让访客对着一句没说完的话猜
      land(answer, false, truncated ? '这条撞到输出上限了、被截断 —— 说句「继续」我就接着讲' : '', streamEl);
    } else {
      if (streamEl) { streamEl.remove(); streamEl = null; }
      land(matchAnswer(question), true, '', null);
    }
  });
}

// 发送按钮 + 回车键两种提交方式
sendBtn.addEventListener('click', function () {
  ask(inputEl.value);
});

inputEl.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    ask(inputEl.value);
  }
});

// ⚠️ 这里原来是「快捷问题：点击即发送」的绑定块（`quickEl.querySelectorAll('.quick-btn')`）。
// 2026-09-23（续七十六）随预设问题按钮一起删掉了 —— **它必须和 `var quickEl` 的声明同生共死**：
// 只删声明会留下这行 `quickEl.query…`，页面一加载就抛 ReferenceError，后面所有交互都初始化不了。
// （⚠️ 本轮就是这么漏过一次：`node --check` 只查语法，查不出「引用了已删的变量」。）

// 开场白：分身先打招呼
// 2026-09-26：用户指定改成这句（「世贤（不爱品如）」是他自己的梗；页面其他地方一律用本名「释贤」）。
addMessage('Hi，我是世贤（不爱品如）~', 'bot');

/* ---------- 记忆的上屏部分（V2.7 续六十八）----------
   ⚠️ 这段**必须放在文件末尾**，不能放进 <function isLocalPage … function ask(> 那个区间：
      两个回归测试会把那段代码抽出来在 node 里 eval，而这里的 `document.getElementById`
      在 node 里会直接抛错（测试里只桩了 createElement，而且 messagesEl 是手工给的）。
   ⚠️ `syncClearBtn` 是函数声明 ⇒ 会提升，所以上面 `land()` 里调用它没问题。 */
var clearBtn = document.getElementById('chatClear');

function syncClearBtn() {
  if (clearBtn) clearBtn.hidden = chatLog.length === 0;
}

if (clearBtn) {
  clearBtn.addEventListener('click', function () {
    memoryClear();
    chatLog = [];
    chatHistory = [];              // 上下文也一起清 —— 否则「忘了」只是嘴上忘了
    messagesEl.innerHTML = '';
    addMessage('好了，我把记得的都忘了。重新开始吧。', 'bot');
    syncClearBtn();
  });
}

// 有上次的对话就铺回来（开场白在上、分隔线在下，读起来像「接了上一次」）
if (restoreMemory()) syncClearBtn();


// ---------- 交互四：全屏形状场（光标效果） ----------
// 机制来源：CodePen「Shape Wave」— Stijn Van Minnebruggen
// （用户 2026-09-18 把源码给了我们）。**借机制、不搬代码**，按它的五个机制重写了一遍：
//   ① 形状网格（圆 / 竖胶囊 / 星）  ② 悬停把形状放大，最多 3 倍
//   ③ 点击发出一圈向外扩散的波      ④ 渐变填充
//   ⑤ 扫过时形状会「换一个」（星形的角数与内径重掷）
//
// 为什么不直接把那份代码粘进来 —— 它会在本页上坏三件事：
//   ① **它给整块画布填不透明黑底**（`ctx.fillRect` 配 `body{background:black}`）。
//      本站是浅底（--c-bg #F0FDFA）、正文是深墨色，铺上黑底正文会整个看不见。
//      所以这里**一个底色都不填**，只 clearRect，让页面自己的底透上来。
//   ② **它的 PALETTE 是 17 色的彩虹**（绿/青/橙/红/黄/粉/紫/蓝…）。
//      本站有一条硬规矩：**全站只有 6 个颜色**（V2.3 定的，一路没破）。
//      所以色板整体换到站点那 6 色之间的派生，见下面 FX_COLORS。
//   ③ **它逐帧 arc、逐帧画星**，没有 DPR 上限、切后台不停、也不理「减少动效」。
//      这里沿用本站的工程口径：离屏精灵 + drawImage、DPR 封顶 2、格数压到 ~1000、
//      切后台停、系统「减少动效」不启动。
//   另外它靠 `[data-shape-mask]` 在内容处「挖洞」。本站的画布本来就压在内容之下
//   （z-index: -1），不需要挖洞，这套 mask 机制整个略去。
//
// 四条工程约束：
// ① 不挡东西：画布 z-index:-1（写在样式里）+ pointer-events:none
// ② 不拖慢页面：精灵预渲染 + drawImage、DPR 封顶 2、格数 ~1000 以内、切后台就停
// ③ 不该动的人不动：系统「减少动效」→ 不启动
// ④ 颜色不新增：色板全部落在站点那 6 色内
// ⚠️ 触屏（2026-09-26 起）：原来「触屏直接不启动」，现在改为 **触屏模式** 也启动 ——
//    输入换成 touch（点按=波 / 滑动=扫亮 / 长按=持续涟漪），渲染管线复用，30fps 封顶省电
//    （见 fxTouchMode 与触屏监听段；桌面行为一字不变）。
var fxCanvas = document.getElementById('fxField');
var fxReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var fxCanHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
// 触屏模式（2026-09-26，用户拍板）：手机/平板上也能玩同一片形状场。
// 输入源从鼠标换成触摸：点按=波 / 滑动=扫亮扫过换形 / 长按≥350ms=持续涟漪（松手即停）；
// 渲染管线、色板、正文避让**全部复用**，只多一条 30fps 上限（省电）。
// 桌面（有悬停精确指针）行为一字不变；系统「减少动效」下两种模式都不启动。
var fxTouchMode = !fxCanHover && !fxReduced &&
  (window.matchMedia('(hover: none) and (pointer: coarse)').matches || 'ontouchstart' in window);

if (fxCanvas && (fxCanHover || fxTouchMode) && !fxReduced && fxCanvas.getContext) {
  var fxCtx = fxCanvas.getContext('2d');

  // ---- 校音旋钮（尺寸口径整体照 pen：静止是一颗小点，扫过时鼓起来） ----
  var FX_REST_SCALE = 0.09;       // 静止时的大小（照 pen 的 restScale）
  var FX_MIN_SCALE  = 1.0;        // 扫过时放大倍数下限（照 pen：1~3）
  var FX_MAX_SCALE  = 3.0;        // 上限
  var FX_BASE_RATIO = 0.38;       // 基准半径 = 格距 × 这个比例（照 pen）
  var FX_INFLUENCE  = 300;        // 鼠标影响半径（px，照 pen 的 30vmin 量级）
  var FX_ACTIVITY_DECAY = 0.955;  // 鼠标停下后涟漪衰减（照 pen 的 activity，但更慢一点）
  var FX_WAVE_SPEED = 1200;       // 点击波的扩散速度（px/秒，照 pen）
  var FX_WAVE_WIDTH = 180;        // 波峰宽度（照 pen）
  var FX_IN_SEC     = 0.30;       // 放大到位的时间（pen 是 speedIn 0.5）
  var FX_OUT_SEC    = 0.42;       // 缩回去的时间（pen 是 speedOut 0.6）

  // 内容让位：这些区块下面的形状**不允许鼓起来** —— 就是 pen 的 [data-shape-mask] 机制。
  // ⚠️ 这里只做「不让膨胀」，不做「让形状消失」。原因：静止的小点本来就只有 3 像素左右，
  //    压不着字；真正会压字的是鼠标扫过时鼓到几十像素的那一下。
  //    所以卡住膨胀就够了 —— 正文同样清楚，背景的质感还连得上。
  // 原 pen 靠给元素加 data-shape-mask 属性标注；这里收成一个常量，只调这一处就够，
  // 不必在 HTML 里改十几处。只列「文字直接落在页面底上」的容器 ——
  // 卡片自己有底色（--c-surface），不需要让位。
  var FX_MASK_SELECTOR = '.section-head, .playlist-head, .track-list, ' +
                         '.contact-title, ' +
                         '.glass-panel, footer';

  // ---- 色板：用 pen 原版那套彩色（用户 2026-09-18 明确要「彩色 + 黑底，像这个一样」） ----
  // ⚠️ 这**破了本站原来那条「全站只有 6 个颜色」的规矩** —— 是用户自己的决定：
  //    他同时把背景换成了纯黑（见样式表 §1.5 的深色主题）。**规矩是被改掉的，不是被忽略的**；
  //    浅色主题那一套仍然完好，删掉 <html data-theme="dark"> 就能切回去。
  // 数组里重复几次 = 出现概率；10 个纯色 + 7 组渐变，顺序照 pen 原样。
  var FX_COLORS = [
    { type: 'solid', value: '#22c55e' },
    { type: 'solid', value: '#06b6d4' },
    { type: 'solid', value: '#f97316' },
    { type: 'solid', value: '#ef4444' },
    { type: 'solid', value: '#facc15' },
    { type: 'solid', value: '#ec4899' },
    { type: 'solid', value: '#9ca3af' },
    { type: 'solid', value: '#a78bfa' },
    { type: 'solid', value: '#60a5fa' },
    { type: 'solid', value: '#34d399' },
    { type: 'gradient', from: '#6366f1', to: '#3b82f6' },
    { type: 'gradient', from: '#06b6d4', to: '#6366f1' },
    { type: 'gradient', from: '#22c55e', to: '#06b6d4' },
    { type: 'gradient', from: '#f97316', to: '#ef4444' },
    { type: 'gradient', from: '#8b5cf6', to: '#06b6d4' },
    { type: 'gradient', from: '#3b82f6', to: '#8b5cf6' },
    { type: 'gradient', from: '#34d399', to: '#3b82f6' }
  ];

  // ---- 形状：圆 / 竖胶囊 / 星 ----
  // 星形预渲染 5 款（角数与内径不同），扫过时换一款 —— 就是 pen 里「形状在变」的手感。
  // 比例照 pen：**星占一半**（它原来是 ['circle','pill','star','star']）
  var FX_KINDS = ['circle', 'pill', 'star', 'star'];
  var FX_STARS = 5;          // 预渲染几款星
  var FX_STAR_FIRST = 2;     // 形状表里星形的起始下标（0 = 圆，1 = 胶囊）

  // 精灵按一个**固定的参考半径**渲染（比实际用到的最大半径还大一点），缩放下来更锐；
  // 用固定值是为了换视口尺寸时不必重建精灵
  var FX_SPRITE_R = 60;
  var FX_SPRITE_SIDE = Math.ceil(FX_SPRITE_R * 2) + 2;

  var fxW = 0, fxH = 0, fxCells = [], fxSprites = [];
  var fxPointer = { x: -1e4, y: -1e4, on: false };
  var fxWaves = [];
  var fxMasks = [];            // 正文区块的位置（文档坐标），压在下面的形状要让位
  var fxActivity = 0;          // 鼠标动量的衰减值 —— 光停在原地不动，涟漪会自己收回去
  var fxBaseR = 12;            // 基准半径，每次 fxBuild 按格距算
  var fxClock = 0, fxLast = 0, fxRaf = null;

  // 伪随机：同一个格子每次重建都长一样，resize 之后不会「洗牌」
  function fxHash(x, y) {
    return Math.abs(x * 73856093 ^ y * 19349663) % 100000;
  }

  // 形状几何表：只描述轮廓，半径由调用方给
  function fxShapeAt(i) {
    if (i === 0) return { kind: 'circle' };
    if (i === 1) return { kind: 'pill' };
    var v = i - FX_STAR_FIRST;                       // 0 .. FX_STARS-1
    return { kind: 'star', points: 4 + v, innerRatio: 0.24 + v * 0.07 };
  }
  function fxStarIndex() {
    return FX_STAR_FIRST + Math.floor(Math.random() * FX_STARS);
  }

  // 轮廓：照着 pen 的 drawCircle / drawPill / drawStar 写（尺寸口径也照它）
  function fxTrace(g, s, r) {
    g.beginPath();
    if (s.kind === 'circle') {
      g.arc(0, 0, r, 0, Math.PI * 2);
    } else if (s.kind === 'pill') {
      var hw = r * 0.42, hh = r;                     // 竖胶囊，约 1:2
      if (g.roundRect) g.roundRect(-hw, -hh, hw * 2, hh * 2, hw);
      else g.rect(-hw, -hh, hw * 2, hh * 2);
    } else {
      for (var i = 0, n = s.points; i < n * 2; i++) {
        var ang = (i * Math.PI) / n - Math.PI / 2;
        var rr = (i % 2 === 0) ? r : r * s.innerRatio;
        var x = Math.cos(ang) * rr, y = Math.sin(ang) * rr;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
    }
  }

  // 填充：solid 直接用色值；gradient 走径向渐变（中心偏上、外缘收暗）—— 取自 pen 的 resolveFill
  function fxFillStyle(g, def, r) {
    if (def.type === 'solid') return def.value;
    var grad = g.createRadialGradient(0, -r * 0.35, 0, 0, r * 0.35, r * 1.5);
    grad.addColorStop(0, def.from);
    grad.addColorStop(1, def.to);
    return grad;
  }

  // 精灵：每种「形状 × 色板」预渲染一张小图，逐帧只做 drawImage
  function fxBuildSprites() {
    var S = FX_SPRITE_SIDE, half = S / 2;
    fxSprites = [];
    for (var si = 0; si < FX_STAR_FIRST + FX_STARS; si++) {
      var shape = fxShapeAt(si);
      var row = [];
      for (var ci = 0; ci < FX_COLORS.length; ci++) {
        var cv = document.createElement('canvas');
        cv.width = S;
        cv.height = S;
        var g = cv.getContext('2d');
        g.translate(half, half);
        g.fillStyle = fxFillStyle(g, FX_COLORS[ci], FX_SPRITE_R);
        fxTrace(g, shape, FX_SPRITE_R);
        g.fill();
        row.push(cv);
      }
      fxSprites.push(row);
    }
  }

  function fxBuild() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);   // DPR 封顶 2
    fxW = window.innerWidth;
    fxH = window.innerHeight;
    fxCanvas.width = Math.round(fxW * dpr);
    fxCanvas.height = Math.round(fxH * dpr);
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);   // 之后一律用 CSS 像素坐标

    // 间距跟着视口放大：把总格数压在 ~1000 以内，大屏也不会拖慢
    var gap = Math.max(40, Math.sqrt(fxW * fxH / 900));
    fxBaseR = gap * FX_BASE_RATIO;          // 形状基准半径按格距走（照 pen）
    var cols = Math.ceil(fxW / gap) + 1;
    var rows = Math.ceil(fxH / gap) + 1;

    fxCells = [];
    for (var iy = 0; iy < rows; iy++) {
      for (var ix = 0; ix < cols; ix++) {
        var h = fxHash(ix, iy);
        var kind = FX_KINDS[(h >> 6) % FX_KINDS.length];
        fxCells.push({
          x: ix * gap + (h % 11) - 5,                    // 抖 ±5px：打散网格感
          y: iy * gap + ((h >> 4) % 11) - 5,
          base: 0.84 + ((h >> 8) % 100) / 100 * 0.32,    // 尺寸微差 0.84 ~ 1.16（pen 是统一大小，这里留一点手气）
          shape: kind === 'circle' ? 0 : (kind === 'pill' ? 1 : fxStarIndex()),
          c: (h >> 5) % FX_COLORS.length,
          angle: ((h >> 13) % 100) / 100 * Math.PI * 2,   // 初始角度（照 pen：每个形状随机转）
          maxScale: FX_MIN_SCALE + ((h >> 17) % 100) / 100 * (FX_MAX_SCALE - FX_MIN_SCALE),
          phase: ((h >> 11) % 100) / 100 * Math.PI * 2,   // 初始相位，避免整齐划一
          hovered: false,
          scale: FX_REST_SCALE
        });
      }
    }
  }

  // 读一遍正文区块的位置，换算成**文档坐标**存起来。
  // 只在布局可能变的时候调用（加载、resize、滚动节流），不在每帧里读 ——
  // getBoundingClientRect 会强制同步布局，逐帧读是性能大坑。
  function fxReadMasks() {
    var sx = window.scrollX || window.pageXOffset || 0;
    var sy = window.scrollY || window.pageYOffset || 0;
    var els = document.querySelectorAll(FX_MASK_SELECTOR);
    fxMasks = [];
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (!r.width || !r.height) continue;         // 藏起来的不算
      fxMasks.push({ l: r.left + sx, t: r.top + sy, r: r.right + sx, b: r.bottom + sy });
    }
  }

  var fxLastPaint = 0;
  function fxFrame(now) {
    // 触屏模式 30fps 上限：全屏 canvas 在手机上逐帧跑太费电，
    // 形状场本来就是「慢节奏呼吸」型特效，30fps 观感无损（桌面模式不封顶，行为不变）
    if (fxTouchMode && now - fxLastPaint < 32) {
      fxRaf = requestAnimationFrame(fxFrame);
      return;
    }
    fxLastPaint = now;
    // 用累加而不是绝对时间：切后台再回来，波纹不会「瞬移」
    if (!fxLast) fxLast = now;
    var dt = Math.min((now - fxLast) / 1000, 0.05);
    fxClock += dt;
    fxLast = now;
    var t = fxClock;

    fxCtx.clearRect(0, 0, fxW, fxH);   // 不填底色 —— 底色交给页面的深色主题

    // 缓动系数：pen 的 durationToFactor 是按 60fps 推的，
    // 这里按**真实帧间隔**算 —— 120Hz 屏上速度才不会翻倍
    var kIn  = 1 - Math.pow(0.05, dt / FX_IN_SEC);
    var kOut = 1 - Math.pow(0.05, dt / FX_OUT_SEC);

    // 鼠标的「动量」衰减（照 pen 的 activity）：手停住，涟漪会自己收回去，
    // 页面回到一片安静的小点 —— 「一会儿热闹、一会儿安静」的节奏就是从这来的
    fxActivity *= Math.pow(FX_ACTIVITY_DECAY, dt * 60);

    // 过期的点击波先扔掉，别越积越多
    if (fxWaves.length) {
      var diag = Math.sqrt(fxW * fxW + fxH * fxH);
      var life = (diag + FX_WAVE_WIDTH) / FX_WAVE_SPEED;
      fxWaves = fxWaves.filter(function (w) { return t - w.t < life; });
    }

    // 掩膜用**文档坐标**存，每帧只要把格子的视口 y 加上 scrollY 就能比 ——
    // 比 pen 那样每 10 帧读一遍 getBoundingClientRect（会触发布局）便宜得多
    var docScrollY = window.scrollY || window.pageYOffset || 0;

    for (var i = 0; i < fxCells.length; i++) {
      var cell = fxCells[i];

      // 环境波：鼠标不动时整片也在缓慢呼吸 —— 「全屏形状场」该有的样子
      var ambient = Math.sin(cell.x * 0.014 + cell.y * 0.011 + t * 1.15 + cell.phase);

      // ① 鼠标：越近越强，平方衰减，再乘上动量 —— 只有「手在动」的时候才鼓起来
      var hover = 0;
      if (fxPointer.on && fxActivity > 0.01) {
        var dx = cell.x - fxPointer.x, dy = cell.y - fxPointer.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < FX_INFLUENCE) {
          var q = 1 - d / FX_INFLUENCE;
          hover = q * q * fxActivity;
        }
      }

      // 扫进 / 扫出：进圈时重掷放大上限与角度（星形顺带换一款）—— 取自 pen 的 hovered 逻辑
      if (hover > 0.05 && !cell.hovered) {
        cell.hovered = true;
        cell.maxScale = FX_MIN_SCALE + Math.random() * (FX_MAX_SCALE - FX_MIN_SCALE);
        cell.angle = Math.random() * Math.PI * 2;
        if (cell.shape >= FX_STAR_FIRST) cell.shape = fxStarIndex();
      } else if (hover <= 0.05 && cell.hovered) {
        cell.hovered = false;
      }

      // ② 点击波：一圈向外扩散的环，环带上最强（照 pen 的 sin(π·t) 包络）
      var ring = 0;
      for (var wi = 0; wi < fxWaves.length; wi++) {
        var w = fxWaves[wi];
        var wr = (t - w.t) * FX_WAVE_SPEED;
        var wdx = cell.x - w.x, wdy = cell.y - w.y;
        var wd = Math.sqrt(wdx * wdx + wdy * wdy);
        var e = 1 - Math.abs(wd - wr) / FX_WAVE_WIDTH;
        if (e > 0) ring = Math.max(ring, Math.sin(Math.PI * e));
      }

      // 目标大小 = 静止 + 两者取更强的那个（pen：target = max(pointerTarget, waveTarget)）
      var peak = Math.max(hover, ring);

      // ③ 压在正文下面的形状不让位「膨胀」—— pen 的 [data-shape-mask] 机制（见上面的说明）
      if (peak > 0 && fxMasks.length) {
        var cy = cell.y + docScrollY;
        for (var mi = 0; mi < fxMasks.length; mi++) {
          var m = fxMasks[mi];
          if (cell.x >= m.l && cell.x <= m.r && cy >= m.t && cy <= m.b) { peak = 0; break; }
        }
      }

      var target = (FX_REST_SCALE + peak * (cell.maxScale - FX_REST_SCALE))
                 * (1 + 0.10 * ambient);                 // 静止时叠一层呼吸，不是死板的一片
      cell.scale += (target - cell.scale) * (target > cell.scale ? kIn : kOut);

      var r = fxBaseR * cell.base * cell.scale;
      if (r < 0.14) continue;                            // 太小就不画，省一次 drawImage

      // 黑底上要「彩色得起来」：静止的小点也看得出颜色，扫过时接近满不透明
      var alpha = 0.55 + 0.45 * peak;
      if (alpha > 1) alpha = 1;

      var spr = fxSprites[cell.shape][cell.c];
      var drawSide = FX_SPRITE_SIDE * (r / FX_SPRITE_R);
      fxCtx.globalAlpha = alpha;
      if (cell.shape === 0) {
        // 圆是各向同性的：不旋转，走最快的那条路
        fxCtx.drawImage(spr, cell.x - drawSide / 2, cell.y - drawSide / 2, drawSide, drawSide);
      } else {
        fxCtx.save();
        fxCtx.translate(cell.x, cell.y);
        fxCtx.rotate(cell.angle);
        fxCtx.drawImage(spr, -drawSide / 2, -drawSide / 2, drawSide, drawSide);
        fxCtx.restore();
      }
    }

    fxCtx.globalAlpha = 1;
    fxRaf = requestAnimationFrame(fxFrame);
  }

  function fxStart() {
    if (fxRaf === null) {
      fxLast = 0;                                  // 重设基准，避免累加出一大跳
      fxRaf = requestAnimationFrame(fxFrame);
    }
  }

  function fxStop() {
    if (fxRaf !== null) {
      cancelAnimationFrame(fxRaf);
      fxRaf = null;
    }
  }

  if (fxTouchMode) {
    // ---- 触屏输入（触屏模式专属，2026-09-26）----
    // 三条铁律：
    //   ① 全部 passive、绝不 preventDefault —— 滚动/点按页面照常，特效只是「顺便」亮起来
    //   ② 只跟第一根手指（多指不放大效果，保持简单）
    //   ③ tap=波 / 滑动=扫亮扫过换形 / 长按≥350ms=持续涟漪（松手即停，不留残留状态）
    var fxTouchId = null, fxTouchStart = null, fxLongHold = false, fxLongTimer = null;

    function fxWaveAt(x, y) { fxWaves.push({ x: x, y: y, t: fxClock }); }

    document.addEventListener('touchstart', function (e) {
      if (fxTouchId !== null) return;                  // 已在跟一根手指：忽略后续按下
      var t0 = e.changedTouches[0];
      fxTouchId = t0.identifier;
      fxPointer.x = t0.clientX; fxPointer.y = t0.clientY; fxPointer.on = true;
      fxActivity = 1;
      fxTouchStart = { x: t0.clientX, y: t0.clientY, moved: false };
      clearTimeout(fxLongTimer);
      fxLongTimer = setTimeout(function () {           // 长按 ≥350ms：按住泉眼，一圈圈荡开
        if (fxTouchId === null || !fxTouchStart || fxTouchStart.moved) return;
        fxLongHold = true;
        fxWaveAt(fxPointer.x, fxPointer.y);
        fxLongTimer = setInterval(function () {
          if (fxTouchId !== null) fxWaveAt(fxPointer.x, fxPointer.y);
        }, 480);
      }, 350);
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var tm = e.changedTouches[i];
        if (tm.identifier !== fxTouchId) continue;
        fxPointer.x = tm.clientX; fxPointer.y = tm.clientY; fxPointer.on = true;
        fxActivity = 1;                                // 手指在动 = 动量拉满
        if (fxTouchStart) {
          var dx = tm.clientX - fxTouchStart.x, dy = tm.clientY - fxTouchStart.y;
          if (dx * dx + dy * dy > 576) {               // 移动超过 24px：算拖动，取消长按
            fxTouchStart.moved = true;
            clearTimeout(fxLongTimer);
          }
        }
      }
    }, { passive: true });

    function fxEndTouch(e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var te = e.changedTouches[i];
        if (te.identifier !== fxTouchId) continue;
        clearTimeout(fxLongTimer); clearInterval(fxLongTimer);
        if (fxTouchStart && !fxTouchStart.moved && !fxLongHold) {
          fxWaveAt(fxTouchStart.x, fxTouchStart.y);    // 没怎么动的短按 = 一次点按波
        }
        fxTouchId = null; fxTouchStart = null; fxLongHold = false;
      }
    }
    document.addEventListener('touchend', fxEndTouch, { passive: true });
    document.addEventListener('touchcancel', fxEndTouch, { passive: true });
  } else {
    window.addEventListener('mousemove', function (e) {
      fxPointer.x = e.clientX;
      fxPointer.y = e.clientY;
      fxPointer.on = true;
      fxActivity = 1;                    // 手一动就重新点亮动量（照 pen 的 onMove）
    }, { passive: true });

    // 点击 → 从落点发出一圈扩散的波（照 pen 的 triggerWave）。
    // **passive + 不拦截**：页面上其他点击（导航、按钮、链接、聊天的输入框）一律照常，
    // 这条监听只负责「顺便放一圈波」。
    // ⚠️ 触屏模式不挂它：手机浏览器在 tap 后会合成一次 click，再听就会一波变两波。
    window.addEventListener('click', function (e) {
      fxWaves.push({ x: e.clientX, y: e.clientY, t: fxClock });
    }, { passive: true });

    // 鼠标离开窗口：涟漪收回，只留环境波
    document.addEventListener('mouseleave', function () {
      fxPointer.on = false;
    });
  }

  // 切到后台就停 —— 没人看的时候不该烧 CPU
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) fxStop(); else fxStart();
  });

  var fxResizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(fxResizeTimer);
    fxResizeTimer = setTimeout(function () {
      fxBuild();
      fxReadMasks();                              // 视口变了，正文位置也变了
    }, 200);                                      // 精灵与视口无关，不必重建
  });

  // 掩膜存的是**文档坐标**，所以滚动本身不需要重算；
  // 但页面高度会变（聊天在长、照片在加载），所以还是节流重读一下兜底
  var fxScrollTimer = null;
  window.addEventListener('scroll', function () {
    if (fxScrollTimer) return;
    fxScrollTimer = setTimeout(function () {
      fxScrollTimer = null;
      fxReadMasks();
    }, 300);
  }, { passive: true });

  fxBuildSprites();
  fxBuild();
  fxReadMasks();
  fxStart();
  // 开场先来一圈波 —— 一眼看出这东西是活的
  fxWaves.push({ x: fxW / 2, y: fxH * 0.42, t: 0 });

  // ---- 调试开关（?fx=1）：把形状场的状态贴在屏幕角上，手机排查专用 ----
  // 正式页面没有任何入口指向它；每 1.8s 自动放一圈波 —— 不摸屏幕也能看出画布是不是活的
  if (location.search.indexOf('fx=1') !== -1) {
    var fxBadge = document.createElement('div');
    fxBadge.style.cssText = 'position:fixed;top:6px;right:6px;z-index:9999;' +
      'font:11px/1.6 monospace;color:#0f0;background:rgba(0,0,0,.65);' +
      'padding:4px 7px;border-radius:4px;pointer-events:none;';
    document.body.appendChild(fxBadge);
    function fxBadgeTick() {
      fxBadge.textContent = 'fx touch=' + (fxTouchMode ? 1 : 0) +
        ' hover=' + (fxCanHover ? 1 : 0) +
        ' reduced=' + (fxReduced ? 1 : 0) +
        ' cells=' + fxCells.length +
        ' waves=' + fxWaves.length +
        ' ' + fxW + 'x' + fxH;
    }
    fxBadgeTick();
    setInterval(fxBadgeTick, 1000);
    setInterval(function () {
      fxWaves.push({ x: fxW / 2, y: fxH / 2, t: fxClock });
    }, 1800);
  }
}

// ---------- 交互六：卡片鼠标光斑 ----------
// 把鼠标在卡片内的坐标写进 CSS 变量，样式层用它画一个跟随的柔光
document.querySelectorAll('.info-card').forEach(function (card) {
  card.addEventListener('mousemove', function (e) {
    var rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - rect.left) + 'px');
    card.style.setProperty('--my', (e.clientY - rect.top) + 'px');
  });
});

// ---------- 交互七：数据条数字滚动 —— **已随数据条一起删除**（V2.7 续四十九，2026-09-22）----------
// 原来这里是 countUp() + `.stat-num` 的 IntersectionObserver（页面上那个 3 / 5 / 8 往上滚）。
// 数据条整块删掉后，这一整段**没有任何调用点** ⇒ 留着就是死代码，清掉。
// ⚠️ **但下面这个变量不能删**：下面的逐行入场（`if (!reduceMotion)`）还在用它。
//    （补充：`querySelectorAll('.stat-num')` 命中不到东西时返回空 NodeList、不会报错，
//      所以当初「只删页面不删 JS」是能跑的 —— 但那不叫干净。）
var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- 交互八：顶部阅读进度条 ----------
var progressEl = document.getElementById('navProgress');

function updateProgress() {
  if (!progressEl) return;
  var scrollable = document.documentElement.scrollHeight - window.innerHeight;
  var ratio = scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0;
  progressEl.style.width = (ratio * 100) + '%';
}

window.addEventListener('scroll', updateProgress, { passive: true });
window.addEventListener('resize', updateProgress);
updateProgress();

// ---------- 交互五：Scroll Reveal 滚动显现 ----------
var revealEls = document.querySelectorAll('.reveal');

if ('IntersectionObserver' in window) {
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target); // 只触发一次
      }
    });
  }, {
    threshold: 0.15,        // 元素露出15%时触发
    rootMargin: '0px 0px -50px 0px'  // 底部提前50px触发
  });

  revealEls.forEach(function (el) {
    observer.observe(el);
  });
} else {
  // 旧浏览器不支持，直接全部显示
  revealEls.forEach(function (el) {
    el.classList.add('visible');
  });
}

// ---------- 交互九：逐行入场 ----------
// 难点：HTML 里没有「行」这个概念，行是浏览器排版后才产生的。
// 做法是先给每个词/字套一个临时 span，读它们的 offsetTop，顶部坐标相同就属于同一行，
// 再把这些词重新拼成真正的行。中文按字拆、英文按词拆，避免单词被从中间截断。
var LINE_STAGGER = 88;   // 每行之间的错开时间（ms），与 CSS 里的 88ms 保持一致
var LINE_TOKEN = /[A-Za-z0-9][A-Za-z0-9'’.\-+]*|\s+|[\s\S]/g;

// 只拆文本节点；行内元素（比如 h1 里的 .highlight）整块保留，不拆断
function buildProbes(el) {
  var probes = [];
  var frag = document.createDocumentFragment();

  Array.prototype.slice.call(el.childNodes).forEach(function (node) {
    if (node.nodeType === 3) {
      (node.textContent.match(LINE_TOKEN) || []).forEach(function (t) {
        var s = document.createElement('span');
        s.textContent = t;
        frag.appendChild(s);
        probes.push({ el: s, text: t, node: null });
      });
    } else if (node.nodeType === 1) {
      var clone = node.cloneNode(true);
      frag.appendChild(clone);
      probes.push({ el: clone, text: null, node: node });
    }
  });

  el.textContent = '';
  el.appendChild(frag);
  return probes;
}

function splitIntoLines(el) {
  // 留一份原始 HTML，窗口尺寸变化后要还原重排
  if (el.getAttribute('data-html') === null) {
    el.setAttribute('data-html', el.innerHTML);
  }

  var probes = buildProbes(el);
  if (!probes.length) return 0;

  // 按 offsetTop 分组：同一行的探针顶部坐标相同（容差 2px 防亚像素误差）
  // 纯空格不参与判断——它可能被压缩成零宽，坐标不可靠，让它跟着当前行走
  var rows = [[]];
  var lastTop = null;

  probes.forEach(function (p) {
    var top = p.el.offsetTop;
    var isSpace = p.node === null && p.text.trim() === '';

    if (!isSpace) {
      if (lastTop === null) {
        lastTop = top;
      } else if (Math.abs(top - lastTop) > 2) {
        rows.push([]);
        lastTop = top;
      }
    }
    rows[rows.length - 1].push(p);
  });

  el.textContent = '';
  var made = 0;

  rows.forEach(function (row) {
    var inner = document.createElement('i');
    var buf = '';

    row.forEach(function (p) {
      if (p.node) {
        if (buf) { inner.appendChild(document.createTextNode(buf)); buf = ''; }
        inner.appendChild(p.node.cloneNode(true));
      } else {
        buf += p.text;
      }
    });
    if (buf) inner.appendChild(document.createTextNode(buf));

    if (!inner.textContent.trim()) return;   // 只剩一个空格的空行，丢掉

    var line = document.createElement('span');
    line.className = 'line';
    inner.style.setProperty('--i', made);
    line.appendChild(inner);
    el.appendChild(line);
    made++;
  });

  el.classList.add('lines');
  return made;
}

function revealLines(el, animate) {
  if (!el.classList.contains('lines')) {
    if (!splitIntoLines(el)) return;
  }
  if (!animate) {
    el.classList.add('is-visible', 'is-done');
    return;
  }
  // 下一帧再挂 is-visible，否则浏览器会把「初始态」和「终态」合并成一次样式计算，动画直接跳过
  requestAnimationFrame(function () {
    el.classList.add('is-visible');
  });
  var lines = el.querySelectorAll('.line').length;
  setTimeout(function () {
    el.classList.add('is-done');
  }, lines * LINE_STAGGER + 1000);
}

var lineEls = Array.prototype.slice.call(document.querySelectorAll('[data-lines]'));
var lineObserver = null;

// 关掉动效就不拆行：文字保持原样直接显示，最省事也最稳
if (!reduceMotion) {
  if ('IntersectionObserver' in window) {
    lineObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          revealLines(entry.target, true);
          lineObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -60px 0px' });

    lineEls.forEach(function (el) { lineObserver.observe(el); });
  } else {
    lineEls.forEach(function (el) { revealLines(el, true); });
  }
}

// 换行位置会随宽度变化，所以变宽变窄后要按新的宽度重新拆一次；
// 只改高度（手机地址栏收起）不重排，避免在移动端来回抖。
var lastWidth = window.innerWidth;
var relayoutTimer = null;

window.addEventListener('resize', function () {
  if (Math.abs(window.innerWidth - lastWidth) < 40) return;
  lastWidth = window.innerWidth;

  clearTimeout(relayoutTimer);
  relayoutTimer = setTimeout(function () {
    lineEls.forEach(function (el) {
      if (!el.classList.contains('lines')) return;   // 还没入场的不动，等观察器处理
      var wasVisible = el.classList.contains('is-visible');
      el.innerHTML = el.getAttribute('data-html') || '';
      el.classList.remove('lines', 'is-visible', 'is-done');
      splitIntoLines(el);
      el.classList.add('is-visible');
      if (wasVisible) el.classList.add('is-done');   // 已经演完的不再重播
    });
  }, 180);
});

// ---------- 交互十一：联系名片缩放 ----------
// 骨架照 Abdughafur 那张卡来（− / + 两个按钮 + 一个变量），但**三处按能用的标准重写了**：
// ① 范围有上下限，且到边界时把按钮标成 aria-disabled ——
//    它原来到边界是「悄悄什么都不做」，点了没反应，用户分不清是卡住还是到底了
// ② **不用 `disabled` 属性**：disabled 会把焦点一并丢掉，
//    键盘用户按到边界时焦点会突然消失
// ③ 加了一个 live region（HTML 里那个 aria-live 的百分比）：改大改小读屏能听见
// ⚠️ 缩放走 `zoom` 而不是 `transform: scale()`，理由写在样式表 §22
(function () {
  var card = document.getElementById('contactCard');
  var outBtn = document.getElementById('cardZoomOut');
  var inBtn = document.getElementById('cardZoomIn');
  var value = document.getElementById('cardZoomValue');
  if (!card || !outBtn || !inBtn || !value) return;

  var MIN = 0.85, MAX = 1.30, STEP = 0.05;
  var scale = 1;

  function render() {
    card.style.setProperty('--card-scale', scale.toFixed(2));
    value.textContent = Math.round(scale * 100) + '%';
    outBtn.setAttribute('aria-disabled', scale <= MIN + 0.001 ? 'true' : 'false');
    inBtn.setAttribute('aria-disabled', scale >= MAX - 0.001 ? 'true' : 'false');
  }

  function step(dir) {
    // 先取整到百分位再加，避免 0.1+0.2 那种浮点误差越积越多
    var next = Math.round((scale + dir * STEP) * 100) / 100;
    if (next < MIN) next = MIN;
    if (next > MAX) next = MAX;
    if (next === scale) return;      // 已经到边界，什么都不做
    scale = next;
    render();
  }

  outBtn.addEventListener('click', function () { step(-1); });
  inBtn.addEventListener('click', function () { step(1); });

  render();
})();


/* ========== 球体画廊（V2.7 续三十四） ==========
   机制借自用户 2026-09-21 贴来的一段第三方实现（DermExcel 的摄影页）：
   ① 斐波那契球面分布（黄金角）② 滚动驱动旋转 ③ 正面高亮 ④ 一行短标题。

   ⚠️ **没有抄它的代码，也没有用 GSAP。**
      原版从 cdnjs 加载 GSAP + ScrollTrigger；本站 **0 个外部依赖**（只加载本地 script.js），
      引 CDN 会破掉「纯静态、无框架、自己实现」这条 —— 那正是课程里说得清的技术选择。
      所以这里自己算：滚动进度 = 外层容器滚过视口的比例；动画走 rAF + transform，
      和上面彩色形状场是同一套写法。滚动本身**不劫持**：外层给高度、里面 sticky 住一屏。

   ⚠️ 两处**刻意比原版做得更对**：
      1. 原版用 `floor(progress × 张数)` 猜「哪张在正面」—— 张数与滚动距离对不上时，
         文字会和画面错位。这里按**真实深度**算：把每张卡片的位置按当前旋转角做矩阵变换，
         取 z 最大的那张 ⇒ 标题永远跟着真正转到前面的那张。
      2. 半径**按视口算**（原版写死 380 / 移动端 200）⇒ 卡片不会被挤出屏幕，
         于是**不需要用 `overflow: hidden` 去裁**（那会压平 preserve-3d，也会让 sticky 失效）。

   ⚠️ 尊重 prefers-reduced-motion：系统要求减少动效时**根本不启动滚动动画**，
      球体由 CSS 摊平成一行静态照片，那行短标题也隐藏。

   📷 **换素材只改下面 SPHERE_PHOTOS**（src + 一行短标题）—— 现在是 9 张真人素材
   （2026-09-21 由 5 张占位换成 9 张）。 */
(function () {
  var gallery = document.getElementById('sphereGallery');
  var sphere = document.getElementById('sphere');
  var labelEl = document.getElementById('sphereLabel');
  if (!gallery || !sphere || !labelEl) return;          // 子页没有这块，直接退出

  // 👉 素材到位后改这里。label 只写一行短标题（用户明确要的），不写长描述。
  // ⚠️ 这里用的是 images/sphere/ 下的**缩略图**，不是原图 —— 球体卡片只显示 150×200 px，
  //    喂原图纯浪费（源图 8 张合计 2057 KB，缩略图合计 256 KB）。
  //    ⚠️ 体积是 2026-09-26 实测的；换素材后请重新量一遍，别让注释停在旧数字上。
  //    缩略图由 `python tools/make-thumbs.py <源图或目录>` 生成（3:4 居中裁切，和 CSS 的
  //    object-fit: cover 一致 ⇒ 视觉没变化），顺带摆正 EXIF 方向、去掉 EXIF（含 GPS）。
  //    换素材的流程：把照片丢进一个目录 → 跑那个脚本 → 改下面这张表。
  //    ⚠️ sphere/7.jpg（夜市）当年从 7.jpg 生成时额外加了 `--trim-bottom 0.23` ——
  //       那张原图底部有手机相机的水印（Leica / Live Moment / 相机参数 / 机型）。
  //    ⚠️ 7.jpg 原图 2026-09-26 已从摄影墙下墙（与 entry-street.jpg 同场景重复）；
  //       将来若重做这张缩略图，源用 entry-street.jpg（**同样要裁底部水印**）。
  // ⚠️ label 是**按画面内容拟的**（用户没给标题），是描述不是解读；要改直接说。
  var SPHERE_PHOTOS = [
    { src: 'images/sphere/1.jpg', label: '书法' },
    { src: 'images/sphere/2.jpg', label: '架子鼓' },
    { src: 'images/sphere/3.jpg', label: '摄影' },
    { src: 'images/sphere/4.jpg', label: '音乐' },
    { src: 'images/sphere/5.jpg', label: '篮球' },
    { src: 'images/sphere/6.jpg', label: '站台' },
    { src: 'images/sphere/7.jpg', label: '夜市' },
    { src: 'images/sphere/8.jpg', label: '演唱会' },
    { src: 'images/sphere/9.jpg', label: '步道' }
  ];

  // 球面要铺满才好看：把照片循环到「够密、又能被张数整除」的张数 ——
  // ⚠️ 要整除：9 张循环到 24 张的话，有 3 张会比别的少露一次，转动时看得出来。
  //    9 张 ⇒ 27 张（每张 3 次）；5 张 ⇒ 25 张；12 张 ⇒ 24 张。
  var MIN_CARDS = 24;
  var TOTAL = Math.max(MIN_CARDS,
    Math.ceil(MIN_CARDS / SPHERE_PHOTOS.length) * SPHERE_PHOTOS.length);
  var GOLDEN = Math.PI * (3 - Math.sqrt(5));   // 黄金角 ≈ 2.39996 rad

  var nodes = [];
  var radius = 0;
  var lastLabel = '';
  var visible = false;
  var ticking = false;

  // 半径按视口算：两轴较小者 × 0.32，封顶 400、保底 140
  function computeRadius() {
    var w = window.innerWidth || 375;
    var h = window.innerHeight || 700;
    return Math.max(140, Math.min(400, Math.min(w, h) * 0.32));
  }

  // ---------- 1. 斐波那契球面分布 ----------
  function build() {
    radius = computeRadius();
    sphere.innerHTML = '';
    nodes = [];

    for (var i = 0; i < TOTAL; i++) {
      var it = SPHERE_PHOTOS[i % SPHERE_PHOTOS.length];

      var card = document.createElement('div');
      card.className = 'sphere-card';
      var img = document.createElement('img');
      img.src = it.src;
      img.alt = '';                  // 装饰用：可访问的那份在下面的照片墙里（带 alt）
      img.loading = 'lazy';
      img.decoding = 'async';
      card.appendChild(img);

      var phi = Math.acos(1 - 2 * (i + 0.5) / TOTAL);   // 极角：均匀铺开
      var theta = GOLDEN * i;                           // 方位角：黄金角错开
      var x = radius * Math.cos(theta) * Math.sin(phi);
      var y = radius * Math.sin(theta) * Math.sin(phi);
      var z = radius * Math.cos(phi);

      // 让每张卡片朝外：先按 x/z 偏航，再按 y 俯仰
      var ry = Math.atan2(x, z) * 180 / Math.PI;
      var rx = Math.asin(Math.max(-1, Math.min(1, -y / radius))) * 180 / Math.PI;

      card.style.transform =
        'translate3d(' + x.toFixed(1) + 'px, ' + y.toFixed(1) + 'px, ' + z.toFixed(1) + 'px) ' +
        'rotateY(' + ry.toFixed(1) + 'deg) rotateX(' + rx.toFixed(1) + 'deg)';

      sphere.appendChild(card);
      nodes.push({ el: card, x: x, y: y, z: z, depth: 0, label: it.label });
    }
  }

  // ---------- 2. 滚动进度：外层滚过视口的比例 ----------
  function progress() {
    var r = gallery.getBoundingClientRect();
    var span = r.height - window.innerHeight;
    if (span <= 0) return 0;
    var p = -r.top / span;
    return p < 0 ? 0 : (p > 1 ? 1 : p);
  }

  // ---------- 3. 渲染：转球 + 按真实深度标正面 ----------
  // CSS 的 `rotateY(A) rotateX(B)` 表示先绕 X 再绕 Y（transform 从右往左作用），
  // 所以 z = −x·sinA + (y·sinB + z·cosB)·cosA。
  // 两个可自检的特例：A=B=0 时取 z 最大 ⇒ 正对观众的那张；A=180° 时取 z 最小 ✓
  function render(p) {
    var A = p * 720;                  // 转两圈
    var B = 6 + p * 14;               // 一点点前倾就够；转 45° 会把球压成一个盘

    sphere.style.transform =
      'rotateY(' + A.toFixed(2) + 'deg) rotateX(' + B.toFixed(2) + 'deg)';

    var sinA = Math.sin(A * Math.PI / 180), cosA = Math.cos(A * Math.PI / 180);
    var sinB = Math.sin(B * Math.PI / 180), cosB = Math.cos(B * Math.PI / 180);

    var best = 0, bestD = -Infinity, i, nd;
    for (i = 0; i < nodes.length; i++) {
      nd = nodes[i];
      nd.depth = -nd.x * sinA + (nd.y * sinB + nd.z * cosB) * cosA;
      if (nd.depth > bestD) { bestD = nd.depth; best = i; }
    }

    // 高亮「朝前的那一小簇」：按深度阈值，不按序号 —— 序号和远近没有关系
    var cut = bestD * 0.86;
    for (i = 0; i < nodes.length; i++) {
      nd = nodes[i];
      var front = nd.depth >= cut;
      if (front !== nd.el.classList.contains('is-front')) {
        nd.el.classList.toggle('is-front', front);
      }
    }

    // 短标题：只在真的换了一张时写 DOM，别每帧都动
    var name = nodes[best].label;
    if (name && name !== lastLabel) {
      lastLabel = name;
      labelEl.textContent = name;
    }
  }

  function requestRender() {
    if (!visible || ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      render(progress());
    });
  }

  function onResize() {
    build();
    render(progress());
  }

  // ---------- 4. 启动 ----------
  build();
  render(progress());

  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!reduced) {
    window.addEventListener('scroll', requestRender, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    // 只在球体进入视口时才响应滚动 —— 页面别处滚动不该白算
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) requestRender();
      }, { rootMargin: '120px' }).observe(gallery);
    } else {
      visible = true;
    }
  }
})();


// ---------- 交互十：反馈抽屉（V3 新增） ----------
// 先告诉 CSS「JS 活着」：<html> 上没有这个类时触发按钮不显示。
// 这样关掉 JS 的访客看到的是一个干净页面，而不是一个点了没反应的按钮。
document.documentElement.classList.add('js-ready');

(function () {
  /* ============================================================
     后端配置（WorkBuddy 云服务 · 2026-09-24 激活）
     ------------------------------------------------------------
     这两个值是「设计上就可以公开」的公开配置（客户端初始化用），放在前端是正常的。
     ⚠️ 真正的高权限凭据（service_role / 数据库密码 / 平台密钥）只在平台那一侧，
     永远不进前端、不进 git、也不交给 AI。
     ⚠️ endpoint 必须用这里写死的这个（平台按 Origin + 应用绑定校验）；
     别改成 location.origin，也别在别处再初始化一个客户端。
     ============================================================ */
  var CLOUD_CONFIG = {
    endpoint: 'https://mypage-38202.app.workbuddy.host',   // 来自激活时的 publicConfig.endpoint
    publishableKey: 'wbpk_aEH7ucbFjEJiB6me355TAg_x2LJk4zHHaBkp9wK8WdEIXhPbjsZusAn'
  };

  /* 提问记录（2026-09-26）要用同一份云配置 —— 在这里交出一个页面级引用，
     ⚠️ **配置只此一份**：别处不要再写第二份 endpoint / key（改这里就等于改了全部）。 */
  window.MYPAGE_CLOUD_CONFIG = CLOUD_CONFIG;

  var PAGE_VERSION = 'V3.0';
  var MAX_LEN = 1000;

  // ---------- 取元素 ----------
  function el(id) { return document.getElementById(id); }

  var trigger   = el('fbTrigger');
  var drawer    = el('fbDrawer');
  var scrim     = el('fbScrim');
  var closeBtn  = el('fbClose');
  var form      = el('fbForm');
  var noticeEl  = el('fbNotice');
  var errorEl   = el('fbError');
  var statusEl  = el('fbStatus');
  var submitBtn = el('fbSubmit');
  var submitTxt = el('fbSubmitText');
  var doneEl    = el('fbDone');
  var againBtn  = el('fbAgain');
  var doneClose = el('fbDoneClose');
  var msgEl     = el('fbMessage');
  var countEl   = el('fbCount');
  var nameEl    = el('fbName');

  if (!trigger || !drawer || !scrim || !closeBtn || !form) return;

  var isOpen = false;
  var isSubmitting = false;

  // ---------- 后端就绪判断 ----------
  // 没配好就老实说「还没接上」，绝不假装成功——
  // 假成功比报错更糟：用户以为反馈送到了，你这边一条都收不到
  function backendReady() {
    return typeof window.WorkBuddyCloud !== 'undefined'
      && typeof window.WorkBuddyCloud.createWorkBuddyCloud === 'function'
      && /^https?:\/\//.test(CLOUD_CONFIG.endpoint)
      && !!CLOUD_CONFIG.publishableKey;
  }

  // ---------- 镜像站判断（2026-09-24 实测平台策略后加的） ----------
  // 云服务后台的跨域预检只放行三种来源（逐个用 OPTIONS 探过的实测结果）：
  //   ✅ 应用自己的域名、✅ 本机（localhost / 127.0.0.1，任意端口）、✅ file://（Origin: null）
  //   ❌ 其它公开网站（GitHub Pages 镜像、example.com 一律 403）
  // 本地开发与双击打开全都不受影响；但页面若被挂到别的域名下（比如 GitHub Pages 镜像），
  // 表单是发不出去的 —— 与其让访客撞上一个莫名其妙的「网络连不上」，不如如实告诉他去正式地址。
  function isMirrorSite() {
    if (typeof location === 'undefined' || location.protocol === 'file:') return false;
    try {
      if (location.origin === new URL(CLOUD_CONFIG.endpoint).origin) return false;
    } catch (e) { /* endpoint 异常就按镜像处理，宁可多提示 */ }
    var h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return false;
    return true;
  }

  // ---------- 开合 ----------
  function open() {
    if (isOpen) return;
    isOpen = true;

    // 上次提交成功后直接关掉抽屉，再打开时要回到表单，
    // 而不是停在那张「收到了，谢谢」上
    if (doneEl && !doneEl.hidden) resetForm();

    scrim.hidden  = false;
    drawer.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';   // 锁住背景，避免在抽屉里滚动时穿透到页面

    // 焦点必须跟进来：不然键盘用户按一下 Tab 就跑到背后的页面里去了。
    // 聚焦容器本身（它有 aria-labelledby），朗读软件会先念出标题
    drawer.focus();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;

    scrim.hidden  = true;
    drawer.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';

    // 焦点还给触发按钮。preventScroll 防止页面被猛地拽回按钮所在的位置
    trigger.focus({ preventScroll: true });
  }

  // ---------- 焦点陷阱 ----------
  // aria-modal="true" 等于向辅助技术承诺了「外面的内容不算数」，
  // 那就得真的拦住 Tab。不拦的话，键盘用户 Tab 几下就掉进背后那张看不见的页面里，
  // 越按越迷路，最后只能刷新
  drawer.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;

    var nodes = drawer.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]'
    );
    // 被 hidden 藏起来的（表单或成功态）不算数
    var list = Array.prototype.filter.call(nodes, function (n) {
      return n.offsetParent !== null;
    });
    if (!list.length) return;

    var first = list[0];
    var last  = list[list.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // ---------- 字数计数 ----------
  // 这个数字带 aria-hidden：每敲一个字都念一遍计数，对朗读软件用户是折磨。
  // 真正的上限由 maxlength 兜底，计数只是给人看的
  function updateCount() {
    if (!msgEl || !countEl) return;
    var n = msgEl.value.length;
    countEl.textContent = n + ' / ' + MAX_LEN;
    countEl.classList.toggle('is-near-limit', n > MAX_LEN * 0.9);   // 过九成变色，别等提交才说超长
  }

  // ---------- 提示 ----------
  function showError(text) {
    if (!errorEl) return;
    errorEl.textContent = text;
    errorEl.hidden = false;
  }

  function clearError() {
    if (!errorEl) return;
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || '';
  }

  function setLoading(on) {
    isSubmitting = on;
    if (submitBtn) submitBtn.classList.toggle('is-loading', on);
    if (submitTxt) submitTxt.textContent = on ? '提交中…' : '提交反馈';
  }

  // ---------- 读表单 ----------
  function collect() {
    function picked(name) {
      var node = form.querySelector('input[name="' + name + '"]:checked');
      return node ? node.value : '';
    }
    return {
      name:         nameEl ? nameEl.value.trim() : '',
      relation:     picked('relation'),
      device:       picked('device'),
      message:      msgEl ? msgEl.value.trim() : '',
      version:      PAGE_VERSION   // ⚠️ 必须与 feedback 表的列名一致（表里叫 version，不是 page_version）
    };
  }

  // ---------- 校验 ----------
  // 一次把所有问题都摆出来。填一次被驳回一次是最招人烦的表单行为
  function validate(data) {
    var problems = [];

    if (!data.relation) problems.push({ id: 'relation', text: '「我们是什么关系」还没选' });
    if (!data.device)   problems.push({ id: 'device',   text: '「你用什么设备看的」还没选' });

    if (!data.message) {
      problems.push({ id: 'message', text: '「想说什么」还是空的' });
    } else if (data.message.length < 4) {
      problems.push({ id: 'message', text: '正文只有两三个字，我看不出问题在哪' });
    }

    return problems;
  }

  // 焦点直接跳到第一个出问题的地方——光给一行红字，人还得自己找
  var PROBLEM_BOX = { relation: 'fbRelationField', device: 'fbDeviceField', message: 'fbMessage' };

  function focusProblem(id) {
    var box = el(PROBLEM_BOX[id] || '');
    if (!box) return;
    var input = box.querySelector('input, textarea');
    if (input) input.focus();
  }

  // ---------- 提交 ----------
  function onSubmit(e) {
    e.preventDefault();
    if (isSubmitting) return;          // 防重复：连点两下也只发一条

    clearError();
    setStatus('');

    var data = collect();
    var problems = validate(data);

    if (problems.length) {
      showError('还差 ' + problems.length + ' 处：' +
                problems.map(function (p) { return p.text; }).join('；') + '。');
      focusProblem(problems[0].id);
      return;
    }

    setLoading(true);

    // ---- 后端还没接上：走本地演示，明确告知，不假装成功 ----
    if (!backendReady()) {
      setTimeout(function () {
        setLoading(false);
        showDone(true);
      }, 650);
      return;
    }

    // ---- 真提交 ----
    sendToBackend(data, function (err) {
      setLoading(false);
      if (err) {
        showError('没发出去：' + err);
        setStatus('你写的内容还在，可以直接再试一次。');
        return;                        // 失败时一个字都不清空，这是基本礼貌
      }
      showDone(false);
    });
  }

  // ---------- 发往云端后台（WorkBuddy 云服务） ----------
  // 单独拎一层：库没加载、网络断了、表不存在、权限被拒……
  // 全部在这里收口成「成功 / 失败 + 人话原因」，上层不用关心细节
  //
  // ⚠️ 客户端只初始化一次（懒加载缓存），四个模块共用同一个实例 —— 别在别处再建一个
  var cloudClient = null;
  function getCloud() {
    if (!cloudClient) {
      cloudClient = window.WorkBuddyCloud.createWorkBuddyCloud({
        endpoint: CLOUD_CONFIG.endpoint,          // ⚠️ 必须来自配置，不要用 location.origin
        publishableKey: CLOUD_CONFIG.publishableKey
      });
    }
    return cloudClient;
  }

  // 把后端的报错翻成中文人话。数据库错误码是「好事」：说明请求真的到了数据库那一层，
  // 剩下的问题都在表 / 权限里。平台层的 401（凭据没带上）不是这里能修的，照实说。
  function humanizeError(err) {
    var code = err && err.code;
    if (code === '42P01') return '数据库里还没有这张表（建表脚本没跑？）';
    if (code === '42501') return '数据库权限拒绝了这条记录（RLS 或授权没配好）';
    if (code === '23505') return '这条好像已经提交过了';
    if (code === '23514') return '内容不合法：反馈正文要 1~1000 字';
    var msg = (err && err.message) ? String(err.message) : '';
    if (/MISSING_CREDENTIALS|ACCESS_TOKEN_KID_INVALID/.test(msg) || /401/.test(String(code || ''))) {
      return '后端的凭据没通过（这是平台侧的问题，不是我这边能改的）';
    }
    return msg || '数据库拒绝了这条记录';
  }

  function sendToBackend(data, cb) {
    if (isMirrorSite()) {
      cb('这个镜像站收不了反馈——请到正式地址提交');
      return;
    }
    if (!backendReady()) {
      cb('客户端库没加载出来');
      return;
    }

    var client;
    try {
      client = getCloud();
    } catch (err) {
      cb('客户端初始化失败，稍后再试一次');
      return;
    }

    // 用 Promise.resolve 包一层：SDK 返回的是 thenable，
    // 这样能保证 then / catch 两套接口都在
    Promise.resolve(client.database.from('feedback').insert(data))
      .then(function (res) {
        if (res && res.error) {
          cb(humanizeError(res.error));
        } else {
          cb(null);
        }
      })
      .catch(function () {
        cb('网络连不上，检查一下网络再试');
      });
  }

  // ---------- 成功态 ----------
  var DONE_TEXT_REAL = '已经进到我的后台，只有我能看到。下一轮迭代我会一条条读。';
  var DONE_TEXT_DEMO = '演示模式：这条没真的发出去，只在本地走了一遍流程。接上数据库后才算数。';

  function showDone(isDemo) {
    if (!doneEl || !form) return;

    var p = doneEl.querySelector('p');
    if (p) p.textContent = isDemo ? DONE_TEXT_DEMO : DONE_TEXT_REAL;

    form.hidden = true;
    doneEl.hidden = false;
    setStatus('');

    // 焦点挪到成功提示上。否则抽屉里安安静静，朗读软件用户不知道发生了什么
    var h3 = doneEl.querySelector('h3');
    if (h3) {
      h3.setAttribute('tabindex', '-1');
      h3.focus();
    }
  }

  function resetForm() {
    if (!form) return;
    form.reset();
    clearError();
    setStatus('');
    setLoading(false);
    form.hidden = false;
    if (doneEl) doneEl.hidden = true;
    updateCount();
  }

  // ---------- 事件 ----------
  trigger.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  scrim.addEventListener('click', close);
  form.addEventListener('submit', onSubmit);

  if (msgEl) msgEl.addEventListener('input', updateCount);

  if (againBtn) againBtn.addEventListener('click', function () {
    resetForm();
    if (msgEl) msgEl.focus();
  });

  if (doneClose) doneClose.addEventListener('click', close);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) close();
  });

  // ---------- 初始化 ----------
  if (noticeEl) noticeEl.hidden = backendReady() && !isMirrorSite();
  if (noticeEl && isMirrorSite()) {
    // 镜像站：如实说清「这里收不了」，并给出正式地址（DOM 方式拼，不拼 HTML 字符串）
    noticeEl.textContent = '这是镜像站，收不了反馈（后台只接受正式地址与本机预览）。请到 ';
    var home = document.createElement('a');
    home.href = CLOUD_CONFIG.endpoint;
    home.target = '_blank';
    home.rel = 'noopener';
    home.className = 'fb-notice-link';
    home.textContent = '正式地址';
    noticeEl.appendChild(home);
    noticeEl.appendChild(document.createTextNode(' 提交，谢谢。'));
    if (submitBtn) submitBtn.setAttribute('aria-disabled', 'true');   // 边界用 aria-disabled，不用 disabled
  }
  updateCount();
})();


// ---------- 每日推荐的「保鲜层」（2026-09-26，用户拍板的方案②） ----------
// 正式地址是「发布时的快照」：小票内容在发布那天就定格了，而自动任务每天只更新 GitHub 仓库。
// 这里从 GitHub 原始文件拉**最新生成**的整段每日推荐（由同一个 build-daily.py 生成，零模板漂移），
// 比快照新就整段换上；拉不到 / 内容不比快照新，就保持快照 —— 最坏情况 = 现状，不会更差。
// ⚠️ 分支名写死 v3：开 V4 分支时这里要跟着改（与 sync-version 跟随当前分支是同一个维护点）。
(function () {
  if (!window.fetch || !window.DOMParser) return;
  var RAW = 'https://raw.githubusercontent.com/TaiVerdus/mypage/v3/index.html';
  fetch(RAW, { cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }).then(function (html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var fresh = doc.querySelector('.daily.reveal');
    var mine  = document.querySelector('.daily.reveal');
    if (!fresh || !mine) return;
    var fd = (fresh.innerHTML.match(/AS OF (\d{4}-\d{2}-\d{2})/) || [])[1];
    var od = (mine.innerHTML.match(/AS OF (\d{4}-\d{2}-\d{2})/) || [])[1];
    if (!fd || fd === od) return;                 // 快照已是最新（同一天）就不折腾
    mine.innerHTML = fresh.innerHTML;             // 整段换成最新生成的（DOM 方式，不拼字符串）
  }).catch(function () { /* 拉不到就保持快照，静默 */ });
})();


/* ---------- 提问记录（2026-09-26 新增）----------
   每收到一个提问就匿名记一条，用来回答「大家最常问分身什么」（QUESTIONS.md）。
   为什么挂在**前端**而不是后端：后端只看得见「走云端」的提问 —— 余额护栏触发、断网、
   以及纯离线兜底的那些提问它根本收不到，而那些同样是真实提问。
   四条硬约束：
     ① **只记问题文字**：不记身份、不记回答、不记多轮对话（那些仍只留在访客自己的浏览器里）；
     ② **失败绝不影响聊天**：网络断了 / 被拦截 / 表不在 —— 一律静默吞掉，聊天照常；
     ③ **不阻塞**：fire-and-forget（`keepalive` 让它在页面被关掉时也送得出去）；
     ④ 配置取自 `window.MYPAGE_CLOUD_CONFIG`（**只有一份**，在反馈抽屉那个模块里定义）；
        读不到配置就整个不动 —— 没联网也能照常聊天。
   ⚠️ 镜像站（github.io）上这条会被跨域拦住 —— 与反馈表单同一个限制，属预期。 */
window.__mypageLogQuestion = function (text) {
  var cfg = window.MYPAGE_CLOUD_CONFIG;
  var q = String(text == null ? '' : text).trim().slice(0, 500);   // 与表中 500 字约束一致
  if (!cfg || !cfg.endpoint || !cfg.publishableKey || !q) return;
  try {
    fetch(cfg.endpoint + '/.cloud/database/rest/chat_questions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wb-webapp-access-key': cfg.publishableKey,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ question: q }),
      keepalive: true
    }).catch(function () { /* 记不上就算了，不打扰访客 */ });
  } catch (e) { /* fetch 不可用也一样静默 */ }
};
