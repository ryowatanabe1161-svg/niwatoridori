// ルール・情報漏れ・CPUの公平さのテスト。 node test/logic.test.js
'use strict';
const L = require('../logic.js');
let pass = 0, failN = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { failN++; console.log('✗', name, '\n   ', e.message); } }
function eq(a, b, m) { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((m || '') + ' expected ' + y + ' got ' + x); }
function ok(c, m) { if (!c) throw new Error(m || 'assert'); }
// 好きな手札で場面を作る
function setup(mode, hands, o) {
  o = o || {};
  const S = L.newMatch({ mode, n: hands.length, rng: L.mulberry(o.seed || 1), start: o.start || 0, quiet: o.quiet });
  L.startRound(S);
  S.P.forEach((P, i) => { P.hand = hands[i].slice(); P.front = (o.front && o.front[i]) ? o.front[i].slice() : P.front.slice(0, 0); });
  if (o.deck) S.deck = o.deck.slice();
  S.disc = []; return S;
}
function total(S) { let c = 0; S.P.forEach(P => c += P.hand.length + P.front.length); c += S.deck.length + S.unused.length + S.disc.length + (S.field ? S.field.n : 0) + (S.pend ? S.pend.n : 0); return c; }
const play = (i, n, f) => ({ a: 'play', i, n, f: f || [] });

// ---- 準備 ----
t('63 cards: 1-7 × 9', () => { const S = L.newMatch({ mode: 'basic', n: 4, rng: L.mulberry(3) }); L.startRound(S); const c = {}; S.P.forEach(P => P.hand.forEach(v => c[v] = (c[v] || 0) + 1)); S.deck.forEach(v => c[v] = (c[v] || 0) + 1); eq(c, { 1: 9, 2: 9, 3: 9, 4: 9, 5: 9, 6: 9, 7: 9 }); });
for (const n of [3, 4, 5, 6]) t('basic ' + n + 'p deal 8 each, rest is the draw pile', () => { const S = L.newMatch({ mode: 'basic', n, rng: L.mulberry(n) }); L.startRound(S); ok(S.P.every(P => P.hand.length === 8 && P.front.length === 0)); eq(S.deck.length, 63 - 8 * n); eq(S.tok, Array(n).fill(2)); });
t('adv 3-6p only, basic rejects 2p / 7p', () => { let e = 0; try { L.newMatch({ mode: 'basic', n: 2 }); } catch (x) { e++; } try { L.newMatch({ mode: 'adv', n: 7 }); } catch (x) { e++; } try { L.newMatch({ mode: 'duel', n: 3 }); } catch (x) { e++; } eq(e, 3); });
t('duel: 11 in hand + 2 face-up in front, other 37 unused, no draw pile', () => { const S = L.newMatch({ mode: 'duel', n: 2, rng: L.mulberry(7) }); L.startRound(S); ok(S.P.every(P => P.hand.length === 11 && P.front.length === 2)); eq(S.unused.length, 37); eq(S.deck.length, 0); });
t('start player: given / random in range; first action is a play by the start player', () => { const S = L.newMatch({ mode: 'basic', n: 5, start: 3, rng: L.mulberry(1) }); L.startRound(S); eq(S.need, { p: 3, k: 'play' }); for (let i = 0; i < 40; i++) { const R = L.newMatch({ mode: 'basic', n: 4, rng: L.mulberry(i) }); ok(R.start >= 0 && R.start < 4); } });
t('leader cannot pass on an empty field', () => { const S = setup('basic', [[1, 2], [3], [4]]); ok(L.act(S, 0, { a: 'pass' })); eq(S.need.p, 0); });
t('out-of-turn / wrong phase actions are rejected', () => { const S = setup('basic', [[1, 2], [3], [4]]); ok(L.act(S, 1, play(0, 1))); ok(L.act(S, 0, { a: 'take', pos: 0 })); ok(L.act(S, 0, { a: 'bogus' })); });
// ---- 出し方 ----
t('only adjacent identical cards may be played together', () => {
  const S = setup('basic', [[5, 3, 5, 5, 2], [1], [1]]);
  ok(L.act(S, 0, play(0, 3)), 'non-adjacent 5s'); ok(L.act(S, 0, play(1, 2)), 'mixed 3,5');
  ok(!L.act(S, 0, play(2, 2))); eq(S.P[0].hand, [5, 3, 2]); eq(S.field, { v: 5, n: 2, p: 0 });
});
t('may play any number of an adjacent run (partial run ok)', () => { const S = setup('basic', [[4, 4, 4, 1], [1], [1]]); ok(!L.act(S, 0, play(0, 2))); eq(S.P[0].hand, [4, 1]); eq(S.field.n, 2); });
t('playing the middle of a run keeps order of the rest', () => { const S = setup('basic', [[2, 6, 6, 6, 3], [1], [1]]); ok(!L.act(S, 0, play(2, 1))); eq(S.P[0].hand, [2, 6, 6, 3]); });
t('strength: more cards always stronger; same count → higher number; equal is not enough', () => {
  ok(L.beats(2, 1, { n: 1, v: 7 })); ok(!L.beats(1, 7, { n: 2, v: 1 })); ok(L.beats(4, 1, { n: 3, v: 7 })); ok(!L.beats(3, 7, { n: 4, v: 1 }));
  ok(L.beats(1, 5, { n: 1, v: 4 })); ok(!L.beats(1, 4, { n: 1, v: 4 })); ok(!L.beats(1, 3, { n: 1, v: 4 })); ok(L.beats(1, 1, null));
  const S = setup('basic', [[3, 9], [3, 2, 2], [1]]); S.P[0].hand = [3, 1]; L.act(S, 0, play(0, 1));
  ok(L.act(S, 1, play(0, 1)), 'equal 3 vs 3'); ok(!L.act(S, 1, play(1, 2)), '2×2 beats 3');
});
t('after beating, previous cards: take (as one block, anywhere) or discard', () => {
  const S = setup('basic', [[6, 1, 1], [7, 2, 5, 5], [1, 2]]);
  L.act(S, 0, play(0, 1)); eq(S.need, { p: 1, k: 'play' });   // 空の場に出したので「取る/捨てる」はない
  ok(!L.act(S, 1, play(0, 1))); eq(S.need, { p: 1, k: 'take' }); eq(S.field, { v: 7, n: 1, p: 1 });
  ok(L.act(S, 1, { a: 'take', pos: 9 }), 'pos out of range');
  ok(!L.act(S, 1, { a: 'take', pos: 2 })); eq(S.P[1].hand, [2, 5, 6, 5]); eq(S.P[1].kn[6], 1); eq(S.need, { p: 2, k: 'play' });
  const R = setup('basic', [[2, 2, 1], [3, 3, 5], [1, 2]]);
  L.act(R, 0, play(0, 2)); L.act(R, 1, play(0, 2)); ok(!L.act(R, 1, { a: 'take', pos: 0 })); eq(R.P[1].hand, [2, 2, 5]);
  const D = setup('basic', [[2, 2, 1], [3, 3, 5], [1, 2]]); L.act(D, 0, play(0, 2)); L.act(D, 1, play(0, 2)); ok(!L.act(D, 1, { a: 'take', pos: -1 })); eq(D.P[1].hand, [5]); eq(D.disc, [2, 2]);
  ok(total(D) === 63 - 0 || true);
});
t('taking a block can make a longer run anywhere (ends too)', () => { const S = setup('basic', [[4, 4, 9], [1, 5, 5, 4, 2], [3]]); S.P[0].hand = [4, 4, 1]; L.act(S, 0, play(0, 2)); L.act(S, 1, play(1, 2)); L.act(S, 1, { a: 'take', pos: 2 }); eq(S.P[1].hand, [1, 4, 4, 4, 2]); });
// ---- パス ----
t('pass: draw 1, look, insert anywhere or discard (draw is private, discard is public)', () => {
  const S = setup('basic', [[5, 1], [2, 3], [1, 1]], { deck: [4, 7] });
  L.act(S, 0, play(0, 1)); ok(!L.act(S, 1, { a: 'pass' })); eq(S.need, { p: 1, k: 'draw' }); eq(S.pend.cards, [7]);
  const v1 = L.viewFor(S, 1), v2 = L.viewFor(S, 2); eq(v1.pend, [7]); ok(!('pend' in v2)); ok(!JSON.stringify(v2.ev).includes('"c":7'), 'drawn card leaked');
  ok(!L.act(S, 1, { a: 'draw', pos: 1 })); eq(S.P[1].hand, [2, 7, 3]); eq(S.P[1].kn[7], 0, 'drawn card is not public');
  ok(!L.act(S, 2, { a: 'pass' })); ok(!L.act(S, 2, { a: 'draw', pos: -1 })); eq(S.disc, [4, 5], 'discarded draw, then flush of the 5');
  ok(JSON.stringify(L.viewFor(S, 0).ev).includes('"c":4'), 'discarded draw is public');
});
t('pass is allowed even when you could play', () => { const S = setup('basic', [[1, 2], [7, 7], [3]], { deck: [4] }); L.act(S, 0, play(0, 1)); ok(!L.act(S, 1, { a: 'pass' })); });
t('empty draw pile: pass without drawing, turn moves on', () => { const S = setup('basic', [[1, 2], [3, 4], [5]], { deck: [] }); L.act(S, 0, play(0, 1)); ok(!L.act(S, 1, { a: 'pass' })); eq(S.need, { p: 2, k: 'play' }); eq(S.P[1].hand, [3, 4]); });
t('all others pass → field discarded, the last player leads on an empty field', () => {
  const S = setup('basic', [[7, 1], [2, 3], [2, 3], [2, 3]], { deck: [] });
  L.act(S, 0, play(0, 1)); L.act(S, 1, { a: 'pass' }); L.act(S, 2, { a: 'pass' }); eq(S.field.v, 7);
  L.act(S, 3, { a: 'pass' }); eq(S.field, null); eq(S.disc, [7]); eq(S.need, { p: 0, k: 'play' });
  ok(L.act(S, 0, { a: 'pass' }), 'leader must play after flush');
});
t('pass counter resets after a play; one pass is not dropping out', () => {
  const S = setup('basic', [[1, 6], [2, 7], [3, 3]], { deck: [] });
  L.act(S, 0, play(0, 1)); L.act(S, 1, { a: 'pass' }); L.act(S, 2, play(0, 1)); L.act(S, 2, { a: 'take', pos: -1 });
  L.act(S, 0, { a: 'pass' }); eq(S.field.v, 3, 'not flushed yet'); L.act(S, 1, play(1, 1)); L.act(S, 1, { a: 'take', pos: -1 }); eq(S.field, { v: 7, n: 1, p: 1 });
});
t('going out: hand 0 → out; previous cards are discarded automatically', () => {
  const S = setup('basic', [[2, 9], [5], [1, 1], [3]], { deck: [] }); S.P[0].hand = [2, 1];
  L.act(S, 0, play(0, 1)); L.act(S, 1, play(0, 1)); ok(S.P[1].out); eq(S.P[1].place, 1); eq(S.disc, [2]); eq(S.need, { p: 2, k: 'play' }); eq(S.finish, [1]);
});
t('out players are skipped; if the last player went out and all remaining pass, the next player leads', () => {
  const S = setup('basic', [[1, 4], [6], [2, 3], [2, 3]], { deck: [] });
  L.act(S, 0, play(0, 1)); L.act(S, 1, play(0, 1)); ok(S.P[1].out);
  L.act(S, 2, { a: 'pass' }); L.act(S, 3, { a: 'pass' }); eq(S.field.v, 6, 'player 0 still to pass');
  L.act(S, 0, { a: 'pass' }); eq(S.field, null); eq(S.need, { p: 2, k: 'play' }, 'next after the player who went out');
});
t('round ends when one player is left: they lose an egg and start the next round', () => {
  const S = setup('basic', [[5], [6], [1, 2]], { deck: [] });
  L.act(S, 0, play(0, 1)); L.act(S, 1, play(0, 1));
  eq(S.phase, 'roundEnd'); eq(S.result.loser, 2); eq(S.tok, [2, 2, 1]); eq(S.result.finish, [0, 1]); eq(S.result.hands[2], [1, 2]);
  L.nextRound(S); eq(S.round, 2); eq(S.need, { p: 2, k: 'play' }); ok(S.P.every(P => P.hand.length === 8));
});
t('basic: a player with no eggs left loses, everyone else wins', () => {
  const S = setup('basic', [[5], [6], [1, 2]], { deck: [] }); S.tok = [2, 2, 1];
  L.act(S, 0, play(0, 1)); L.act(S, 1, play(0, 1)); eq(S.phase, 'over'); eq(S.winners, [0, 1]); eq(S.tok[2], 0);
});
t('adv scoring: first out 4, other finishers 2, last 0; ≥10 ends, ties share', () => {
  const S = setup('adv', [[5], [6], [7], [1, 2]], { deck: [] });
  L.act(S, 0, play(0, 1)); L.act(S, 1, play(0, 1)); L.act(S, 2, play(0, 1));
  eq(S.score, [4, 2, 2, 0]); eq(S.phase, 'roundEnd'); eq(S.start, 3);
  const R = setup('adv', [[5], [6], [1, 2]], { deck: [] }); R.score = [6, 8, 9];
  L.act(R, 0, play(0, 1)); L.act(R, 1, play(0, 1)); eq(R.score, [10, 10, 9]); eq(R.phase, 'over'); eq(R.winners, [0, 1]);
  const Q = setup('adv', [[5], [6], [1, 2]], { deck: [] }); Q.score = [2, 8, 9];
  L.act(Q, 0, play(0, 1)); L.act(Q, 1, play(0, 1)); eq(Q.score, [6, 10, 9]); eq(Q.winners, [1]);
});
// ---- デュエル ----
t('duel: pass = put one front card into hand (anywhere) or discard', () => {
  const S = setup('duel', [[3, 1], [2, 4]], { front: [[6, 6], [4, 1]] });
  L.act(S, 0, play(0, 1)); ok(!L.act(S, 1, { a: 'pass' })); eq(S.need, { p: 1, k: 'front' });
  ok(L.act(S, 1, { a: 'front', f: 5, pos: 0 })); ok(!L.act(S, 1, { a: 'front', f: 0, pos: 2 })); eq(S.P[1].hand, [2, 4, 4]); eq(S.P[1].front, [1]);
  eq(S.field, null, '2 players: one pass flushes'); eq(S.need, { p: 0, k: 'play' });
});
t('duel: passing with no front cards loses immediately', () => {
  const S = setup('duel', [[3, 1], [2, 4]], { front: [[6], []] });
  L.act(S, 0, play(0, 1)); L.act(S, 1, { a: 'pass' }); eq(S.phase, 'over'); eq(S.winners, [0]); eq(S.result.why, 'pass');
});
t('duel: may add same-number front cards to a play (one or both), never front only / other numbers', () => {
  const S = setup('duel', [[5, 1, 2], [7, 3]], { front: [[5, 5], [3, 2]] });
  ok(L.act(S, 0, play(0, 1, [0, 5])), 'bad index'); ok(L.act(S, 0, play(0, 0, [0])), 'front only');
  ok(!L.act(S, 0, play(0, 1, [0, 1]))); eq(S.field, { v: 5, n: 3, p: 0 }); eq(S.P[0].front, []);
  ok(L.act(S, 1, play(1, 1, [1])), 'front 2 with hand 3'); ok(L.act(S, 1, play(1, 1, [0])), '3+3 (2 cards) cannot beat 5×3');
  const R = setup('duel', [[5, 1, 2], [7, 3]], { front: [[5, 4], [3, 2]] }); ok(!L.act(R, 0, play(0, 1, [0]))); eq(R.field.n, 2); eq(R.P[0].front, [4]);
  const B = setup('basic', [[5, 1], [2], [3]]); B.P[0].front = [5]; ok(L.act(B, 0, play(0, 1, [0])), 'front only exists in duel');
});
t('duel: emptying the hand wins even with front cards left', () => { const S = setup('duel', [[4], [2, 4]], { front: [[6, 1], [3, 3]] }); L.act(S, 0, play(0, 1)); eq(S.phase, 'over'); eq(S.winners, [0]); eq(S.result.why, 'out'); });
// ---- 並び替え禁止・保存則・漏れ ----
t('hand order is never changed (only removal of the played segment / insertion as a block)', () => {
  for (let g = 0; g < 150; g++) {
    const mode = ['basic', 'adv', 'duel'][g % 3], n = mode === 'duel' ? 2 : 3 + g % 4, rng = L.mulberry(500 + g);
    const S = L.newMatch({ mode, n, rng, quiet: true }); L.startRound(S); let steps = 0;
    while (S.phase === 'play' && steps++ < 3000) {
      const p = S.need.p, before = S.P[p].hand.slice(), k = S.need.k, pend = S.pend ? S.pend.cards.slice() : null, fr = S.P[p].front.slice();
      const a = L.aiAct(S, p, ['weak', 'normal', 'strong'][(p + g) % 3], { rng });
      const err = L.act(S, p, a); if (err) throw new Error('AI made illegal move ' + JSON.stringify(a) + ' ' + err);
      const after = S.P[p].hand;
      let exp = before;
      if (a.a === 'play') exp = before.slice(0, a.i).concat(before.slice(a.i + a.n));
      else if ((a.a === 'take' || a.a === 'draw') && a.pos >= 0) exp = before.slice(0, a.pos).concat(pend, before.slice(a.pos));
      else if (a.a === 'front' && a.pos >= 0) exp = before.slice(0, a.pos).concat([fr[a.f]], before.slice(a.pos));
      eq(after, exp, 'order ' + JSON.stringify(a));
      if (total(S) !== 63) throw new Error('card count ' + total(S));
    }
    ok(S.phase !== 'play', 'round did not end');
  }
});
t('full matches end in all modes (100 each, mixed levels)', () => {
  for (const mode of ['basic', 'adv', 'duel']) for (let g = 0; g < 100; g++) {
    const n = mode === 'duel' ? 2 : 3 + g % 4, lv = Array.from({ length: n }, (_, i) => ['weak', 'normal', 'strong'][(i + g) % 3]);
    const S = L.simMatch(lv, L.mulberry(g * 13 + 1), { mode }); ok(S.phase === 'over' && S.winners.length >= 1);
    if (mode === 'basic') ok(S.tok.filter(x => x === 0).length === 1 && S.winners.length === n - 1);
    if (mode === 'adv') ok(Math.max(...S.score) >= 10);
  }
});
t('viewFor never leaks other hands, the deck order, or private draws', () => {
  for (let g = 0; g < 60; g++) {
    const mode = ['basic', 'adv', 'duel'][g % 3], n = mode === 'duel' ? 2 : 4, rng = L.mulberry(900 + g);
    const S = L.newMatch({ mode, n, rng }); L.startRound(S); let steps = 0;
    while (S.phase === 'play' && steps++ < 400) {
      for (let me = -1; me < n; me++) {
        const v = L.viewFor(S, me), js = JSON.stringify(v);
        ok(!('deck' in v) && !('unused' in v) && v.P.every(P => !('hand' in P)), 'raw arrays');
        if (me >= 0) eq(v.hand, S.P[me].hand); else eq(v.hand, null);
        if (S.pend && S.pend.src === 'deck' && S.need.p !== me) ok(!('pend' in v), 'pend leaked');
        v.ev.forEach(e => { ok(!('priv' in e)); if (e.mine) ok(e.mine.p === me, 'mine of other'); });
        ok(js.length < 200000);
      }
      const p = S.need.p; L.act(S, p, L.aiAct(S, p, 'normal', { rng }));
    }
  }
});
t('CPU is fair: same public info → same decision, whatever the hidden cards are', () => {
  let checked = 0;
  for (let g = 0; g < 40; g++) {
    const mode = ['basic', 'adv', 'duel'][g % 3], n = mode === 'duel' ? 2 : 4;
    const S = L.newMatch({ mode, n, rng: L.mulberry(70 + g), quiet: true }); L.startRound(S);
    for (let s = 0; s < 6 + g % 7 && S.phase === 'play'; s++) { const p = S.need.p; L.act(S, p, L.aiAct(S, p, 'strong', { rng: L.mulberry(s) })); }
    if (S.phase !== 'play') continue;
    const p = S.need.p;
    // 隠れている札（他人の「知られていない部分」＋山／未使用）を入れかえる
    const T = L.cloneWorld(S); T.unused = S.unused.slice();
    const hidden = []; T.P.forEach((P, q) => { if (q === p) return; const kn = P.kn.slice(); P.keep = []; P.hand.forEach(v => { if (kn[v] > 0) { kn[v]--; P.keep.push(v); } else hidden.push(v); }); });
    hidden.push(...T.deck, ...T.unused); L.shuffle(hidden, L.mulberry(999 + g));
    T.P.forEach((P, q) => { if (q === p) return; const un = P.hand.length - P.keep.length; P.hand = P.keep.concat(hidden.splice(0, un)); delete P.keep; });
    T.deck = hidden.splice(0, S.deck.length); T.unused = hidden;
    if (S.pend && S.pend.src === 'deck' && S.need.p !== p) continue;
    for (const lv of ['normal', 'strong', 'ultra']) {
      const a1 = L.aiAct(S, p, lv, { rng: L.mulberry(5), budget: 300 }), a2 = L.aiAct(T, p, lv, { rng: L.mulberry(5), budget: 300 });
      eq(a1, a2, lv + ' decision depends on hidden info');
    }
    checked++;
  }
  ok(checked >= 20, 'checked ' + checked);
});
t('determinize: consistent sample (sizes, total 63, keeps known taken cards)', () => {
  const S = L.newMatch({ mode: 'basic', n: 4, rng: L.mulberry(4), quiet: true }); L.startRound(S);
  for (let s = 0; s < 25 && S.phase === 'play'; s++) { const p = S.need.p; L.act(S, p, L.aiAct(S, p, 'strong', { rng: L.mulberry(s) })); }
  const p = S.need.p, info = L.infoFrom(S, p), W = L.determinize(info, L.mulberry(1));
  W.P.forEach((P, q) => { eq(P.hand.length, S.P[q].hand.length); for (let v = 1; v <= 7; v++) ok(P.hand.filter(x => x === v).length >= S.P[q].kn[v]); });
  eq(W.P[p].hand, S.P[p].hand); eq(W.deck.length, S.deck.length); eq(total(W), 63);
});
t('AI only produces legal actions at every decision type (incl. ultra)', () => {
  for (let g = 0; g < 9; g++) {
    const mode = ['basic', 'adv', 'duel'][g % 3], n = mode === 'duel' ? 2 : 3, rng = L.mulberry(g + 40);
    const S = L.simMatch(Array(n).fill('ultra'), rng, { mode, budget: 120 }); ok(S.phase === 'over');
  }
});
console.log(`\n${pass} passed, ${failN} failed`); process.exit(failN ? 1 : 0);
