/* PRIVSRV hotfix v5 —— 原版界面优先版（纯诊断，默认不绘制）
 *
 * 用户要求：测试完了要用回【原版界面】。
 * 服务端已把 game_login 回包按 Game_RLogin schema 补齐：
 *   role / dynamicConfig(含 abTestSwitchs 对象) / roleGameConf /
 *   offLineChangeMsg / newGameDatas / followGameDatas / hotGameIdList ...
 * 原版 DiscoverPage.onLoad 不再因 undefined.isOpen 抛异常，
 * DiscoverSubPage.refresh() 能拿到作品数据，界面应能自己渲染出来。
 *
 * 因此本脚本【默认一个节点都不画】，只做两件事：
 *   1) 上报场景切换序列  -> 定位"登录中 <-> 主界面"概率闪屏
 *   2) 上报内容区结构     -> 确认原版界面是否真的出内容
 *
 * 兜底自绘（v4 那套）保留在文件里但默认关闭：
 *   var ENABLE_FALLBACK = false;
 * 万一原版仍空白，把它改成 true 即可远程启用（改 hotfix.js 立即生效，无需重装 APK）。
 *
 * 安全约束（p26 / p28 的教训）：
 *   - 不覆盖任何引擎方法（cc.instantiate / cc.Node.prototype.* 一律不碰）
 *   - 不遍历 window 对象树
 *   - 场景树遍历限深度 6 / 限节点 300，只读 name 与 children 长度
 */
(function () {
  var R = window.__psrvR || function () {};
  if (window.__psrvUI5) { try { R('UI5 already'); } catch (e) {} return; }
  window.__psrvUI5 = 1;

  // ★★ 兜底开关：默认关，绝不让自绘层盖住原版界面 ★★
  var ENABLE_FALLBACK = false;

  function S(x) { try { return String(x).replace(/\s+/g, ' ').slice(0, 140); } catch (e) { return '?'; } }
  function log(m) { try { R('UI5 ' + m); } catch (e) {} }

  var ticks = 0, lastScene = '', stableTicks = 0, fallbackDone = false;

  // ---------- 只读探测 ----------
  function probe(root) {
    var stack = [[root, 0]], seen = 0, maxChildren = -1, hits = [];
    while (stack.length && seen < 300) {
      var it = stack.pop(), n = it[0], d = it[1];
      if (!n || d > 6) continue;
      seen++;
      var nm = '';
      try { nm = n.name || ''; } catch (e) {}
      // 原版列表/页面组件的强信号：出现这些名字说明 DiscoverPage 真的在渲染
      if (/Discover|Recommend|GameCell|ChosenComp|typeComp|GameTag|BbsBanner|ScrollList|HomeScene/i.test(nm)) {
        if (hits.length < 10) hits.push(nm);
      }
      var cnt = -1;
      try { cnt = (n.children && n.children.length) || 0; } catch (e) {}
      if (cnt > maxChildren) maxChildren = cnt;
      if (cnt > 0) {
        var ch = null;
        try { ch = n.children; } catch (e) {}
        if (ch) for (var i = 0; i < ch.length && i < 40; i++) stack.push([ch[i], d + 1]);
      }
    }
    return { maxChildren: maxChildren, seen: seen, hits: hits };
  }

  function snapshot() {
    var sc = null;
    try { sc = cc.director.getScene(); } catch (e) { return null; }
    if (!sc) return null;
    var name = '';
    try { name = sc.name || ''; } catch (e) {}
    var root = null;
    try { root = (cc.find && cc.find('Canvas')) || sc; } catch (e) { root = sc; }
    var p = probe(root || sc);
    return { name: name, parent: root, maxChildren: p.maxChildren,
             seen: p.seen, hits: p.hits };
  }

  // ---------- 场景切换上报（抓闪屏） ----------
  function reportScene(name) {
    if (name !== lastScene) {
      log('SCENE ' + S(lastScene) + ' -> ' + S(name) + ' t=' + ticks);
      lastScene = name;
      stableTicks = 0;
    } else {
      stableTicks++;
    }
  }

  // ---------- 兜底绘制（仅在 ENABLE_FALLBACK=true 且原版确定空白时启动） ----------
  var GAMES = [
    ['像素冒险', '3580 人在玩'], ['方块生存', '2410 人在玩'],
    ['弹幕射击', '1890 人在玩'], ['迷宫探秘', '1520 人在玩'],
    ['塔防物语', '1203 人在玩'], ['跑酷达人', '980 人在玩']
  ];
  var COLORS = [[255,214,140],[150,208,255],[205,178,255],[160,228,185],[255,178,178],[255,225,155]];
  var INK = null, GRAY = null;
  try { INK = cc.color(30,32,40); } catch (e) {}
  try { GRAY = cc.color(140,144,155); } catch (e) {}

  function rect(g, x, y, w, h, rgb) {
    try { g.fillColor = cc.color(rgb[0],rgb[1],rgb[2],255); g.rect(x,y,w,h); g.fill(); } catch (e) {}
  }
  function label(p, text, size, x, y, w, h, col) {
    try {
      var n = new cc.Node(); var l = n.addComponent(cc.Label);
      l.string = text; l.fontSize = size;
      try { l.horizontalAlign = cc.Label.HorizontalAlign.CENTER; } catch (e) {}
      try { l.verticalAlign = cc.Label.VerticalAlign.CENTER; } catch (e) {}
      try { n.setContentSize(w,h); } catch (e) {}
      try { n.setPosition(x,y); } catch (e) {}
      if (col) { try { n.color = col; } catch (e) {} }
      p.addChild(n);
    } catch (e) {}
  }
  function drawFallback(parent) {
    try {
      var cs = null, ap = null;
      try { cs = parent.getContentSize(); } catch (e) {}
      try { ap = parent.getAnchorPoint(); } catch (e) {}
      var W = (cs && cs.width) || 720, H = (cs && cs.height) || 1280;
      var ax = (ap && typeof ap.x === 'number') ? ap.x : 0.5;
      var ay = (ap && typeof ap.y === 'number') ? ap.y : 0.5;
      var layer = new cc.Node('PSRV_UI5_FALLBACK');
      parent.addChild(layer);
      try { layer.setPosition((0.5-ax)*W, (0.5-ay)*H); } catch (e) {}
      try { layer.zIndex = 10000; } catch (e) {}
      var left = -W/2+20, right = W/2-20, top = H/2-70, bottom = -H/2+130;
      var cw = right-left;
      var gNode = new cc.Node(); var g = gNode.addComponent(cc.Graphics);
      layer.addChild(gNode);
      rect(g, left, bottom, cw, top-bottom, [244,246,251]);
      rect(g, left, top-66, cw, 66, [255,255,255]);
      label(layer, '发现 · 推荐作品', 34, 0, top-33, cw-40, 60, INK);
      var tabH = 68, tabTop = top-66-tabH;
      rect(g, left, tabTop, cw, tabH, [255,255,255]);
      rect(g, left, tabTop+6, cw/4-8, 5, [250,90,90]);
      var tabs = ['发现','精选','最新','关注'];
      for (var i=0;i<4;i++)
        label(layer, tabs[i], 28, left+cw*(i+0.5)/4, tabTop+tabH/2, cw/4-12, 56, i===0?INK:GRAY);
      var gridTop = tabTop-16, gap = 16, cardW = (cw-gap*3)/2;
      var cardH = Math.min(150, (gridTop-bottom-gap*4)/3);
      if (cardH < 60) cardH = 60;
      for (var k=0;k<GAMES.length;k++) {
        var cx = left+gap+(k%2)*(cardW+gap)+cardW/2;
        var cy = gridTop-gap-Math.floor(k/2)*(cardH+gap)-cardH/2;
        rect(g, cx-cardW/2, cy-cardH/2, cardW, cardH, COLORS[k]);
        label(layer, GAMES[k][0], 30, cx, cy+18, cardW-20, 44, INK);
        label(layer, GAMES[k][1], 22, cx, cy-24, cardW-20, 36, GRAY);
      }
      log('FALLBACK drawn children=' + (layer.children ? layer.children.length : '?'));
    } catch (e) { log('FALLBACK ERR ' + S(e && e.stack || e)); }
  }

  // ---------- 主轮询 ----------
  function tick() {
    try {
      var s = snapshot();
      if (s) {
        reportScene(s.name);
        if (ticks % 5 === 0) {
          log('scan scene=' + S(s.name) + ' maxChildren=' + s.maxChildren +
              ' seen=' + s.seen + ' stable=' + stableTicks +
              ' native=[' + S(s.hits.join(',')) + ']');
        }
        // 原版组件出现 -> 确认原版界面已渲染
        if (s.hits.length >= 2 && !fallbackDone) {
          log('NATIVE OK 原版界面已渲染，未启用兜底');
          fallbackDone = true;
        }
        // 兜底（默认关闭）：主界面稳定 10 tick 仍几乎无节点
        if (ENABLE_FALLBACK && !fallbackDone && stableTicks >= 10 &&
            s.maxChildren <= 1 && /Home|Game|Main/i.test(s.name)) {
          log('NATIVE EMPTY 启用兜底');
          fallbackDone = true;
          drawFallback(s.parent || cc.director.getScene());
        }
      }
    } catch (e) { log('tick ERR ' + S(e && e.stack || e)); }
    if (++ticks < 120) setTimeout(tick, 800);
    else log('stop polling');
  }

  log('start cc=' + (typeof cc) + ' dir=' + (window.cc && cc.director ? 'yes' : 'no') +
      ' fallback=' + ENABLE_FALLBACK);
  setTimeout(tick, 300);
})();


/* PRIVSRV hotfix v6 —— 实时刷新（缓存失效 + 事件重拉）
 * 目标：解决"发布/改名后必须杀 APP 重开才显示最新数据"的问题。
 * 原理：各数据 Mng 用 Map 缓存，命中缓存就不再向服务端请求；本脚本在页面进入/回前台时
 *       先清缓存，再 cc.game.emit 触发页面 refreshList() 重新 loadAll()。
 * 安全约束：不覆盖引擎方法、不遍历 window 全局树、场景遍历限深限点。
 */
(function () {
  var R = window.__psrvR || function () {};
  function log(m) { try { R('RF ' + m); } catch (e) {} }
  if (window.__psrvRF) { try { log('already'); } catch (e) {} return; }
  window.__psrvRF = 1;

  // ---------- 拿全局 require（webpack 挂在 window 上）----------
  function req(name) {
    try { return window.__require ? window.__require(name) : null; }
    catch (e) { return null; }
  }
  function pickMng(mod) {
    // 模块导出可能是 {Ins} 或 {default:{Ins}} 或类本身带 .Ins
    if (!mod) return null;
    if (mod.Ins) return mod.Ins;
    if (mod.default && mod.default.Ins) return mod.default.Ins;
    return null;
  }

  function getGameMng() {
    try {
      var M = req('Mng');
      var Cls = M && (M.Mng || (M.default && M.default.Mng));
      var Ins = Cls && (Cls.Ins || Cls.mine);
      return Ins && Ins.gameMng ? Ins.gameMng : null;
    } catch (e) { return null; }
  }
  function getShopMng() { try { return pickMng(req('ShopMng')); } catch (e) { return null; } }
  function getTalkMng() { try { return pickMng(req('TalkMng')); } catch (e) { return null; } }

  // ---------- 清缓存 ----------
  function clearAllCaches() {
    var n = 0;
    try {
      var gm = getGameMng();
      if (gm && gm.cache && gm.cache.clear) { gm.cache.clear(); n++; }
    } catch (e) {}
    try {
      var sm = getShopMng();
      if (sm) {
        if (sm.infoCache && sm.infoCache.clear) { sm.infoCache.clear(); n++; }
        if (sm.cache && sm.cache.clear) { sm.cache.clear(); n++; }
      }
    } catch (e) {}
    try {
      var tm = getTalkMng();
      if (tm && tm.clearCache) { tm.clearCache(); n++; }
      else if (tm) {
        ['simpleMap','detailMap','userTalks','collectTalks'].forEach(function (k) {
          try { var v = tm[k]; if (v && v.clear) v.clear(); else if (Array.isArray(v)) tm[k] = []; }
          catch (e) {}
        });
        n++;
      }
    } catch (e) {}
    return n;
  }

  // ---------- 触发各页面重拉 ----------
  function emitRefresh() {
    var evs = ['MyGameChange','MyGoodsChange','GameStatusChange','GoodsStatusChange',
               'MinePage_Refresh','Talk_Refresh'];
    evs.forEach(function (e) { try { cc.game.emit(e); } catch (err) {} });
  }

  // ---------- 场景检测：找到"我的"页组件是否存在 ----------
  function sceneHas(name) {
    try {
      var sc = cc.director.getScene();
      if (!sc) return false;
      var found = false;
      var stack = [sc], seen = 0;
      while (stack.length && seen < 300) {
        var node = stack.pop(); seen++;
        var nm = '';
        try { nm = node.name || ''; } catch (e) {}
        if (nm === name) { found = true; break; }
        var ch = null; try { ch = node.children; } catch (e) {}
        if (ch) for (var i = 0; i < ch.length && i < 40; i++) stack.push(ch[i]);
      }
      return found;
    } catch (e) { return false; }
  }

  // ---------- 核心刷新动作 ----------
  function doRefresh(tag) {
    var c = clearAllCaches();
    emitRefresh();
    log('REFRESH ' + tag + ' cleared=' + c);
  }
  window.__psrvRefresh = function () { doRefresh('manual'); };

  // ---------- 自动刷新：检测页面切换 ----------
  // 策略：周期性检测；当发现"我的"页相关节点出现、且上一周期不在，视为"刚进入"→刷新一次。
  // 由于节点名可能本地化，采用组合信号：场景节点里出现 MinePage 组件实例。
  function hasComp(clsName) {
    try {
      var mod = req(clsName);
      var Cls = mod && (mod.default || mod);
      if (!Cls) return false;
      var sc = cc.director.getScene();
      if (!sc) return false;
      var stack = [sc], seen = 0;
      while (stack.length && seen < 300) {
        var node = stack.pop(); seen++;
        try {
          var comp = node.getComponent(Cls);
          if (comp) return true;
        } catch (e) {}
        var ch = null; try { ch = node.children; } catch (e) {}
        if (ch) for (var i = 0; i < ch.length && i < 40; i++) stack.push(ch[i]);
      }
    } catch (e) {}
    return false;
  }

  var lastMine = false, lastVisible = null, ticks = 0;
  function tick() {
    try {
      // 回前台检测（页面从后台切回，document.visibilityState 变化）
      var vis = null;
      try { vis = document.visibilityState; } catch (e) {}
      if (lastVisible && vis === 'visible' && lastVisible !== 'visible') {
        doRefresh('resume');
      }
      lastVisible = vis;

      // 进入"我的"页检测（每 3 tick 查一次）
      if (ticks % 3 === 0) {
        var inMine = hasComp('MinePage');
        if (inMine && !lastMine) doRefresh('enter-mine');
        lastMine = inMine;
      }

      // 首次启动 6 秒后全刷一次，确保拿到最新数据
      if (ticks === 4) doRefresh('boot');

      // 定时兜底：每 20 tick(约30秒) 静默全刷一次，即使页面检测失效也能保持数据新鲜
      if (ticks > 0 && ticks % 20 === 0) doRefresh('auto');
    } catch (e) {}
    ticks++;
    setTimeout(tick, 1500);   // 常驻，不停
  }
  log('start v6 req=' + (typeof window.__require) + ' cc=' + (typeof cc));
  setTimeout(tick, 1200);
})();
