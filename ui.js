/* ニワトリドリ：描画（ホスト・参加者で共通。受け取ったビューだけを使う） */
'use strict';
var ui = { gameKey: '', lastEv: 0, sayId: 0, roundKey: '', roundShownAt: 0, endKey: '', peek: false, sel: null, ins: null, insKey: '', rulesMode: 'basic', fresh: -1 };
function render(v) {
  lastView = v; window.__nt.view = v;
  BGM.want(v.phase === 'game' && v.g ? (v.g.ultra ? 'epic' : 'normal') : null);
  noticeUi(v);
  if (v.phase !== 'game') overlay('roundModal', false);
  if (v.phase === 'lobby') { show('lobby'); renderLobby(v); ui.gameKey = ''; return; }
  if (v.phase === 'end') { show('end'); renderEnd(v); return; }
  show('game'); renderGame(v);
}
var seenNotice = null;
function noticeUi(v) {
  if (seenNotice === null) seenNotice = v.notice ? v.notice.id : 0;
  else if (v.notice && v.notice.id !== seenNotice) { seenNotice = v.notice.id; if (v.notice.toast || !host) toast(v.notice.msg + (!v.notice.toast && v.phase === 'lobby' ? '。ロビーで次のゲームを待っています' : '')); }
  if (v.phase === 'lobby') overlay('menuModal', false);
  var bar = $('lobbyReqBar'), key = host && v.lobbyReq && v.phase !== 'lobby' ? v.lobbyReq.sid + ':' + v.lobbyReq.at : '';
  if (bar.dataset.key !== key) {
    bar.dataset.key = key;
    bar.innerHTML = key ? '<span>🙋 ' + esc(v.lobbyReq.name) + '「ロビーに戻りたい」</span><button data-lr="abort">中断してロビーへ</button><button data-lr="no" class="ghost">とじる</button>' : '';
    bar.classList.toggle('show', !!key);
  }
}
// ---------------- ロビー ----------------
function lvSelect(c, lv) { return '<select data-c="' + c + '" data-k="lv" class="' + (lv === 'ultra' ? 'ultra' : '') + '" aria-label="CPUの強さ">' + LV_KEYS.map(function (k) { return '<option value="' + k + '"' + (k === lv ? ' selected' : '') + '>' + LV[k] + '</option>'; }).join('') + '</select>'; }
function chSelect(c, ch) { return '<select data-c="' + c + '" data-k="ch" aria-label="キャラクター">' + CH_KEYS.map(function (k) { return '<option value="' + k + '"' + (k === ch ? ' selected' : '') + '>' + CH[k].e + ' ' + CH[k].name + '</option>'; }).join('') + '</select>'; }
function renderLobby(v) {
  var isHost = !!host, n = v.seats.length, mode = v.opts.mode, M = L.MODES[mode];
  document.body.classList.toggle('solo', !!v.solo);
  $('codeBig').textContent = v.code;
  var url = inviteUrl(v.code);
  $('inviteUrl').textContent = url;
  if (!v.solo && $('qr').dataset.url !== url) {
    try { var qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { $('qr').textContent = ''; }
    $('qr').dataset.url = url;
  }
  $('seatCount').textContent = n + ' / ' + MAX_HUMANS + '人';
  $('seatList').innerHTML = v.seats.map(function (s, i) {
    var tags = (s.kind === 'host' ? '<span class="tagx host">ホスト</span>' : '') + (i === v.you && s.name !== 'あなた' ? '<span class="tagx you">あなた</span>' : '') + (s.kind === 'remote' && !s.connected ? '<span class="tagx off">切断</span>' : '');
    return '<div class="seat' + (s.connected ? '' : ' offline') + '"><span class="av">' + (i + 1) + '</span><span class="nm">' + esc(s.name) + '</span>' + tags + (isHost && s.kind === 'remote' ? '<button class="xbtn" data-sid="' + s.sid + '" aria-label="外す">×</button>' : '') + '</div>';
  }).join('');
  $('modeSeg').innerHTML = L.MODE_KEYS.map(function (k) { var R = L.MODES[k].np; return '<button data-v="' + k + '" class="' + (k === mode ? 'on' : '') + '"' + (isHost && n <= R[1] ? '' : ' disabled') + '>' + MODE_UI[k].n + (k === 'basic' ? '（おすすめ）' : '') + '<small>' + MODE_UI[k].s + '</small></button>'; }).join('');
  $('modeSeg').classList.toggle('ro', !isHost);
  $('modeDesc').textContent = MODE_UI[mode].d;
  var np = Math.min(M.np[1], Math.max(v.opts.np, n, M.np[0])), ks = [];
  for (var k = M.np[0]; k <= M.np[1]; k++) ks.push(k);
  $('npSeg').innerHTML = ks.map(function (k) { return '<button data-v="' + k + '" class="' + (k === np ? 'on' : '') + '"' + (isHost && k >= n ? '' : ' disabled') + '>' + k + '人</button>'; }).join('');
  $('npSeg').classList.toggle('ro', !isHost);
  var owners = planOwners(v.seats, v.opts), ci = 0;
  $('cpuList').innerHTML = owners.map(function (o, c) {
    if (o.kind !== 'cpu') return '<div class="crow"><span class="av" style="background:#2f6b4a">' + (c + 1) + '</span><span class="nm">' + esc(o.name) + (o.sid === v.sid && o.name !== 'あなた' ? '（あなた）' : '') + '</span></div>';
    var i = ci++;
    return '<div class="crow"><span class="av" style="background:' + CH[o.ch].col + '">' + CH[o.ch].e + '</span>' +
      (isHost ? chSelect(i, o.ch) + '<span class="nm"></span>' + lvSelect(i, o.lv) : '<span class="nm">' + esc(o.name) + '</span><span class="lv ' + o.lv + '">' + LV[o.lv] + '</span>') + '</div>';
  }).join('');
  $('lvAllSeg').innerHTML = LV_KEYS.map(function (k) { return '<button data-v="' + k + '"' + (isHost ? '' : ' disabled') + '>' + (k === 'ultra' ? 'アストラ<br>ウルトラ😎' : LV[k]) + '</button>'; }).join('');
  $('lvAllBox').style.display = ci && isHost ? '' : 'none';
  $('seatHint').textContent = v.solo ? '' : '2〜6人で遊べます（2人はデュエル）。空いた席は CPU が入ります。招待URLかQRで、各自のスマホから参加してね';
  $('startBtn').disabled = n < 1 || n > M.np[1];
  ui.rulesMode = mode;
}
// ---------------- ゲーム画面 ----------------
function nm(g, p, me) { var o = g.owners[p]; if (!o) return '?'; if (p === me) return 'あなた'; return o.kind === 'cpu' ? o.e + o.name + (o.lv === 'ultra' ? '😎' : '') : o.name; }
function myTurn(g) { return g.need && g.need.p === g.me && g.wait <= 0 && g.phase === 'play'; }
function evText(g, e, me) {
  var N = function (p) { return esc(nm(g, p, me)); }, s = '', cls = '';
  if (e.k === 'round') { cls = 'sys'; s = '―― ' + (g.mode === 'duel' ? 'デュエル' : 'ラウンド' + e.round) + ' スタート（' + N(e.start) + 'から）――'; }
  else if (e.k === 'play') s = N(e.p) + '：' + comboText(e.v, e.n) + (e.nf ? '（手前の札' + e.nf + '枚こみ）' : '') + (e.lead ? ' <small>で開始</small>' : '');
  else if (e.k === 'take') s = '　' + N(e.p) + 'は 前の ' + comboText(e.v, e.n) + ' を' + (e.keep ? '<b>手札に加えた</b>' : e.auto ? '捨てた（あがり）' : '捨てた') + (e.mine && e.mine.pos >= 0 ? ' <span class="pv">（' + (e.mine.pos + 1) + '番目に）</span>' : '');
  else if (e.k === 'pass') s = N(e.p) + '：パス' + (e.lose ? ' <span class="bad">（手前の札がない！）</span>' : e.drew ? '（山から1枚）' : e.front ? '（手前の札を使う）' : g.mode !== 'duel' ? '（山札なし）' : '') + (e.mine ? ' <span class="pv">→ ' + cname(e.mine.c) + '</span>' : '');
  else if (e.k === 'draw') s = '　' + N(e.p) + 'は 引いた札を' + (e.keep ? '手札に入れた' + (e.mine ? ' <span class="pv">（' + cname(e.mine.c) + '・' + (e.mine.pos + 1) + '番目）</span>' : '') : '捨てた（' + cname(e.c) + '）');
  else if (e.k === 'front') s = '　' + N(e.p) + 'は 手前の ' + cname(e.c) + ' を' + (e.keep ? '手札に入れた' : '捨てた');
  else if (e.k === 'flush') { cls = 'sys'; s = '🌀 全員パス → 場の札を捨てて、' + N(e.lead) + 'から'; }
  else if (e.k === 'out') s = '🎉 <b>' + N(e.p) + ' あがり！</b>（' + e.place + '番目）';
  else if (e.k === 'end') { cls = 'sys'; s = g.mode === 'duel' ? '🏁 ' + N(e.winner) + ' の勝ち！' + (e.why === 'pass' ? '（' + N(e.loser) + 'は手前の札なしでパス）' : '') : '🏁 最後まで残ったのは ' + N(e.loser) + (g.mode === 'basic' ? '（たまご🥚 −1）' : '（0点）'); }
  else return '';
  return '<div class="ln ' + cls + '">' + s + '</div>';
}
function passedNow(g) {   // いまの場でパスした人
  var out = {};
  for (var i = g.ev.length - 1; i >= 0; i--) { var e = g.ev[i]; if (e.k === 'play' || e.k === 'flush' || e.k === 'round') break; if (e.k === 'pass') out[e.p] = 1; }
  return out;
}
function eggs(g, p) { var s = ''; for (var i = 0; i < 2; i++) s += i < g.tok[p] ? '🥚' : '<span class="lost">🍳</span>'; return s; }
function tileHtml(g, p, me, passed) {
  var o = g.owners[p], P = g.P[p], cls = 'pt';
  if (g.need && g.need.p === p && g.phase === 'play') cls += ' cur';
  if (p === me) cls += ' me';
  if (o.kind === 'cpu' && o.lv === 'ultra') cls += ' ultra';
  if (P.out) cls += ' out';
  if (!o.connected) cls += ' off';
  var face = o.kind === 'cpu' ? o.e : '👤', tags = '';
  if (P.out) tags += '<span class="tagS done">あがり' + P.place + '</span>';
  else if (passed[p]) tags += '<span class="tagS pass">パス</span>';
  if (g.thinking === p && o.kind === 'cpu') tags += '<span class="tagS think">💭</span>';
  if (g.field && g.field.p === p && !P.out) tags += '<span class="tagS lead">場</span>';
  var kn = ''; if (p !== me) for (var v = 1; v <= 7; v++) if (P.kn[v]) kn += miniHtml(v, P.kn[v], 'kn');
  var fr = P.front.map(function (c) { return miniHtml(c, 1, 'fr'); }).join('');
  var meta = g.mode === 'basic' ? eggs(g, p) : g.mode === 'adv' ? '<b>' + g.score[p] + '</b>点' : '';
  return '<div class="' + cls + '" data-p="' + p + '"><span class="fc">' + face + '</span><div class="pi"><div class="pn">' + esc(p === me ? (o.name === 'あなた' ? 'あなた' : o.name) : o.name) + (o.kind === 'cpu' && o.lv === 'ultra' ? '😎' : '') + (o.connected ? '' : '📵') + '</div>' +
    '<div class="pm"><span class="hc" title="手札の枚数">🂠<b>' + P.nh + '</b></span>' + (meta ? '<span class="eg">' + meta + '</span>' : '') + '</div></div>' +
    '<div class="ps">' + tags + (fr ? '<span class="frs" title="手前の札">' + fr + '</span>' : '') + (kn ? '<span class="kns" title="この人が場から取った（まだ持っている）札">👁' + kn + '</span>' : '') + '</div></div>';
}
function renderTable(g, me) {
  var f = g.field, h = '';
  if (f) {
    var cards = ''; for (var i = 0; i < f.n; i++) cards += cardHtml(f.v, 'fc' + (i ? '' : ' first'));
    h = '<div class="fwho">' + esc(nm(g, f.p, me)) + 'が出した</div><div class="fcards" style="--n:' + f.n + '">' + cards + '</div><div class="fstr">' + comboText(f.v, f.n) + '</div>';
    if (g.pendPub && g.need && g.need.k === 'take') h += '<div class="fprev">↩ 前の ' + comboText(g.pendPub.v, g.pendPub.n) + ' を<br>' + esc(nm(g, g.need.p, me)) + 'が取るか考え中…</div>';
  } else h = '<div class="fempty">場は空っぽ<br><small>' + (g.need && g.phase === 'play' ? esc(nm(g, g.need.p, me)) + 'が好きなカードを出します' : '') + '</small></div>';
  $('field').innerHTML = h;
  var d = '';
  for (var v = 1; v <= 7; v++) d += '<span class="dc' + (g.disc[v] ? '' : ' z') + '" style="--rc:' + CARD[v].c + '"><b>' + v + '</b>' + g.disc[v] + '</span>';
  $('pile').innerHTML = (g.mode === 'duel' ? '<div class="deck unused">' + cardHtml(null) + '<span class="dn">使わない札<br>' + g.unusedN + '枚</span></div>' : '<div class="deck">' + cardHtml(null) + '<span class="dn">山札 ' + g.deckN + '</span></div>') +
    '<div class="discs"><div class="dl">捨て札 ' + g.discN + '</div><div class="dg">' + d + '</div></div>';
}
function renderLog(g, me) {
  var lines = g.ev.map(function (e) { return evText(g, e, me); }).filter(Boolean).slice(-40).join('');
  var lg = $('log'); if (lg.dataset.k !== String(g.k)) { lg.innerHTML = lines || '<div class="ln">ログ</div>'; lg.scrollTop = lg.scrollHeight; lg.dataset.k = g.k; }
}
// ---- 手札（並びは変えられない）。同じ数字のかたまりを1つの枠で見せる ----
function selKey(g) { return g.k + ':' + (g.hand || []).join(''); }
function legalCounts(g, run) {   // そのかたまりから何枚出せるか（手前の札 f 枚こみ）
  var out = [], fN = ui.sel && ui.sel.f ? ui.sel.f.length : 0;
  for (var k = 1; k <= run.n; k++) out.push(L.beats(k + fN, run.v, g.field));
  return out;
}
function frontMatch(g, v) { var me = g.me, fr = g.P[me].front, idx = []; fr.forEach(function (c, j) { if (c === v) idx.push(j); }); return idx; }
function cardW(R, slots) {   // 手札が1行に収まるカード幅（収まらなければ横スクロール）
  var w = Math.min(innerWidth, 560) - 20, n = 0, units = 0;
  R.forEach(function (r) { n += r.n; units += 1 + 0.72 * (r.n - 1); });
  var x = slots ? (w - (n + 1) * 20) / Math.max(1, n) : (w - R.length * 8 - Math.max(0, R.length - 1) * 5) / Math.max(1, units);
  var mx = innerHeight < 520 ? 50 : innerHeight < 700 ? 60 : innerHeight < 760 ? 66 : 74, mn = innerHeight < 520 ? 44 : innerHeight < 700 ? 50 : 56;
  return Math.max(mn, Math.min(mx, Math.floor(x)));
}
function renderHand(g, me) {
  var box = $('hand'), bar = $('acts');
  if (me < 0) { box.innerHTML = '<div class="outmsg">観戦中</div>'; bar.innerHTML = ''; return; }
  var P = g.P[me];
  if (P.out) { box.innerHTML = '<div class="outmsg">🎉 あがり！（' + P.place + '番目）<br><small>ほかの人を見守ろう</small></div>'; bar.innerHTML = ''; return; }
  var h = g.hand, my = myTurn(g), k = my ? g.need.k : '', ins = null;
  if (my && (k === 'take' || k === 'draw' || k === 'front')) {
    var key = g.k + ':' + k;
    if (ui.insKey !== key) { ui.insKey = key; ui.ins = { pos: null, f: k === 'front' ? (g.P[me].front.length === 1 ? 0 : null) : 0 }; ui.scrollTo = true; }
    ins = ui.ins;
  } else { ui.insKey = ''; ui.ins = null; }
  if (!(my && k === 'play') || (ui.sel && ui.sel.key !== selKey(g))) ui.sel = null;
  var R = L.runsOf(h), html = '';
  if (ins) {
    var cards = insCards(g), w = cardW(R, true);
    box.style.setProperty('--cw', w + 'px');
    var v = cards ? cards[0] : 0;
    for (var pos = 0; pos <= h.length; pos++) {
      var good = cards && ((pos > 0 && h[pos - 1] === v) || (pos < h.length && h[pos] === v));
      var split = pos > 0 && pos < h.length && h[pos - 1] === h[pos] && h[pos] !== v;
      html += '<button class="slot' + (good ? ' good' : '') + (split ? ' split' : '') + (ins.pos === pos ? ' on' : '') + (cards ? '' : ' wait') + '" data-pos="' + pos + '" aria-label="' + (pos + 1) + '番目に入れる">' +
        (ins.pos === pos && cards ? '<span class="ghosts">' + cards.map(function (c) { return cardHtml(c, 'ghost'); }).join('') + '</span>' : '<i>' + (good ? '★' : '＋') + '</i>') + '</button>';
      if (pos < h.length) html += cardHtml(h[pos], (w < 50 ? 'sm ' : '') + 'in' + (pos > 0 && h[pos - 1] === h[pos] ? ' joinL' : '') + (pos < h.length - 1 && h[pos + 1] === h[pos] ? ' joinR' : ''));
    }
    box.className = 'strip ins';
  } else {
    var w2 = cardW(R, false); box.style.setProperty('--cw', w2 + 'px');
    R.forEach(function (r, ri) {
      var s = ui.sel && ui.sel.i === r.i, can = my && k === 'play' && legalCounts(g, r).some(Boolean);
      html += '<div class="run' + (s ? ' sel' : '') + (my && k === 'play' ? (can ? ' can' : ' no') : '') + '" data-r="' + ri + '" style="--rc:' + CARD[r.v].c + '">';
      for (var j = 0; j < r.n; j++) html += cardHtml(r.v, (s && j < ui.sel.n ? 'up' : '') + (w2 < 50 ? ' sm' : ''), ' data-i="' + (r.i + j) + '"');
      html += (r.n > 1 ? '<span class="rlab">×' + r.n + '</span>' : '') + '</div>';
    });
    box.className = 'strip' + (my && k === 'play' ? ' my' : '');
  }
  if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
  if (ins && ui.scrollTo) { ui.scrollTo = false; var gs = box.querySelector('.slot.good') || box.querySelector('.slot.on'); if (gs) box.scrollLeft = Math.max(0, gs.offsetLeft - box.clientWidth / 2); }
  renderActs(g, me);
}
function insCards(g) {
  var k = g.need.k, me = g.me;
  if (k === 'front') { if (ui.ins.f == null) return null; return [g.P[me].front[ui.ins.f]]; }
  return g.pend || null;
}
function renderActs(g, me) {
  var bar = $('acts'), my = myTurn(g), k = my ? g.need.k : '', h = '';
  if (!my) { bar.innerHTML = ''; bar.className = ''; return; }
  if (k === 'play') {
    var S = ui.sel, R = L.runsOf(g.hand), f = g.field;
    if (S) {
      var run = R.filter(function (r) { return r.i === S.i; })[0], fm = g.mode === 'duel' ? frontMatch(g, run.v) : [], tot = S.n + S.f.length, okk = L.beats(tot, run.v, f);
      h += '<div class="selinfo"><div class="cmp">' + comboText(run.v, tot) + (S.f.length ? '<small>（手前' + S.f.length + '）</small>' : '') + (f ? ' <span class="vs">vs</span> 場 ' + comboText(f.v, f.n) : '') + ' → ' + (okk ? '<b class="ok">出せる！</b>' : '<b class="ng">弱くて出せない</b>') + '</div>';
      var counts = legalCounts(g, run);
      if (run.n > 1) h += '<div class="chips">' + counts.map(function (c, j) { return '<button class="chip' + (S.n === j + 1 ? ' on' : '') + '" data-cnt="' + (j + 1) + '"' + (c ? '' : ' disabled') + '>' + (j + 1) + '枚</button>'; }).join('') + '</div>';
      if (fm.length) h += '<div class="chips">' + fm.map(function (fi, j) { return '<button class="chip fch' + (S.f.indexOf(fi) >= 0 ? ' on' : '') + '" data-fr="' + fi + '">＋手前の' + CARD[run.v].e + (fm.length > 1 ? (j + 1) : '') + '</button>'; }).join('') + '</div>';
      h += '</div>';
      h += '<div class="btns">' + (f ? '<button class="btn" id="passBtn">' + passLabel(g) + '</button>' : '') + '<button class="btn main" id="playBtn"' + (okk && !pending ? '' : ' disabled') + '>出す（' + tot + '枚）</button></div>';
    } else {
      h += '<div class="selinfo"><div class="cmp">' + (f ? '場 ' + comboText(f.v, f.n) + ' より強い組み合わせを えらんでね' : '好きなカードをタップして出そう（パスはできません）') + '</div></div>';
      h += '<div class="btns">' + (f ? '<button class="btn" id="passBtn">' + passLabel(g) + '</button>' : '') + '<button class="btn main" disabled>カードをタップ</button></div>';
    }
  } else {
    var cards = insCards(g), I = ui.ins;
    if (k === 'front') h += '<div class="selinfo"><div class="cmp">パス：手前の札を1枚えらんで、手札に入れるか捨てます</div><div class="chips">' + g.P[me].front.map(function (c, j) { return '<button class="chip fpick' + (I.f === j ? ' on' : '') + '" data-fp="' + j + '">' + miniHtml(c, 1) + '</button>'; }).join('') + '</div></div>';
    else h += '<div class="selinfo"><div class="cmp">' + (k === 'take' ? '前に場にあった ' + comboText(cards[0], cards.length) + ' を 手札に入れる？' : '山から ' + comboText(cards[0], 1) + ' を引いた！') + '<br><small>★＝同じ数字のとなり。入れる場所（＋）をタップ</small></div></div>';
    h += '<div class="btns"><button class="btn" id="discBtn"' + (cards && !pending ? '' : ' disabled') + '>捨てる</button><button class="btn main" id="insBtn"' + (cards && I.pos != null && !pending ? '' : ' disabled') + '>' + (I.pos != null ? (I.pos + 1) + '番目に入れる' : '場所をタップ') + '</button></div>';
  }
  bar.className = 'on';
  if (bar.dataset.h !== h) { bar.innerHTML = h; bar.dataset.h = h; }
}
function passLabel(g) { return g.mode === 'duel' ? (g.P[g.me].front.length ? 'パス（手前の札' + g.P[g.me].front.length + '）' : 'パス＝負け') : g.deckN ? 'パス（1枚引く）' : 'パス'; }
function paintStatus(g, me) {
  var st = '', cls = '', nd = g.need;
  if (g.wait > 0) st = g.ultra ? '…なにかが 目覚めようとしている…' : 'まもなく開始…';
  else if (g.phase !== 'play') st = g.phase === 'over' ? '🎉 ゲーム終了！' : 'ラウンド' + g.round + ' 終了';
  else if (myTurn(g)) {
    cls = 'mine';
    st = nd.k === 'play' ? (g.field ? 'あなたの番！ 出すか、パスか' : 'あなたの番！ 場は空っぽ。好きなカードを出そう') : nd.k === 'take' ? '前の札を手札に入れる？ 捨てる？' : nd.k === 'draw' ? '引いた札を どこに入れる？' : '手前の札を えらんでね';
  } else if (nd) {
    var ow = g.owners[nd.p];
    st = ow.kind === 'cpu' ? ow.e + ' ' + esc(nm(g, nd.p, me)) + (nd.k === 'play' ? ' が考え中…' : ' が札を並べ中…') : esc(nm(g, nd.p, me)) + ' の番です' + (ow.connected ? '' : '（切断中）');
  }
  $('status').innerHTML = st; $('status').className = 'status ' + cls;
}
function popText(text, cls) { var p = $('pop'); p.className = ''; void p.offsetWidth; p.textContent = text; p.className = 'go ' + (cls || ''); }
function flashTile(p, cls) { var row = $('players').querySelector('.pt[data-p="' + p + '"]'); if (!row) return; row.classList.remove(cls); void row.offsetWidth; row.classList.add(cls); setTimeout(function () { row.classList.remove(cls); }, 1200); }
function onEvent(v, e, me, live) {
  var g = v.g, o = e.p != null ? g.owners[e.p] : null, ultra = o && o.kind === 'cpu' && o.lv === 'ultra';
  if (!live) return;
  if (e.k === 'play') {
    sfx.card(); flashTile(e.p, 'hit');
    var fl = $('field'); fl.classList.remove('slam'); void fl.offsetWidth; fl.classList.add('slam');
    if (e.n >= 3) { popText(CARD[e.v].e + ' ' + e.n + '枚出し！', 'good'); sfx.cluck(); if (ultra && e.n >= 4) cutin(e.n + '枚 一気出し！', 'そろえておいたよ', o.e); }
  } else if (e.k === 'flush') { popText('🌀 流れた！', 'info'); }
  else if (e.k === 'out') {
    popText('🎉 ' + nm(g, e.p, me) + ' あがり！', 'good'); sfx.safe();
    if (ultra) cutin('あがり！', '計算どおり', o.e);
    if (e.p === me) { confetti(40); vibrate([40, 30, 80]); }
  } else if (e.k === 'pass' && e.lose) { popText('💥 手前の札なしでパス…', 'bad'); sfx.bust(); }
  else if (e.k === 'end') { if (g.mode !== 'duel') { if (e.loser === me) sfx.bust(); else sfx.win(); } else if (e.winner === me) sfx.win(); else sfx.bust(); }
  else if (e.k === 'round') popText(g.mode === 'duel' ? 'デュエル！' : 'ラウンド' + e.round, 'info');
  else if (e.k === 'take' && e.keep) flashTile(e.p, 'take');
}
function renderGame(v) {
  var g = v.g, me = g.me, gk = v.code + ':' + v.gameNo;
  if (ui.gameKey !== gk) {
    ui.gameKey = gk; ui.lastEv = g.ev.length ? g.ev[g.ev.length - 1].id : 0; ui.sayId = g.say ? g.say.id : 0; ui.roundKey = ''; ui.sel = null; ui.ins = null; ui.insKey = '';
    if (g.ultra && g.wait > 600) awaken(g.ultra);
  }
  var evs = g.ev.filter(function (e) { return e.id > ui.lastEv; });
  if (evs.length) ui.lastEv = evs[evs.length - 1].id;
  var lastId = evs.length ? evs[evs.length - 1].id : 0;
  $('phLabel').textContent = (g.mode === 'duel' ? 'デュエル' : 'R' + g.round + '・' + MODE_UI[g.mode].n) + (g.mode === 'adv' ? '・10点先取' : g.mode === 'basic' ? '・🥚0で負け' : '・パス2回まで');
  var passed = passedNow(g);
  $('players').className = 'n' + g.n;
  $('players').innerHTML = g.owners.map(function (o, p) { return tileHtml(g, p, me, passed); }).join('');
  renderTable(g, me); renderLog(g, me); renderHand(g, me); paintStatus(g, me);
  evs.forEach(function (e) { onEvent(v, e, me, evs.length < 6 || e.id >= lastId - 2); });
  if (g.say && g.say.id !== ui.sayId) {
    ui.sayId = g.say.id; var o = g.owners[g.say.p];
    var b = document.createElement('div'); b.className = 'bubble' + (o && o.lv === 'ultra' ? ' ultra' : ''); b.textContent = (o ? o.e + o.name : '') + '「' + g.say.text + '」';
    var gw = document.querySelector('#game .gwrap'); gw.querySelectorAll('.bubble').forEach(function (x) { x.remove(); });
    b.style.top = ($('table').offsetTop + 4) + 'px'; gw.appendChild(b); setTimeout(function () { b.remove(); }, 3200);
  }
  var ended = g.phase !== 'play' && g.result;
  if (ended) {
    var rk = gk + ':' + g.round, dl = 1600 * (TURBO ? 0.2 : 1);
    if (ui.roundKey !== rk) { ui.roundKey = rk; ui.peek = false; ui.roundShownAt = Date.now() + dl; setTimeout(function () { if (lastView && lastView.phase === 'game') renderGame(lastView); }, dl + 50); }
    if (Date.now() >= ui.roundShownAt) { renderRound(v, g.result, true); overlay('roundModal', true); }
  } else if (ui.peek && g.results.length) { renderRound(v, g.results[g.results.length - 1], false); overlay('roundModal', true); }
  else overlay('roundModal', false);
}
// ---- 手札の操作 ----
$('hand').addEventListener('click', function (e) {
  var v = lastView, g = v && v.g; if (!g || !myTurn(g)) return;
  var slot = e.target.closest('.slot');
  if (slot && ui.ins) { if (!insCards(g)) { toast('先に手前の札をえらんでね'); return; } ui.ins.pos = +slot.dataset.pos; sfx.turn(); renderHand(g, g.me); return; }
  var c = e.target.closest('.run'); if (!c || g.need.k !== 'play') return;
  var R = L.runsOf(g.hand), r = R[+c.dataset.r]; if (!r) return;
  if (ui.sel && ui.sel.i === r.i) { ui.sel = null; renderHand(g, g.me); return; }
  ui.sel = { i: r.i, n: r.n, f: [], key: selKey(g) };
  var cnts = legalCounts(g, r), best = -1; for (var j = r.n; j >= 1; j--) if (cnts[j - 1]) { best = j; break; }
  if (best < 0 && g.mode === 'duel') { var fm = frontMatch(g, r.v); if (fm.length) { ui.sel.f = fm.slice(); cnts = legalCounts(g, r); for (j = r.n; j >= 1; j--) if (cnts[j - 1]) { best = j; break; } if (best < 0) ui.sel.f = []; } }
  ui.sel.n = best > 0 ? best : r.n;
  renderHand(g, g.me);
});
$('acts').addEventListener('click', function (e) {
  var v = lastView, g = v && v.g; if (!g || !myTurn(g)) return;
  var b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.cnt && ui.sel) { ui.sel.n = +b.dataset.cnt; renderHand(g, g.me); return; }
  if (b.dataset.fr != null && ui.sel) { var fi = +b.dataset.fr, k = ui.sel.f.indexOf(fi); if (k >= 0) ui.sel.f.splice(k, 1); else ui.sel.f.push(fi); renderHand(g, g.me); return; }
  if (b.dataset.fp != null && ui.ins) { ui.ins.f = +b.dataset.fp; renderHand(g, g.me); return; }
  if (b.id === 'playBtn' && ui.sel) { var s = ui.sel; ui.sel = null; act('play', { i: s.i, n: s.n, f: s.f.slice() }); return; }
  if (b.id === 'passBtn') {
    var go = function () { ui.sel = null; act('pass', {}); };
    if (g.mode === 'duel' && !g.P[g.me].front.length) confirmBox('パスすると負けです', '手前の札がないので、パスしたらデュエルに負けます。', 'パスする', go); else go();
    return;
  }
  if (b.id === 'discBtn' && ui.ins) { var a1 = g.need.k; act(a1, a1 === 'front' ? { f: ui.ins.f, pos: -1 } : { pos: -1 }); return; }
  if (b.id === 'insBtn' && ui.ins && ui.ins.pos != null) { var a2 = g.need.k; act(a2, a2 === 'front' ? { f: ui.ins.f, pos: ui.ins.pos } : { pos: ui.ins.pos }); }
});
// ---------------- ラウンド結果・終了 ----------------
function renderRound(v, r, live) {
  var g = v.g, me = g.me;
  $('rdTitle').textContent = g.mode === 'duel' ? '🏁 デュエルの結果' : (g.phase === 'over' && live ? '🎉 最終ラウンドの結果' : 'ラウンド' + r.round + ' の結果');
  var head = '';
  if (g.mode === 'duel') head = esc(nm(g, r.winner, me)) + ' の勝ち！' + (r.why === 'pass' ? '<br><small>' + esc(nm(g, r.loser, me)) + 'は手前の札がないのにパスした</small>' : '<br><small>手札を出し切った！</small>');
  else head = '最後まで残ったのは ' + esc(nm(g, r.loser, me)) + (g.mode === 'basic' ? '…たまご🥚が1つ割れた' : '（0点）');
  $('rdHead').innerHTML = head;
  var order = r.finish.slice(); if (order.indexOf(r.loser) < 0) order.push(r.loser);
  $('rdList').innerHTML = order.map(function (p, j) {
    var o = g.owners[p], last = p === r.loser, hand = r.hands && r.hands[p];
    var right = g.mode === 'basic' ? '<span class="tk">' + (r.tok ? eggsOf(r.tok[p]) : '') + '</span>' : g.mode === 'adv' ? '<span class="gain">+' + r.gain[p] + '</span><span class="tk">' + (r.score ? r.score[p] : '') + '点</span>' : '';
    return '<div class="rr' + (last ? ' lose' : j === 0 ? ' win' : '') + '"><span class="md">' + (last ? '🍳' : ['🥇', '🥈', '🥉', '4', '5'][j]) + '</span><span>' + (o.kind === 'cpu' ? o.e : '👤') + '</span><span class="nm">' + esc(p === me ? 'あなた' : o.name + (o.kind === 'cpu' && o.lv === 'ultra' ? '😎' : '')) + '</span>' +
      (hand && hand.length ? '<span class="lh">' + hand.map(function (c) { return miniHtml(c, 1); }).join('') + '</span>' : '') + right + '</div>';
  }).join('');
  var next = '';
  if (live && g.nextIn != null) next = g.phase === 'over' ? 'まもなく結果発表…' : '次のラウンドまで ' + Math.ceil(g.nextIn / 1000) + '秒（' + esc(nm(g, r.loser, me)) + 'から）';
  $('rdNext').innerHTML = next;
  $('rdGo').style.display = live && (g.phase === 'roundEnd' || g.phase === 'over') ? '' : 'none';
  $('rdGo').textContent = g.phase === 'over' ? '▶ 結果を見る' : '▶ 次のラウンドへ';
  $('rdClose').style.display = live ? 'none' : '';
}
function eggsOf(n) { var s = ''; for (var i = 0; i < 2; i++) s += i < n ? '🥚' : '<span class="lost">🍳</span>'; return s; }
function renderEnd(v) {
  var g = v.g; if (!g) return;
  var me = g.me, wins = g.winners || [], sc = function (p) { return g.mode === 'basic' ? g.tok[p] : g.score[p]; };
  var rows = g.owners.map(function (o, p) { return { o: o, p: p, sc: sc(p), w: wins.indexOf(p) >= 0 }; }).sort(function (a, b) { return (b.w - a.w) || (b.sc - a.sc); });
  var rank = 0;
  $('rankList').innerHTML = rows.map(function (r, i) {
    if (i === 0 || r.w !== rows[i - 1].w || r.sc < rows[i - 1].sc) rank = i + 1;
    var s = g.mode === 'basic' ? eggsOf(r.sc) : g.mode === 'adv' ? r.sc + '点' : (r.w ? '勝ち' : '');
    return '<div class="rk' + (r.w ? ' first' : '') + '"><span class="md">' + (r.w ? '🏆' : g.mode === 'basic' ? '🍳' : rank) + '</span><span class="nm">' + (r.o.kind === 'cpu' ? r.o.e + ' ' : '') + esc(r.o.name) +
      (r.o.kind === 'cpu' ? ' <span class="lv ' + r.o.lv + '" style="font-size:10px">' + LV[r.o.lv] + '</span>' : '') + (r.p === me && r.o.name !== 'あなた' ? '<small>あなた</small>' : '') + '</span><span class="sc">' + s + '</span></div>';
  }).join('');
  var txt;
  if (g.mode === 'basic') { var lo = g.owners.map(function (o, p) { return p; }).filter(function (p) { return wins.indexOf(p) < 0; })[0], lw = g.owners[lo];
    txt = '🍳 たまごがなくなった ' + esc(nm(g, lo, me)) + ' は「うっかりコッコ」…！ ほかの全員が優勝！' + (lw.kind === 'cpu' ? ' ' + lw.e + '「' + esc(pick(CH[lw.ch].L.mlose)) + '」' : ''); }
  else if (wins.length > 1) txt = '🤝 ' + wins.map(function (p) { return esc(nm(g, p, me)); }).join('・') + ' の同時優勝！';
  else { var w0 = g.owners[wins[0]]; txt = w0.kind === 'cpu' ? w0.e + '「' + esc(pick(CH[w0.ch].L.mwin)) + '」' : '🎉 ' + esc(w0.name) + ' の優勝！ こっこたち、みんなおうちに帰れたね！'; }
  $('rankList').innerHTML += '<p class="mid">' + txt + '</p>';
  $('histLine').innerHTML = (g.results || []).map(function (r) { return g.mode === 'duel' ? '' : 'R' + r.round + '：1抜け ' + esc(nm(g, r.finish[0], me)) + '／最後 ' + esc(nm(g, r.loser, me)); }).join('<br>');
  $('leaveBtn2').textContent = host ? (host.room.solo ? '🚪 タイトルへ' : '🚪 部屋を閉じる') : '🚪 部屋を出る';
  var key = v.code + ':' + v.gameNo;
  if (ui.endKey !== key) { ui.endKey = key; if (wins.indexOf(me) >= 0) { confetti(80); sfx.win(); } else sfx.safe(); }
}
