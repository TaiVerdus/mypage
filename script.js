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
    keywords: ['学', '课程', 'calculus', '微积分', 'linear', '线性代数', '编程', 'computer', 'program', '上课', '专业课'],
    answer: '释贤最近主要在学三样：Calculus（微积分）、Linear Algebra（线性代数）和 Computer Programming（计算机编程）。数学和编程两手抓，脑机接口方向的基本功。'
  },
  {
    keywords: ['脑机接口', 'bci', '专业', '身份', '方向', '为什么选'],
    answer: '释贤是一名脑机接口方向的学生。为什么选这个方向？说实话他没跟我细讲过，我不敢替他编——你可以直接问问他本人。'
  },
  {
    keywords: ['兴趣', '爱好', '喜欢', '音乐', '架子鼓', '鼓', '书法', '篮球', '打球', '业余', '课余'],
    answer: '释贤的课余生活挺丰富的：听音乐、打架子鼓、练书法、打篮球。动静都全了——鼓和篮球是动，书法是静。'
  },
  {
    keywords: ['enfj', '性格', '人格', '什么样的人', '特点', '记忆点', 'mbti', '内核'],
    answer: '释贤是 ENFJ，朋友们对他的评价是「内核比较强」——遇事稳得住，不容易慌。想更直观地感受？跟他聊聊天就知道了。'
  },
  {
    keywords: ['ai', '前沿', '科技', '关注', '技术', '未来'],
    answer: '释贤很关注 AI 前沿科技，尤其是和脑机接口交叉的部分。具体的见解他本人讲得比我好，建议当面聊聊。'
  },
  {
    keywords: ['你是谁', '名字', '介绍', '王释贤', '释贤', 'hello', 'hi', '你好', '在吗'],
    answer: '你好！我是王释贤的数字分身，负责在他不在线的时候招待访客。他的基本信息我都知道：ENFJ、脑机接口学生、关注 AI 前沿科技，欢迎接着问～'
  }
];

var FALLBACK = '这个我还不知道，可以问我的真人释贤——我只说他告诉过我的事，不能瞎编。';

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

  var typing = addMessage('分身正在输入…', 'bot typing'); // 3. 打字指示

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
addMessage('嗨，我是释贤的数字分身！可以问我他在学什么、是个什么样的人、有什么爱好——答不上的我会老实说不知道。', 'bot');

// ---------- 交互四：自定义光标 ----------
var cursor = document.getElementById('customCursor');
var isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

if (cursor && isDesktop) {
  var mouseX = 0, mouseY = 0;
  var cursorX = 0, cursorY = 0;

  document.addEventListener('mousemove', function (e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // 平滑跟随（lerp 插值）
  function animateCursor() {
    cursorX += (mouseX - cursorX) * 0.2;
    cursorY += (mouseY - cursorY) * 0.2;
    cursor.style.left = cursorX + 'px';
    cursor.style.top = cursorY + 'px';
    requestAnimationFrame(animateCursor);
  }
  animateCursor();

  // hover 到可交互元素时放大
  var interactiveEls = document.querySelectorAll('a, button, input, .quick-btn, .info-card');
  interactiveEls.forEach(function (el) {
    el.addEventListener('mouseenter', function () {
      cursor.classList.add('hovering');
    });
    el.addEventListener('mouseleave', function () {
      cursor.classList.remove('hovering');
    });
  });
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

// ---------- 交互十：环境音开关（BGM） ----------
// 设计取舍：**绝不自动播放**，理由三条——
//   ① 浏览器本来就拦：没有用户手势不会出声，硬做只会拿到一个失败的控制台报错
//   ② 别人可能在教室 / 图书馆 / 工位旁边点开这个链接，突然出声是负体验
//   ③ WCAG 1.4.2：自动播放超过 3 秒的音频必须提供暂停手段
// 另外**不记住开关状态**：每次进来都是安静的，一次点击才出声。
// （记住「开」的话，下次加载会因为自动播放限制而失败，反而更糟）
var bgm = document.getElementById('bgm');
var bgmBtn = document.getElementById('bgmToggle');
var BGM_VOLUME = 0.34;      // 背景音要明显压住，不能抢主体
var FADE_MS = 1200;         // 淡入淡出时长：直接 play() 会「啪」一下开始
var bgmOn = false;
var bgmFade = null;

function bgmFadeTo(to, after) {
  if (bgmFade) { clearInterval(bgmFade); bgmFade = null; }
  var steps = 24;
  var from = bgm.volume;
  var i = 0;
  bgmFade = setInterval(function () {
    i++;
    var v = from + (to - from) * (i / steps);
    bgm.volume = Math.min(1, Math.max(0, v));
    if (i >= steps) {
      clearInterval(bgmFade);
      bgmFade = null;
      if (after) after();
    }
  }, FADE_MS / steps);
}

function bgmSetUI(on) {
  bgmOn = on;
  bgmBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  bgmBtn.setAttribute('aria-label', on ? '暂停环境音' : '播放环境音');
  bgmBtn.classList.toggle('is-on', on);
}

if (bgm && bgmBtn) {
  bgm.volume = 0;
  bgmSetUI(false);

  bgmBtn.addEventListener('click', function () {
    if (!bgmOn) {
      var played = bgm.play();
      bgmSetUI(true);
      bgmFadeTo(BGM_VOLUME);
      // play() 偶尔会被拒（比如标签页不可见）。被拒就退回关闭态，不骗用户
      if (played && played['catch']) {
        played['catch'](function () {
          if (bgmFade) { clearInterval(bgmFade); bgmFade = null; }
          bgm.volume = 0;
          bgmSetUI(false);
        });
      }
    } else {
      bgmSetUI(false);
      bgmFadeTo(0, function () { bgm.pause(); });
    }
  });
}
