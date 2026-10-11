/* ニワトリドリ：ルールとCPU（ブラウザと Node で共通）
 * ルールは『ナナトリドリ』（アークライト）の公式ルールどおり。詳しくは RULES_NOTES.md。
 * S（ゲームの状態）はホストだけが持つ。参加者には viewFor() の「その人が見てよい情報」だけを送る。
 */
(function (root) {
'use strict';
var MODES = {
  basic: { np: [3, 6], deal: 8, front: 0, eggs: 2 },          // 基本ルール：たまご2個、最後の1人が1個失う、0個で負け
  adv: { np: [3, 6], deal: 8, front: 0, goal: 10 },           // 発展ルール：1抜け4点・最後0点・ほか2点、10点以上で終了
  duel: { np: [2, 2], deal: 11, front: 2 }                    // 2人用デュエル：手札11枚＋手前2枚、残り37枚は使わない
};
var MODE_KEYS = ['basic', 'adv', 'duel'];
var NV = 7, PER = 9;
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(a, rng) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function fullDeck() { var d = []; for (var v = 1; v <= NV; v++) for (var k = 0; k < PER; k++) d.push(v); return d; }
function rep(v, n) { var a = []; for (var i = 0; i < n; i++) a.push(v); return a; }
function zeros(n) { return rep(0, n); }
// 強さ：枚数が多いほど強い。枚数が同じなら数字が大きいほど強い
function beats(n, v, field) { return !field || n > field.n || (n === field.n && v > field.v); }
function runsOf(h) { var r = [], i = 0, L = h.length; while (i < L) { var j = i + 1; while (j < L && h[j] === h[i]) j++; r.push({ v: h[i], i: i, n: j - i }); i = j; } return r; }

// ---------------- 進行 ----------------
function newMatch(o) {
  var M = MODES[o.mode]; if (!M) throw new Error('mode');
  var n = o.n; if (n < M.np[0] || n > M.np[1]) throw new Error('players');
  var rng = o.rng || Math.random;
  return { mode: o.mode, n: n, rng: rng, round: 0, tok: rep(MODES.basic.eggs, n), score: zeros(n), P: [], deck: [], unused: [], disc: [], field: null,
    lastP: -1, passN: 0, need: null, pend: null, finish: [], phase: 'init', ev: [], evId: 0, k: 0, results: [], result: null, winners: null,
    start: o.start != null ? o.start % n : Math.floor(rng() * n), quiet: !!o.quiet };
}
function ev(S, k, o) { if (S.quiet) return; o = o || {}; o.k = k; o.id = ++S.evId; S.ev.push(o); if (S.ev.length > 240) S.ev.splice(0, S.ev.length - 240); }
function startRound(S) {
  var M = MODES[S.mode], d = shuffle(fullDeck(), S.rng);
  S.round++; S.P = [];
  for (var i = 0; i < S.n; i++) S.P.push({ hand: d.splice(0, M.deal), front: [], out: false, place: 0, kn: zeros(NV + 1) });
  if (M.front) S.P.forEach(function (P) { P.front = d.splice(0, M.front); });
  if (S.mode === 'duel') { S.unused = d; S.deck = []; } else { S.deck = d; S.unused = []; }
  S.disc = []; S.field = null; S.lastP = -1; S.passN = 0; S.finish = []; S.pend = null; S.result = null;
  S.phase = 'play'; S.need = { p: S.start, k: 'play' }; S.k++;
  ev(S, 'round', { round: S.round, start: S.start });
}
function nextRound(S) { if (S.phase !== 'roundEnd') return; startRound(S); }
function activeCount(S) { var c = 0; for (var i = 0; i < S.n; i++) if (!S.P[i].out) c++; return c; }
function nextActive(S, p) { for (var d = 1; d <= S.n; d++) { var q = (p + d) % S.n; if (!S.P[q].out) return q; } return -1; }
// 手番を次へ。パスのあとは「全員パスで場を流す」を確かめる
function advance(S, p, afterPass) {
  var nx = nextActive(S, p);
  if (afterPass && S.field) {
    var lp = S.lastP, lpAct = lp >= 0 && !S.P[lp].out;
    if ((lpAct && nx === lp) || (!lpAct && S.passN >= activeCount(S))) {
      var f = S.field; for (var i = 0; i < f.n; i++) S.disc.push(f.v);
      S.field = null; S.passN = 0;
      var lead = lpAct ? lp : nx;   // 出した人がもう上がっていたら、その次の人
      ev(S, 'flush', { v: f.v, n: f.n, lead: lead, by: lp });
      nx = lead;
    }
  }
  S.need = { p: nx, k: 'play' };
}
function legalPlays(hand, front, field, mode) {
  var out = [], R = runsOf(hand);
  R.forEach(function (r) {
    var fi = []; if (mode === 'duel') (front || []).forEach(function (c, j) { if (c === r.v) fi.push(j); });
    var fsets = [[]]; if (fi.length >= 1) fsets.push([fi[0]]); if (fi.length >= 2) fsets.push([fi[0], fi[1]]);
    for (var k = 1; k <= r.n; k++) fsets.forEach(function (fs) { if (beats(k + fs.length, r.v, field)) out.push({ a: 'play', i: r.i, n: k, f: fs.slice() }); });
  });
  return out;
}
function act(S, p, a) {
  if (S.phase !== 'play' || !S.need) return 'いまは操作できません';
  if (S.need.p !== p) return 'あなたの番ではありません';
  if (!a || typeof a !== 'object') return '不明な操作です';
  var k = S.need.k, r;
  if (k === 'play') r = a.a === 'play' ? doPlay(S, p, a) : a.a === 'pass' ? doPass(S, p) : '不明な操作です';
  else if (k === 'take' || k === 'draw') r = a.a === k ? doPlace(S, p, a, k) : '不明な操作です';
  else if (k === 'front') r = a.a === 'front' ? doFront(S, p, a) : '不明な操作です';
  else r = '不明な操作です';
  if (!r) S.k++;
  return r;
}
function doPlay(S, p, a) {
  var P = S.P[p], h = P.hand, i = a.i, n = a.n;
  if (typeof i !== 'number' || typeof n !== 'number' || i % 1 || n % 1 || n < 1 || i < 0 || i + n > h.length) return 'そのカードは出せません';
  var v = h[i];
  for (var j = i; j < i + n; j++) if (h[j] !== v) return '手札で となり合った 同じ数字だけ まとめて出せます';
  var f = Array.isArray(a.f) ? a.f : [];
  if (f.length && S.mode !== 'duel') return '手前の札はデュエルだけです';
  if (f.length > 2) return 'そのカードは出せません';
  for (var x = 0; x < f.length; x++) { if (typeof f[x] !== 'number' || f[x] < 0 || f[x] >= P.front.length || P.front[f[x]] !== v || f.indexOf(f[x]) !== x) return '手前の札は、出す数字と同じものだけ足せます'; }
  var total = n + f.length;
  if (!beats(total, v, S.field)) return '場より強くないと出せません（枚数が多いか、同じ枚数で数字が大きい）';
  h.splice(i, n);
  f.slice().sort(function (x, y) { return y - x; }).forEach(function (fi) { P.front.splice(fi, 1); });
  P.kn[v] = Math.max(0, P.kn[v] - n);
  var prev = S.field;
  S.field = { v: v, n: total, p: p }; S.lastP = p; S.passN = 0;
  ev(S, 'play', { p: p, v: v, n: total, nf: f.length, lead: !prev });
  if (!h.length) {
    if (prev) { for (var q = 0; q < prev.n; q++) S.disc.push(prev.v); ev(S, 'take', { p: p, v: prev.v, n: prev.n, keep: false, auto: true }); }
    goOut(S, p);
    if (S.phase === 'play') advance(S, p, false);
    return null;
  }
  if (prev) { S.pend = { v: prev.v, n: prev.n, cards: rep(prev.v, prev.n), src: 'field' }; S.need = { p: p, k: 'take' }; return null; }
  advance(S, p, false); return null;
}
function doPass(S, p) {
  if (!S.field) return '場にカードがないときは、好きなカードを出してください（パスできません）';
  var P = S.P[p];
  S.passN++;
  if (S.mode === 'duel') {
    if (!P.front.length) { ev(S, 'pass', { p: p, lose: true }); endDuel(S, nextActive(S, p), p, 'pass'); return null; }
    ev(S, 'pass', { p: p, front: true }); S.need = { p: p, k: 'front' }; return null;
  }
  if (S.deck.length) {
    var c = S.deck.pop(); S.pend = { v: c, n: 1, cards: [c], src: 'deck' }; S.need = { p: p, k: 'draw' };
    ev(S, 'pass', { p: p, drew: true, priv: { p: p, c: c } }); return null;
  }
  ev(S, 'pass', { p: p, drew: false }); advance(S, p, true); return null;
}
function insertAt(h, pos, cards) { Array.prototype.splice.apply(h, [pos, 0].concat(cards)); }
function doPlace(S, p, a, k) {
  var P = S.P[p], pos = a.pos;
  if (typeof pos !== 'number' || pos % 1 || pos < -1 || pos > P.hand.length) return '入れる場所をえらんでください';
  var pd = S.pend; S.pend = null;
  if (pos >= 0) { insertAt(P.hand, pos, pd.cards); if (k === 'take') P.kn[pd.v] += pd.n; }
  else for (var i = 0; i < pd.n; i++) S.disc.push(pd.v);
  if (k === 'take') ev(S, 'take', { p: p, v: pd.v, n: pd.n, keep: pos >= 0, priv: { p: p, pos: pos } });
  else ev(S, 'draw', pos >= 0 ? { p: p, keep: true, priv: { p: p, c: pd.v, pos: pos } } : { p: p, keep: false, c: pd.v });
  advance(S, p, k === 'draw'); return null;
}
function doFront(S, p, a) {
  var P = S.P[p], f = a.f, pos = a.pos;
  if (typeof f !== 'number' || f < 0 || f >= P.front.length || f % 1) return '手前の札をえらんでください';
  if (typeof pos !== 'number' || pos % 1 || pos < -1 || pos > P.hand.length) return '入れる場所をえらんでください';
  var c = P.front.splice(f, 1)[0];
  if (pos >= 0) { insertAt(P.hand, pos, [c]); P.kn[c]++; } else S.disc.push(c);
  ev(S, 'front', { p: p, c: c, keep: pos >= 0, priv: { p: p, pos: pos } });
  advance(S, p, true); return null;
}
function goOut(S, p) {
  var P = S.P[p]; P.out = true; S.finish.push(p); P.place = S.finish.length;
  ev(S, 'out', { p: p, place: P.place });
  if (S.mode === 'duel') { endDuel(S, p, nextActive(S, p), 'out'); return; }
  if (activeCount(S) <= 1) endRound(S, nextActive(S, p));
}
function finishRound(S, res, over) {
  S.need = null; S.pend = null; S.result = res; S.results.push(res);
  S.phase = over ? 'over' : 'roundEnd';
  if (over) S.winners = res.winners;
  ev(S, 'end', { loser: res.loser, winner: res.winner, finish: res.finish.slice(), why: res.why, over: over });
}
function endRound(S, loser) {
  var lp = S.P[loser]; lp.place = S.n;
  var res = { round: S.round, mode: S.mode, finish: S.finish.slice(), loser: loser, hands: {}, gain: zeros(S.n), why: 'last' };
  res.hands[loser] = lp.hand.slice();
  var over = false;
  if (S.mode === 'basic') {
    S.tok[loser]--; res.gain[loser] = -1; res.tok = S.tok.slice();
    if (S.tok[loser] <= 0) { over = true; res.winners = []; for (var i = 0; i < S.n; i++) if (i !== loser) res.winners.push(i); }
  } else {
    S.finish.forEach(function (q, j) { res.gain[q] = j === 0 ? 4 : 2; S.score[q] += res.gain[q]; });
    res.score = S.score.slice();
    var mx = Math.max.apply(null, S.score);
    if (mx >= MODES.adv.goal) { over = true; res.winners = []; S.score.forEach(function (s, q) { if (s === mx) res.winners.push(q); }); }
  }
  S.start = loser;   // 次のラウンドは最後まで残った人から
  finishRound(S, res, over);
}
function endDuel(S, winner, loser, why) {
  var res = { round: S.round, mode: S.mode, finish: [winner], loser: loser, winner: winner, hands: {}, gain: zeros(S.n), why: why, winners: [winner] };
  res.hands[loser] = S.P[loser].hand.slice(); res.gain[winner] = 1; S.score[winner]++; res.score = S.score.slice();
  S.P[loser].place = 2; if (!S.P[winner].place) S.P[winner].place = 1;
  finishRound(S, res, true);
}

// ---------------- 見せてよい情報だけ ----------------
function discCounts(S) { var c = zeros(NV + 1); S.disc.forEach(function (v) { c[v]++; }); return c; }
function viewFor(S, me) {
  var v = { mode: S.mode, n: S.n, round: S.round, phase: S.phase, start: S.start, k: S.k, field: S.field ? { v: S.field.v, n: S.field.n, p: S.field.p } : null,
    deckN: S.deck.length, unusedN: S.unused.length, disc: discCounts(S), discN: S.disc.length, lastP: S.lastP, passN: S.passN, tok: S.tok.slice(), score: S.score.slice(),
    finish: S.finish.slice(), need: S.need ? { p: S.need.p, k: S.need.k } : null,
    P: S.P.map(function (P) { return { nh: P.hand.length, out: P.out, place: P.place, front: P.front.slice(), kn: P.kn.slice() }; }),
    hand: me >= 0 && S.P[me] ? S.P[me].hand.slice() : null, results: S.results, result: S.result, winners: S.winners };
  // 取るか選んでいる場の札は全員に見える。山から引いた札は本人だけ
  if (S.pend && S.need) { if (S.pend.src === 'field') v.pendPub = { v: S.pend.v, n: S.pend.n }; if (S.need.p === me) v.pend = S.pend.cards.slice(); }
  v.ev = S.ev.slice(-80).map(function (e) {
    var o = {}; for (var key in e) if (key !== 'priv') o[key] = e[key];
    if (e.priv && e.priv.p === me) o.mine = e.priv;
    return o;
  });
  return v;
}

// ---------------- CPU ----------------
// 手札の評価（小さいほど良い）：となり合った同じ数字の「かたまり」の数が基本。弱いかたまりは出しにくいので重く、大きいかたまりは軽く
var W_DEF = { size: 0.03, weak: 0.9, th: 11, sc: 2.2, big: 0.18, out: 50, pass: 0.55, draw: 0.8, hold: 0.45, hth: 16, hsc: 3, urg: 0.15, take: 0.0, fkeep: 0.3, dpass: 0.6 };
var W_NORMAL = { size: 0.01, weak: 0, th: 0, sc: 1, big: 0.05, out: 50, pass: 0.3, draw: 0, hold: 0, hth: 0, hsc: 1, urg: 0, take: 0, fkeep: 0, dpass: 0.5 };
var WS_ALL = (root.NT_WEIGHTS && root.NT_WEIGHTS.strong) || {};
if (typeof require === "function" && !root.NT_WEIGHTS) { try { var m = require("./weights.js"); WS_ALL = (m.NT_WEIGHTS && m.NT_WEIGHTS.strong) || {}; } catch (e) {} }
function wStrong(mode) { return WS_ALL[mode] ? Object.assign({}, W_DEF, WS_ALL[mode]) : W_DEF; }
function E(h, W) {
  var L = h.length; if (!L) return -W.out;
  var c = W.size * L, i = 0;
  while (i < L) { var j = i + 1; while (j < L && h[j] === h[i]) j++; var n = j - i, s = n * 7 + h[i];
    c += 1 + W.weak / (1 + Math.exp((s - W.th) / W.sc)) - W.big * (n - 1); i = j; }
  return c;
}
// 札をまとめて差しこむ一番良い場所（かたまりの境目だけ調べれば十分）
function bestInsert(h, v, n, W) {
  var best = { pos: -1, val: Infinity }, L = h.length, cards = rep(v, n);
  for (var pos = 0; pos <= L; pos++) {
    if (pos > 0 && pos < L && h[pos - 1] === h[pos]) continue;   // かたまりの途中は分断するだけ
    var t = h.slice(0, pos).concat(cards, h.slice(pos)), val = E(t, W);
    if (val < best.val - 1e-9) best = { pos: pos, val: val };
  }
  return best;
}
function removeSeg(h, i, n) { return h.slice(0, i).concat(h.slice(i + n)); }
function holdP(total, v, W) { return W.hold ? 1 / (1 + Math.exp(-((total * 7 + v) - W.hth) / W.hsc)) : 0; }
function drawGain(h, W, unseen) {
  var base = E(h, W), g = 0, tot = 0;
  for (var v = 1; v <= NV; v++) { var q = unseen ? unseen[v] : 1; if (q <= 0) continue; tot += q; var b = bestInsert(h, v, 1, W); g += q * Math.max(0, base - b.val); }
  return tot ? g / tot : 0;
}
// 自分から見て「どこにあるか分からない」札の枚数（公平：見えている情報だけ）
function unseenOf(info) {
  var c = rep(PER, NV + 1); c[0] = 0;
  info.hand.forEach(function (v) { c[v]--; });
  for (var v = 1; v <= NV; v++) c[v] -= info.disc[v];
  if (info.field) c[info.field.v] -= info.field.n;
  if (info.pendPub) c[info.pendPub.v] -= info.pendPub.n; else if (info.pend) info.pend.forEach(function (x) { c[x]--; });
  info.P.forEach(function (P, q) { P.front.forEach(function (x) { c[x]--; }); if (q !== info.me) for (var w = 1; w <= NV; w++) c[w] -= P.kn[w]; });
  for (v = 1; v <= NV; v++) if (c[v] < 0) c[v] = 0;
  return c;
}
function infoFrom(S, p, cheapUnseen) {   // S から「p が見てよい情報」だけを取り出す
  var v = viewForAI(S, p); if (!cheapUnseen) v.unseen = unseenOf(v); return v;
}
function viewForAI(S, p) {
  return { mode: S.mode, n: S.n, me: p, hand: S.P[p].hand, front: S.P[p].front, field: S.field, deckN: S.deck.length, disc: discCounts(S), need: S.need,
    pend: S.need && S.need.p === p && S.pend ? S.pend.cards : null, pendPub: S.pend && S.pend.src === 'field' ? { v: S.pend.v, n: S.pend.n } : null,
    P: S.P.map(function (P) { return { nh: P.hand.length, out: P.out, front: P.front, kn: P.kn }; }), lastP: S.lastP, passN: S.passN, tok: S.tok, score: S.score, finish: S.finish };
}
function oppMin(info) { var m = 99; info.P.forEach(function (P, q) { if (q !== info.me && !P.out) m = Math.min(m, P.nh); }); return m; }
function placeOptions(h, v, n) {   // 差しこみ先の候補（結果が同じになる場所はまとめる）＋捨てる
  var out = [{ pos: -1 }], seen = {}, L = h.length;
  for (var pos = 0; pos <= L; pos++) {
    if (pos > 0 && pos < L && h[pos - 1] === h[pos] && h[pos] !== v) { /* かたまりを分断 */ }
    var key = h.slice(0, pos).concat(rep(v, n), h.slice(pos)).join('');
    if (seen[key]) continue; seen[key] = 1; out.push({ pos: pos });
  }
  return out;
}
// 「強い」の判断。 W を変えると「普通」にもなる
function scorePlays(info, W) {
  var h = info.hand, F = info.field, opts = legalPlays(h, info.front, F, info.mode), res = [];
  var om = oppMin(info);
  opts.forEach(function (o) {
    var h2 = removeSeg(h, o.i, o.n), v = h[o.i], total = o.n + o.f.length, val;
    if (!h2.length) val = -W.out - total * 0.01;
    else {
      val = E(h2, W);
      if (F) { var b = bestInsert(h2, F.v, F.n, W); if (b.val + W.take < val) val = b.val + W.take; }
      val -= W.hold * holdP(total, v, W);
      if (o.f.length) val += W.fkeep * o.f.length;
    }
    res.push({ a: o, val: val });
  });
  return res;
}
function passValue(info, W) {
  var h = info.hand, base = E(h, W) + W.pass + W.urg * Math.max(0, 4 - oppMin(info));
  if (info.mode === 'duel') {
    var fr = info.front; if (!fr.length) return Infinity;
    var bestF = Infinity;
    fr.forEach(function (c) { var b = bestInsert(h, c, 1, W); bestF = Math.min(bestF, Math.min(E(h, W), b.val)); });
    return bestF + W.pass + W.dpass * (3 - fr.length) + W.urg * Math.max(0, 4 - oppMin(info));
  }
  if (info.deckN > 0) base -= W.draw * drawGain(h, W, info.unseen);
  return base;
}
function placeBest(h, v, n, W, bias) { var b = bestInsert(h, v, n, W), d = E(h, W); return b.val + (bias || 0) < d ? b.pos : -1; }
function decideW(info, W, rng) {
  var nd = info.need, h = info.hand;
  if (nd.k === 'take') return { a: 'take', pos: placeBest(h, info.pend[0], info.pend.length, W, W.take) };
  if (nd.k === 'draw') return { a: 'draw', pos: placeBest(h, info.pend[0], 1, W, 0) };
  if (nd.k === 'front') {
    var best = null;
    info.front.forEach(function (c, f) {
      var rest = info.front.filter(function (_, j) { return j !== f; });
      var keepBonus = rest.length && h.indexOf(rest[0]) >= 0 ? W.fkeep : 0;
      var b = bestInsert(h, c, 1, W), d = E(h, W), pos = b.val < d ? b.pos : -1, val = Math.min(b.val, d) - keepBonus;
      if (!best || val < best.val) best = { val: val, a: { a: 'front', f: f, pos: pos } };
    });
    return best.a;
  }
  var sc = scorePlays(info, W);
  var bestP = null; sc.forEach(function (s) { if (!bestP || s.val < bestP.val) bestP = s; });
  if (!info.field) return bestP.a;   // 場が空なら必ず出す
  var pv = passValue(info, W);
  if (!bestP) return { a: 'pass' };
  return bestP.val <= pv ? bestP.a : { a: 'pass' };
}
function decideWeak(info, rng) {
  var nd = info.need, h = info.hand;
  if (rng() < 0.6) return decideW(info, W_NORMAL, rng);   // 6割は「普通」、4割は気まぐれ
  if (nd.k === 'take' || nd.k === 'draw') { var keep = rng() < 0.5; return { a: nd.k, pos: keep ? Math.floor(rng() * (h.length + 1)) : -1 }; }
  if (nd.k === 'front') return { a: 'front', f: Math.floor(rng() * info.front.length), pos: rng() < 0.5 ? Math.floor(rng() * (h.length + 1)) : -1 };
  var opts = legalPlays(h, info.front, info.field, info.mode).filter(function (o) { return !o.f.length || rng() < 0.3; });
  if (!info.field) { opts = opts.length ? opts : legalPlays(h, info.front, info.field, info.mode); return opts[Math.floor(rng() * opts.length)]; }
  if (!opts.length) return { a: 'pass' };
  if (info.mode === 'duel' ? rng() < 0.9 : rng() < 0.75) return opts[Math.floor(rng() * opts.length)];
  return { a: 'pass' };
}
// ---- アストラウルトラ：見えている情報から「ありえる場面」を何通りも作り、最後まで打って比べる（確定化モンテカルロ） ----
function cloneWorld(S) {
  return { mode: S.mode, n: S.n, rng: S.rng, round: S.round, tok: S.tok.slice(), score: S.score.slice(),
    P: S.P.map(function (P) { return { hand: P.hand.slice(), front: P.front.slice(), out: P.out, place: P.place, kn: P.kn.slice() }; }),
    deck: S.deck.slice(), unused: S.unused, disc: S.disc.slice(), field: S.field ? { v: S.field.v, n: S.field.n, p: S.field.p } : null, lastP: S.lastP, passN: S.passN,
    need: S.need ? { p: S.need.p, k: S.need.k } : null, pend: S.pend ? { v: S.pend.v, n: S.pend.n, cards: S.pend.cards.slice(), src: S.pend.src } : null,
    finish: S.finish.slice(), phase: S.phase, ev: [], evId: 0, k: 0, results: [], result: null, winners: null, start: S.start, quiet: true };
}
function determinize(info, rng) {
  var c = unseenOf(info), pool = [];
  for (var v = 1; v <= NV; v++) for (var k = 0; k < c[v]; k++) pool.push(v);
  shuffle(pool, rng);
  var P = info.P.map(function (Q, q) {
    var hand;
    if (q === info.me) hand = info.hand.slice();
    else if (Q.out) hand = [];
    else {
      var known = 0, blocks = [];
      for (var w = 1; w <= NV; w++) if (Q.kn[w]) { known += Q.kn[w]; blocks.push(rep(w, Q.kn[w])); }
      var un = Math.max(0, Q.nh - known); hand = pool.splice(0, un);
      while (hand.length < un) hand.push(1 + Math.floor(rng() * NV));
      blocks.forEach(function (b) { insertAt(hand, Math.floor(rng() * (hand.length + 1)), b); });
      if (hand.length > Q.nh) hand.length = Q.nh;
    }
    return { hand: hand, front: Q.front.slice(), out: Q.out, place: 0, kn: Q.kn.slice() };
  });
  var deck = info.mode === 'duel' ? [] : pool.splice(0, info.deckN);
  var disc = []; for (v = 1; v <= NV; v++) for (k = 0; k < info.disc[v]; k++) disc.push(v);
  var pend = null;
  if (info.need && (info.need.k === 'take' || info.need.k === 'draw')) { var cards = info.pend || (info.pendPub ? rep(info.pendPub.v, info.pendPub.n) : [1]); pend = { v: cards[0], n: cards.length, cards: cards.slice(), src: info.need.k === 'take' ? 'field' : 'deck' }; }
  return { mode: info.mode, n: info.n, rng: rng, round: 1, tok: info.tok.slice(), score: info.score.slice(), P: P, deck: deck, unused: [], disc: disc,
    field: info.field ? { v: info.field.v, n: info.field.n, p: info.field.p } : null, lastP: info.lastP, passN: info.passN, need: { p: info.need.p, k: info.need.k }, pend: pend,
    finish: info.finish.slice(), phase: 'play', ev: [], evId: 0, k: 0, results: [], result: null, winners: null, start: 0, quiet: true };
}
function reward(S, p) {
  var r = S.result;
  if (!r) {   // 打ち切り：手札の少なさで
    var mine = S.P[p].hand.length, worse = 0, cnt = 0; S.P.forEach(function (P, q) { if (q !== p && !P.out) { cnt++; if (P.hand.length > mine) worse++; } });
    return S.P[p].out ? 1 : cnt ? 0.5 * worse / cnt : 0.5;
  }
  if (S.mode === 'duel') return r.winner === p ? 1 : 0;
  if (S.mode === 'adv') return r.gain[p] / 4;
  if (r.loser === p) return 0;
  var place = S.P[p].place || S.n; return 0.9 + 0.1 * (S.n - place) / (S.n - 1);   // 最後でなければOK（早く上がるほどほんの少し上）
}
function rollout(S, W, rng, maxSteps) {
  var steps = 0;
  while (S.phase === 'play' && steps++ < maxSteps) {
    var p = S.need.p, info = viewForAI(S, p); info.unseen = null;
    var a = decideW(info, W, rng);
    if (act(S, p, a)) act(S, p, fallback(S, p));
  }
}
function fallback(S, p) {
  var k = S.need.k, P = S.P[p];
  if (k === 'take' || k === 'draw') return { a: k, pos: -1 };
  if (k === 'front') return { a: 'front', f: 0, pos: -1 };
  var o = legalPlays(P.hand, P.front, S.field, S.mode); return S.field ? { a: 'pass' } : o[0];
}
function candidates(info, W) {
  var nd = info.need, h = info.hand, list = [];
  if (nd.k === 'take' || nd.k === 'draw') {
    var v = info.pend[0], n = info.pend.length;
    placeOptions(h, v, n).forEach(function (o) { var t = o.pos < 0 ? h : h.slice(0, o.pos).concat(rep(v, n), h.slice(o.pos)); list.push({ a: { a: nd.k, pos: o.pos }, val: E(t, W) }); });
  } else if (nd.k === 'front') {
    info.front.forEach(function (c, f) { placeOptions(h, c, 1).forEach(function (o) { var t = o.pos < 0 ? h : h.slice(0, o.pos).concat([c], h.slice(o.pos)); list.push({ a: { a: 'front', f: f, pos: o.pos }, val: E(t, W) }); }); });
  } else {
    list = scorePlays(info, W);
    if (info.field) list.push({ a: { a: 'pass' }, val: passValue(info, W) });
  }
  list.sort(function (x, y) { return x.val - y.val; });
  return list;
}
function ultraDecide(info, opts) {
  var W = wStrong(info.mode), rng = opts.rng || Math.random, cands = candidates(info, W);
  if (!cands.length) return decideW(info, W, rng);
  var win = cands.filter(function (c) { return c.val <= -W.out + 1; }); if (win.length) return win[0].a;   // 上がれるなら上がる
  var K = info.need.k === 'play' ? 7 : 5;
  cands = cands.slice(0, K); if (info.need.k === 'play' && info.field && !cands.some(function (c) { return c.a.a === 'pass'; })) cands.push({ a: { a: 'pass' } });
  if (cands.length === 1) return cands[0].a;
  var sum = cands.map(function () { return 0; }), cnt = 0, budget = opts.budget || 2400, t0 = Date.now(), ms = opts.ms || 0;
  var worlds = Math.max(4, Math.floor(budget / cands.length));
  for (var w = 0; w < worlds; w++) {
    if (ms && Date.now() - t0 > ms && w >= 8) break;
    var base = determinize(info, rng);
    for (var c = 0; c < cands.length; c++) {
      var S = cloneWorld(base); S.rng = rng;
      if (act(S, info.me, cands[c].a)) { sum[c] -= 99; continue; }
      rollout(S, W, rng, 500);
      sum[c] += reward(S, info.me);
    }
    cnt++;
  }
  var bi = 0; for (c = 1; c < cands.length; c++) if (sum[c] > sum[bi] + 1e-9) bi = c;
  return cands[bi].a;
}
function aiAct(S, p, lv, opts) {
  opts = opts || {}; var rng = opts.rng || S.rng || Math.random;
  var info = infoFrom(S, p);   // ← ここから先は「見てよい情報」だけ
  var a;
  if (lv === 'weak') a = decideWeak(info, rng);
  else if (lv === 'normal') a = decideW(info, W_NORMAL, rng);
  else if (lv === 'ultra') a = ultraDecide(info, { rng: rng, budget: opts.budget, ms: opts.ms });
  else a = decideW(info, opts.W || wStrong(info.mode), rng);
  return a;
}
// 試合を最後まで（シミュレーション用）
function simMatch(lvs, rng, o) {
  o = o || {};
  var S = newMatch({ mode: o.mode || 'basic', n: lvs.length, rng: rng, start: o.start, quiet: true });
  startRound(S); var guard = 0;
  while (S.phase !== 'over' && guard++ < 100000) {
    if (S.phase === 'roundEnd') { nextRound(S); continue; }
    var p = S.need.p, a = aiAct(S, p, lvs[p], { rng: rng, budget: o.budget, W: o.Ws && o.Ws[p] });
    var err = act(S, p, a); if (err) { err = act(S, p, fallback(S, p)); if (err) throw new Error('stuck ' + err); }
  }
  return S;
}
var api = { MODES: MODES, MODE_KEYS: MODE_KEYS, NV: NV, PER: PER, mulberry: mulberry, shuffle: shuffle, beats: beats, runsOf: runsOf, newMatch: newMatch, startRound: startRound, nextRound: nextRound,
  act: act, legalPlays: legalPlays, viewFor: viewFor, aiAct: aiAct, simMatch: simMatch, E: E, bestInsert: bestInsert, determinize: determinize, unseenOf: unseenOf, infoFrom: infoFrom,
  decideW: decideW, W_DEF: W_DEF, W_NORMAL: W_NORMAL, wStrong: wStrong, fallback: fallback, cloneWorld: cloneWorld };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NT = api;
})(typeof window !== 'undefined' ? window : this);
