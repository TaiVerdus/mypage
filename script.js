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
    answer: 'Shixian is focused on three things right now: Calculus, Linear Algebra, and Computer Programming. Math and coding together — the fundamentals for a brain–computer interface direction.'
  },
  {
    keywords: ['bci', 'brain', 'major', 'identity', 'focus', 'why', 'direction', 'interface'],
    answer: 'Shixian is a brain–computer interface student. Why this direction? To be honest he never told me the details, so I won’t make anything up — ask him yourself.'
  },
  {
    keywords: ['interest', 'hobby', 'hobbies', 'drum', 'drums', 'calligraphy', 'basketball', 'fun', 'free time', 'do for fun'],
    answer: 'His free time is pretty full: music, drums, calligraphy, and basketball. Loud and quiet both — drums and basketball are the loud, calligraphy is the quiet.'
  },
  {
    keywords: ['music', 'album', 'albums', 'song', 'songs', 'listen', 'listening', 'artist', 'singer', 'favourite', 'favorite', 'david tao', 'joker xue', 'justin bieber', 'bieber'],
    answer: 'Three artists he keeps coming back to: David Tao (陶喆), Joker Xue (薛之谦) and Justin Bieber. There’s a shelf of his favourite albums further down this page.'
  },
  {
    keywords: ['enfj', 'personality', 'person', 'what kind', 'mbti'],
    answer: 'Shixian is an ENFJ. Beyond the label, I’d rather not put words in his mouth — for a real sense of who he is, talk to him directly.'
  },
  {
    keywords: ['ai', 'frontier', 'tech', 'technology', 'future', 'follow', 'research'],
    answer: 'Shixian follows AI research closely, especially where it meets brain–computer interfaces. He explains his own views far better than I can — ask him directly.'
  },
  {
    keywords: ['who are you', 'name', 'intro', 'wang shixian', 'shixian', 'hello', 'hi', 'hey'],
    answer: 'Hi! I’m Wang Shixian’s digital twin, greeting visitors while he’s away. The basics: ENFJ, BCI student, into the AI frontier. Ask away.'
  }
];

var FALLBACK = 'I don’t know that one — ask the real Shixian. I only say what he’s told me, and I don’t make things up.';

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

  var typing = addMessage('typing…', 'bot typing'); // 3. 打字指示

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
addMessage('Hey, I’m Shixian’s digital twin! Ask what he’s studying, what kind of person he is, or his hobbies — and I’ll be honest when I don’t know.', 'bot');

// ---------- 交互四：全屏形状场（光标效果） ----------
// 机制参考 CodePen「Shape Wave」(Stijn Van Minnebruggen)，但**不是它的代码**：
// 那个 pen 抓不到（直接打开 404、oEmbed 也 Not Found），这里按截图里可见的结构重做 ——
// 一个形状网格（圆 + 胶囊），尺寸被波函数调制，鼠标是波源。
//
// 四条工程约束：
// ① 不挡东西：画布 z-index:-1（写在样式里）+ pointer-events:none
// ② 不拖慢页面：格子全部用离屏精灵 drawImage（比逐帧 arc() 快一个量级）、
//    DPR 封顶 2、格数按视口压到 ~1000 以内、切到后台就停
// ③ 不该动的人不动：触屏 / 系统「减少动效」→ 直接不启动
// ④ 颜色不新增：色板全部取自站点那 6 个色
var fxCanvas = document.getElementById('fxField');
var fxReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var fxCanHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

if (fxCanvas && fxCanHover && !fxReduced && fxCanvas.getContext) {
  var fxCtx = fxCanvas.getContext('2d');

  // 色板：**没有一个新色值**。青（#0F766E）与墨蓝（#0F172A）是两个不同色相，
  // 所以「别都用一个颜色」不用破配色规矩就能做到。
  // 谁出现得多靠数组里重复几次控制 —— 比写权重公式直白，以后想调也不用换算。
  var FX_COLORS = [
    '#0F766E', '#0F766E', '#0F766E',   // 青（主色，占多数）
    '#0F6562', '#0F6562',              // 深青
    '#0F172A', '#0F172A',              // 墨蓝（重音：跟青拉开色相）
    '#475569'                          // 灰蓝（零星点缀）
  ];
  var FX_INFLUENCE = 320;   // 鼠标的影响半径（px）
  var FX_MAX_R = 3.4;       // 形状最大半径 —— 再大就开始抢正文了

  var fxW = 0, fxH = 0, fxCells = [], fxSprites = [];
  var fxPointer = { x: -1e4, y: -1e4, on: false };
  var fxClock = 0, fxLast = 0, fxRaf = null;

  // 伪随机：同一个格子每次重建都长一样，resize 之后不会「洗牌」
  function fxHash(x, y) {
    return Math.abs(x * 73856093 ^ y * 19349663) % 100000;
  }

  // 精灵：每种颜色预渲染一张「圆」和一张「竖胶囊」。
  // 形状比例照 pen：胶囊宽约 size*0.48、高约 size（即 1:2 的竖条）
  function fxMakeSprite(color, size, isPill) {
    var c = document.createElement('canvas');
    var aspect = isPill ? 2 : 1;
    c.width = Math.max(2, Math.ceil(size));
    c.height = Math.max(2, Math.ceil(size * aspect));
    var g = c.getContext('2d');
    g.fillStyle = color;
    g.translate(c.width / 2, c.height / 2);
    g.beginPath();
    if (isPill) {
      var hw = size * 0.24, hh = size * 0.5;
      if (g.roundRect) g.roundRect(-hw, -hh, hw * 2, hh * 2, hw);
      else g.rect(-hw, -hh, hw * 2, hh * 2);
    } else {
      g.arc(0, 0, size / 2, 0, Math.PI * 2);
    }
    g.fill();
    return { el: c, aspect: aspect };
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
    var cols = Math.ceil(fxW / gap) + 1;
    var rows = Math.ceil(fxH / gap) + 1;

    fxCells = [];
    for (var iy = 0; iy < rows; iy++) {
      for (var ix = 0; ix < cols; ix++) {
        var h = fxHash(ix, iy);
        fxCells.push({
          x: ix * gap + (h % 11) - 5,                  // 抖 ±5px：打散网格感
          y: iy * gap + ((h >> 4) % 11) - 5,
          base: 0.28 + ((h >> 8) % 100) / 100 * 0.34,  // 基础尺寸 0.28 ~ 0.62
          pill: (h >> 3) % 9 === 0,                    // 约 1/9 是胶囊
          c: (h >> 5) % FX_COLORS.length,
          phase: ((h >> 11) % 100) / 100 * Math.PI * 2  // 初始相位，避免整齐划一
        });
      }
    }

    // 精灵按最大尺寸预渲染：画得比用到的更大，缩放下来更锐
    var spriteSize = Math.ceil(FX_MAX_R * 2 * dpr) + 2;
    fxSprites = [];
    FX_COLORS.forEach(function (color) {
      fxSprites.push(fxMakeSprite(color, spriteSize, false));
      fxSprites.push(fxMakeSprite(color, spriteSize, true));
    });
  }

  function fxFrame(now) {
    // 用累加而不是绝对时间：切后台再回来，波纹不会「瞬移」
    if (!fxLast) fxLast = now;
    fxClock += Math.min((now - fxLast) / 1000, 0.05);
    fxLast = now;
    var t = fxClock;

    fxCtx.clearRect(0, 0, fxW, fxH);

    for (var i = 0; i < fxCells.length; i++) {
      var cell = fxCells[i];

      // 环境波：鼠标不动时整片也在缓慢呼吸 —— 「全屏形状场」该有的样子
      var ambient = Math.sin(cell.x * 0.014 + cell.y * 0.011 + t * 1.15 + cell.phase);

      // 鼠标涟漪：越近越强，超出影响半径归零。
      // 平方衰减 = 近处明显、远处几乎无，涟漪才有「一圈」的感觉
      var f = 0, ripple = 0;
      if (fxPointer.on) {
        var dx = cell.x - fxPointer.x;
        var dy = cell.y - fxPointer.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < FX_INFLUENCE) {
          f = 1 - d / FX_INFLUENCE;
          f = f * f;
          ripple = Math.sin(d * 0.05 - t * 3.4);
        }
      }

      var r = FX_MAX_R * cell.base * (0.62 + 0.38 * ambient + 0.85 * f * (0.5 + 0.5 * ripple));
      if (r < 0.12) continue;                      // 太小就不画，省一次 drawImage

      var alpha = 0.05 + 0.09 * (0.5 + 0.5 * ambient) + 0.28 * f;
      if (alpha > 0.5) alpha = 0.5;                // 封顶：再深就抢正文了

      var sp = fxSprites[cell.c * 2 + (cell.pill ? 1 : 0)];
      var w = r * 2;
      fxCtx.globalAlpha = alpha;
      fxCtx.drawImage(sp.el, cell.x - w / 2, cell.y - (w * sp.aspect) / 2, w, w * sp.aspect);
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
    fxResizeTimer = setTimeout(fxBuild, 200);
  });

  fxBuild();
  fxStart();
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


