// CPU強さシミュレーション: node test/sim.js [matches] [ultraMatches] [ultraBudget]
// 結果は test/sim-report.json に保存。各レベル1席 vs 残り全員「普通」（duelは1対1）。
const { fork } = require('child_process'), os = require('os'), fs = require('fs'), path = require('path');
if (process.argv[2] === '--child') {
  const L = require('../logic.js');
  process.on('message', job => {
    const { mode, n, lv, opp, seeds, budget } = job; let win = 0, pts = 0, games = 0, t0 = Date.now();
    for (const sd of seeds) {
      const rng = L.mulberry(sd), seat = sd % n, lvs = Array.from({ length: n }, (_, i) => i === seat ? lv : opp);
      const S = L.simMatch(lvs, rng, { mode, budget });
      const w = S.winners || []; if (w.indexOf(seat) >= 0) win += mode === 'adv' ? 1 / w.length : 1;
      if (mode === 'adv') pts += S.P[seat].score; games++;
    }
    process.send({ win, pts, games, ms: Date.now() - t0 }); process.exit(0);
  });
  return;
}
const M = +process.argv[2] || 400, MU = +process.argv[3] || 40, UB = +process.argv[4] || 500;
const CPUS = Math.max(1, os.cpus().length - 1);
function run(job, count, base) {
  const per = Math.ceil(count / CPUS), ps = [];
  for (let c = 0; c < CPUS; c++) {
    const seeds = []; for (let i = c * per; i < Math.min(count, (c + 1) * per); i++) seeds.push(base + i * 7919 + 1);
    if (!seeds.length) continue;
    ps.push(new Promise(res => { const ch = fork(__filename, ['--child']); ch.on('message', res); ch.send(Object.assign({ seeds }, job)); }));
  }
  return Promise.all(ps).then(rs => rs.reduce((a, r) => ({ win: a.win + r.win, pts: a.pts + r.pts, games: a.games + r.games, ms: Math.max(a.ms, r.ms) }), { win: 0, pts: 0, games: 0, ms: 0 }));
}
(async () => {
  const out = { date: new Date().toISOString(), note: '勝率 = 試合に勝った割合（基本: 最後の負け1人にならない / 発展: 最高得点（同点は按分） / デュエル: 勝利）。各レベル1席 vs 残り全員の対戦相手レベル。', ultraBudget: UB, modes: {} };
  for (const [mode, n] of [['basic', 4], ['adv', 4], ['duel', 2]]) {
    const fair = mode === 'basic' ? (n - 1) / n : 1 / n; const r = { players: n, fair, vsNormal: {}, ultraVsStrong: null };
    for (const lv of ['weak', 'normal', 'strong', 'ultra']) {
      const cnt = lv === 'ultra' ? MU : M, x = await run({ mode, n, lv, opp: 'normal', budget: UB }, cnt, 1000);
      r.vsNormal[lv] = { games: x.games, win: +(x.win / x.games).toFixed(3) };
      console.log(mode, lv, 'vs normal', r.vsNormal[lv], (x.ms / 1000).toFixed(0) + 's');
    }
    const y = await run({ mode, n, lv: 'ultra', opp: 'strong', budget: UB }, MU, 5000);
    r.ultraVsStrong = { games: y.games, win: +(y.win / y.games).toFixed(3) };
    const z = await run({ mode, n, lv: 'strong', opp: 'weak', budget: UB }, M, 9000);
    r.strongVsWeak = { games: z.games, win: +(z.win / z.games).toFixed(3) };
    console.log(mode, 'ultra vs strong', r.ultraVsStrong, 'strong vs weak', r.strongVsWeak);
    out.modes[mode] = r;
  }
  fs.writeFileSync(path.join(__dirname, 'sim-report.json'), JSON.stringify(out, null, 1));
})();
