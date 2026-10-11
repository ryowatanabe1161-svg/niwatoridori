// 「強い」の重みを自己対戦で調整する（(1+λ)進化戦略、共通の乱数で比較）。 node tools/train.js <mode> <iters> <rounds>
// 結果は weights.js（モードごと）に書き出す
'use strict';
const L = require('../logic.js');
const { execFile } = require('child_process');
const fs = require('fs'), path = require('path');
const WF = path.join(__dirname, '..', 'weights.js');
function evalRounds(mode, Wc, W0, base, nR, oppLv) {
  // 1席だけ候補 Wc、残りは W0（oppLv='normal' なら「普通」）。ラウンド単位で成績
  const np = mode === 'duel' ? 2 : 4; let s = 0;
  for (let i = 0; i < nR; i++) {
    const rng = L.mulberry(base + i * 7919), seat = i % np;
    const S = L.newMatch({ mode, n: np, rng, start: Math.floor(i / np) % np, quiet: true }); L.startRound(S);
    let g = 0;
    while (S.phase === 'play' && g++ < 20000) {
      const p = S.need.p, lv = p === seat ? 'strong' : (oppLv || 'strong');
      const a = L.aiAct(S, p, lv, { rng, W: p === seat ? Wc : W0 });
      if (L.act(S, p, a)) L.act(S, p, L.fallback(S, p));
    }
    const r = S.result; if (!r) continue;
    if (mode === 'duel') s += r.winner === seat ? 1 : 0;
    else if (mode === 'adv') s += r.gain[seat] / 4;
    else s += r.loser === seat ? 0 : 1;
  }
  return s / nR;
}
if (process.argv[2] === '--child') {
  const a = JSON.parse(process.argv[3]);
  process.stdout.write(JSON.stringify(evalRounds(a.mode, a.Wc, a.W0, a.base, a.n, a.opp))); return;
}
function child(a) { return new Promise((res, rej) => execFile(process.execPath, [__filename, '--child', JSON.stringify(a)], { maxBuffer: 1 << 22 }, (e, so) => e ? rej(e) : res(JSON.parse(so)))); }
const mode = process.argv[2] || 'basic', ITERS = +process.argv[3] || 30, NR = +process.argv[4] || 3000;
const CPUS = Math.max(1, require('os').cpus().length - 1);
async function score(Wc, W0, base, opp) {
  const per = Math.ceil(NR / CPUS), jobs = [];
  for (let c = 0; c < CPUS; c++) jobs.push(child({ mode, Wc, W0, base: base + c * 1000003, n: per, opp }));
  const r = await Promise.all(jobs); return r.reduce((x, y) => x + y, 0) / r.length;
}
const KEYS = { size: [0, .3, .03], weak: [0, 3, .3], th: [5, 25, 2], sc: [.5, 6, .5], big: [0, .8, .06], pass: [-1, 2, .2], draw: [0, 3, .25], hold: [0, 2, .15], hth: [5, 30, 2], hsc: [.5, 8, .5], urg: [0, 1, .08], take: [-.5, .8, .1], fkeep: [-.5, 1.5, .15], dpass: [0, 2.5, .2] };
(async () => {
  let all = {}; try { all = JSON.parse(fs.readFileSync(WF, 'utf8').replace(/^[^{]*/, '').replace(/;\s*$/, '')); } catch (e) {}
  let best = Object.assign({}, L.W_DEF, (all.strong && all.strong[mode]) || {});
  const log = [];
  const vsNormal0 = await score(best, L.W_NORMAL, 5, 'normal');
  console.log(mode, 'start vs normal', vsNormal0.toFixed(3));
  let seed = 100;
  for (let it = 0; it < ITERS; it++) {
    const cand = Object.assign({}, best);
    const ks = Object.keys(KEYS).filter(() => Math.random() < 0.35); if (!ks.length) ks.push(Object.keys(KEYS)[Math.floor(Math.random() * 14)]);
    ks.forEach(k => { const [lo, hi, st] = KEYS[k]; cand[k] = Math.min(hi, Math.max(lo, +(cand[k] + (Math.random() * 2 - 1) * st * 2).toFixed(3))); });
    const sc = await score(cand, best, (seed += 77) * 100000);
    const fair = mode === 'duel' ? 0.5 : mode === 'adv' ? (4 + 2 * 2) / 4 / 4 : 0.75;
    const accept = sc > fair + (mode === 'duel' ? 0.012 : 0.008);
    log.push({ it, ks, sc: +sc.toFixed(4), accept });
    console.log(it, ks.join(','), sc.toFixed(4), accept ? 'ACCEPT' : '');
    if (accept) best = cand;
  }
  const vsNormal = await score(best, L.W_NORMAL, 5, 'normal');
  console.log(mode, 'end vs normal', vsNormal.toFixed(3), JSON.stringify(best));
  all.strong = all.strong || {}; all.strong[mode] = best;
  all.report = all.report || {}; all.report[mode] = { iters: ITERS, rounds: NR, vsNormalBefore: +vsNormal0.toFixed(3), vsNormalAfter: +vsNormal.toFixed(3), accepted: log.filter(x => x.accept).length };
  fs.writeFileSync(WF, '/* 自己対戦で調整した「強い」の重み（tools/train.js が生成） */\nthis.NT_WEIGHTS = ' + JSON.stringify(all, null, 1) + ';\n');
})();
