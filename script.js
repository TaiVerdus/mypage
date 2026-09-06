/* ============================================================
   MYPAGE · V1 交互脚本（按计划只做 2 个交互）
   交互一：导航点击后平滑滚动到对应区块
   交互二：页面滚动时高亮"当前所在区块"对应的导航项
   ============================================================ */

// ---------- 交互一：导航平滑滚动 ----------
// 给每个导航链接绑定点击事件，阻止默认跳转，改为平滑滚动
document.querySelectorAll('.nav-link').forEach(function (link) {
  link.addEventListener('click', function (e) {
    e.preventDefault(); // 阻止浏览器默认的"瞬间跳转"

    // this.getAttribute('href') 的值形如 "#about"
    // document.querySelector('#about') 即可拿到目标区块的元素
    var target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' }); // 平滑滚动
    }
  });
});

// ---------- 交互二：滚动时高亮当前区块的导航项 ----------
// 思路：监听页面滚动，逐个检查区块的位置，
// 找到"当前视口顶部所在"的那个区块，把对应导航项加上 active 类

var sections = document.querySelectorAll('section[id], header[id], footer[id]');
var navLinks = document.querySelectorAll('.nav-link');

function updateActiveNav() {
  var currentId = '';

  // offsetTop 是区块顶端到页面顶部的距离
  // 滚动位置超过某区块顶端（留 80px 余量给导航栏）时，认为已进入该区块
  sections.forEach(function (sec) {
    if (window.scrollY >= sec.offsetTop - 80) {
      currentId = sec.id;
    }
  });

  // 滚动接近页面底部时，强制高亮最后一项（联系我）
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 40) {
    currentId = 'contact';
  }

  navLinks.forEach(function (link) {
    // 命中的加 active，其余的移除
    link.classList.toggle('active', link.getAttribute('href') === '#' + currentId);
  });
}

// 监听滚动事件；滚动很频繁，这个简单页面直接处理即可
window.addEventListener('scroll', updateActiveNav);
// 页面刚打开时也执行一次，保证初始状态正确
updateActiveNav();
