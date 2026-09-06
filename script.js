/* ============================================================
   MYPAGE V1.1 · 交互脚本
   交互一：导航平滑滚动
   交互二：滚动时高亮当前区块的导航项
   交互三：数字分身聊天（本地知识库关键词匹配，不联网）
   ============================================================ */

// ---------- 交互一：导航平滑滚动 ----------
document.querySelectorAll('.nav-link').forEach(function (link) {
  link.addEventListener('click', function (e) {
    e.preventDefault();
    var target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// ---------- 交互二：滚动高亮当前区块 ----------
var sections = document.querySelectorAll('section[id], header[id]');
var navLinks = document.querySelectorAll('.nav-link');

function updateActiveNav() {
  var currentId = '';
  sections.forEach(function (sec) {
    if (window.scrollY >= sec.offsetTop - 80) {
      currentId = sec.id;
    }
  });
  navLinks.forEach(function (link) {
    link.classList.toggle('active', link.getAttribute('href') === '#' + currentId);
  });
}

window.addEventListener('scroll', updateActiveNav);
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
