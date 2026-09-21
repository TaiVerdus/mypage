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

var KNOWLEDGE = [
  {
    keywords: ['study', 'studying', 'course', 'calculus', 'linear', 'algebra', 'program', 'programming', 'major', 'class', 'classes'],
    answer: '释贤现在重心在三件事上：微积分、线性代数和计算机编程。数学加编程——这是脑机接口方向的基本功。'
  },
  {
    keywords: ['bci', 'brain', 'major', 'identity', 'focus', 'why', 'direction', 'interface'],
    answer: '释贤是脑机接口方向的学生。为什么选这个方向？说实话他没告诉过我细节，所以我不编——你自己问他。'
  },
  {
    keywords: ['interest', 'hobby', 'hobbies', 'drum', 'drums', 'calligraphy', 'basketball', 'fun', 'free time', 'do for fun'],
    answer: '他课余挺满的：听音乐、打鼓、练书法、打篮球。安静的吵闹的都有——打鼓和篮球是吵的，书法是静的。'
  },
  {
    keywords: ['music', 'album', 'albums', 'song', 'songs', 'listen', 'listening', 'artist', 'singer', 'favourite', 'favorite', 'david tao', 'joker xue', 'justin bieber', 'bieber'],
    answer: '他常回去听的三位：陶喆、薛之谦、Justin Bieber。下面还有一栏他喜欢的专辑。'
  },
  {
    keywords: ['enfj', 'personality', 'person', 'what kind', 'mbti'],
    answer: '释贤是 ENFJ。除了这个标签，我不想替他多说——想真正认识他，直接找他聊。'
  },
  {
    keywords: ['ai', 'frontier', 'tech', 'technology', 'future', 'follow', 'research'],
    answer: '释贤一直跟着 AI 的研究走，尤其是它和脑机接口交叉的地方。他自己的看法比我能说的清楚多了——直接问他。'
  },
  {
    keywords: ['who are you', 'name', 'intro', 'wang shixian', 'shixian', 'hello', 'hi', 'hey'],
    answer: '嗨！我是王释贤的数字分身，他不在的时候替他招呼一下访客。基本情况：ENFJ、脑机接口方向、关注 AI 前沿。随便问。'
  }
];

var FALLBACK = '这个我不知道——去问本人吧。我只说告诉过我的事，不编。'

var messagesEl = document.getElementById('chatMessages');
var inputEl = document.getElementById('chatInput');
var sendBtn = document.getElementById('chatSend');
var quickEl = document.getElementById('chatQuick');

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

function ask(question) {
  if (!question.trim()) return;

  addMessage(question, 'user');          // 1. 先显示用户的问题
  inputEl.value = '';                     // 2. 清空输入框

  var typing = addMessage('正在输入…', 'bot typing'); // 3. 打字指示

  setTimeout(function () {                // 4. 模拟思考延迟后给出回答
    typing.remove();
    addMessage(matchAnswer(question), 'bot');
  }, 700);
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

// 快捷问题：点击即发送
quickEl.querySelectorAll('.quick-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    ask(btn.textContent);
  });
});

// 开场白：分身先打招呼
addMessage('嗨，我是释贤的数字分身！你可以问他正在学什么、是个什么样的人，或者他有什么爱好——不知道的事我会直说。', 'bot');


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
//      切后台停、触屏与「减少动效」直接不启动。
//   另外它靠 `[data-shape-mask]` 在内容处「挖洞」。本站的画布本来就压在内容之下
//   （z-index: -1），不需要挖洞，这套 mask 机制整个略去。
//
// 四条工程约束：
// ① 不挡东西：画布 z-index:-1（写在样式里）+ pointer-events:none
// ② 不拖慢页面：精灵预渲染 + drawImage、DPR 封顶 2、格数 ~1000 以内、切后台就停
// ③ 不该动的人不动：触屏 / 系统「减少动效」→ 不启动
// ④ 颜色不新增：色板全部落在站点那 6 色内
var fxCanvas = document.getElementById('fxField');
var fxReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var fxCanHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

if (fxCanvas && fxCanHover && !fxReduced && fxCanvas.getContext) {
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
                         '.contact-title, .contact-subtitle, ' +
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

  function fxFrame(now) {
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

  window.addEventListener('mousemove', function (e) {
    fxPointer.x = e.clientX;
    fxPointer.y = e.clientY;
    fxPointer.on = true;
    fxActivity = 1;                    // 手一动就重新点亮动量（照 pen 的 onMove）
  }, { passive: true });

  // 点击 → 从落点发出一圈扩散的波（照 pen 的 triggerWave）。
  // **passive + 不拦截**：页面上其他点击（导航、按钮、链接、聊天的输入框）一律照常，
  // 这条监听只负责「顺便放一圈波」。
  window.addEventListener('click', function (e) {
    fxWaves.push({ x: e.clientX, y: e.clientY, t: fxClock });
  }, { passive: true });

  // 鼠标离开窗口：涟漪收回，只留环境波
  document.addEventListener('mouseleave', function () {
    fxPointer.on = false;
  });

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

// ---------- 交互七：数据条数字滚动 ----------
var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function countUp(el) {
  var target = parseInt(el.getAttribute('data-count'), 10);
  if (isNaN(target)) return;

  if (reduceMotion) {
    el.textContent = target;
    return;
  }

  var duration = 900;
  var startTime = null;

  function step(now) {
    if (startTime === null) startTime = now;
    var p = Math.min((now - startTime) / duration, 1);
    var eased = 1 - Math.pow(1 - p, 3);      // ease-out cubic
    el.textContent = Math.round(target * eased);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

var statNums = document.querySelectorAll('.stat-num');

if ('IntersectionObserver' in window && !reduceMotion) {
  var statObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        countUp(entry.target);
        statObserver.unobserve(entry.target);   // 只数一次
      }
    });
  }, { threshold: 0.6 });

  statNums.forEach(function (el) {
    statObserver.observe(el);
  });
}

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


