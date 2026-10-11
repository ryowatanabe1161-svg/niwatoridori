// E2E: ニワトリドリ — ひとり用 390×844（基本・アストラウルトラ）、375×667（発展・デュエル）、ホスト＋参加者のオンライン（PeerJS＋ローカルSTUN）
// usage: node test/stun.js <box-ip> 3478 &  python3 -m http.server 8941 &  node test/e2e.js <box-ip> 8941
const PW = process.env.PW || '/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core';
const { chromium } = require(PW);
const IP = process.argv[2] || '127.0.0.1', PORT = process.argv[3] || 8941;
const ROOT = `http://localhost:${PORT}/index.html`;
const NET = `${ROOT}?ice=${encodeURIComponent('stun:' + IP + ':3478')}&turbo`;
const SS = __dirname + '/../screenshots/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = []; const fail = m => { errors.push(m); console.log('  ✗', m); }; const ok = m => console.log('  ✓', m);
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  async function phone(label, w = 390, h = 844) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP' });
    const p = await ctx.newPage(); p.label = label;
    p.on('pageerror', e => fail(`[${label}] JS error ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/PeerJS|WebSocket|net::|ERR_|Failed to load resource/.test(m.text())) fail(`[${label}] console ${m.text()}`); });
    return p;
  }
  const view = p => p.evaluate(() => window.__nt.view && JSON.parse(JSON.stringify(window.__nt.view)));
  const waitV = (p, fn, ms) => p.waitForFunction(new Function('var v = window.__nt.view; return !!v && (' + fn + ');'), null, { timeout: ms || 20000 });
  async function layout(p, tag) {
    const r = await p.evaluate(() => {
      const vis = el => { if (!el.getClientRects().length) return false; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
      const fab = document.getElementById('hirobaFab'), fr = fab && vis(fab) ? fab.getBoundingClientRect() : null;
      const scr = document.querySelector('.screen.active') || document.body, sr = scr.getBoundingClientRect(), hits = [];
      scr.querySelectorAll('button, input, select, a').forEach(b => {
        if (!vis(b) || b === fab) return; const r = b.getBoundingClientRect(); if (!r.width || !r.height) return;
        const top = Math.max(r.top, sr.top), bot = Math.min(r.bottom, sr.bottom, innerHeight); if (bot <= top) return;
        if (fr && r.left < fr.right && r.right > fr.left && top < fr.bottom && bot > fr.top) hits.push((b.id || b.className || b.tagName) + ' ' + (b.textContent || '').trim().slice(0, 12));
      });
      const inGame = document.body.classList.contains('in-game');
      const cards = [...document.querySelectorAll('#hand .cd')].map(c => c.getBoundingClientRect());
      const wide = [...scr.querySelectorAll('*')].filter(e => vis(e) && e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('#hand') && !e.closest('#log') && !e.closest('.chips') && !e.closest('#pop')).map(e => e.id || e.className).slice(0, 3);
      const hd = document.getElementById('hand');
      return { docScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - innerHeight, scrollY, scrollX, fab: !!fr, hits, inGame, wide,
        cardMinH: cards.length ? Math.min(...cards.map(c => c.height)) : 99, cardMinW: cards.length ? Math.min(...cards.map(c => c.width)) : 99, cardMaxBottom: cards.length ? Math.max(...cards.map(c => c.bottom)) : 0, vh: innerHeight,
        handScroll: hd ? hd.scrollWidth > hd.clientWidth + 1 : false, handOv: hd ? getComputedStyle(hd).overflowX : '' };
    });
    if (r.docScroll > 1 || r.scrollY || r.scrollX) fail(`[${tag}] page scrolls: ${JSON.stringify(r)}`);
    if (r.hits.length) fail(`[${tag}] hub button overlaps: ${r.hits.join(', ')}`);
    if (r.wide.length) fail(`[${tag}] elements overflow horizontally: ${r.wide.join(', ')}`);
    if (r.inGame) {
      if (r.fab) fail(`[${tag}] hub button visible during play`);
      if (r.cardMaxBottom > r.vh + 0.5 || r.cardMinH < 72 || r.cardMinW < 48) fail(`[${tag}] hand cards off-screen/small ${JSON.stringify(r)}`);
      if (r.handOv !== 'auto') fail(`[${tag}] hand strip is not horizontally scrollable`);
    }
    return r;
  }
  async function closeRound(p) { if (await p.isVisible('#roundModal')) { if (await p.isVisible('#rdGo')) await p.tap('#rdGo').catch(() => {}); else await p.tap('#rdClose').catch(() => {}); } }
  // 自分の番を本物のタップで進める（かたまりをタップ → 枚数 → 出す ／ 取る・引く・手前 → 差しこみ口をタップ → 入れる）
  async function humanTurns(p, who, n, shots) {
    let done = 0; const kinds = {}; const t0 = Date.now();
    while (done < n && Date.now() - t0 < 150000) {
      const st = await p.waitForFunction(() => {
        const v = window.__nt.view; if (!v || v.phase !== 'game') return 'over';
        if (document.getElementById('roundModal').classList.contains('active')) return 'round';
        const g = v.g; if (!g.need || g.need.p !== g.me || g.wait > 0 || g.phase !== 'play') return false;
        if (document.querySelector('#confirmModal.active')) return 'confirm';
        return g.need.k === 'play' ? (document.querySelector('#hand .run') ? 'play' : false) : (document.querySelector('#hand .slot') ? g.need.k : false);
      }, null, { timeout: 90000, polling: 60 }).then(h => h.jsonValue(), async () => { const d = await p.evaluate(() => { const v = window.__nt.view, g = v.g; return JSON.stringify({ ph: v.phase, gp: g && g.phase, need: g && g.need, me: g && g.me, wait: g && g.wait, st: document.getElementById('status').textContent }); }); fail(`[${who}] stuck waiting for my turn: ${d}`); return 'over'; });
      if (st === 'over') break;
      if (st === 'round') { if (shots && !kinds.round) { await sleep(300); await p.screenshot({ path: SS + shots + '_round.png' }); } kinds.round = 1; await closeRound(p); await sleep(300); continue; }
      if (st === 'confirm') { await p.tap('#cfYes'); await sleep(200); continue; }
      const k = await p.evaluate(() => window.__nt.view.g.k);
      if (st === 'play') {
        const can = await p.$$('#hand .run.can');
        const g = await p.evaluate(() => { const g = window.__nt.view.g; return { field: g.field, deckN: g.deckN, mode: g.mode, fr: g.P[g.me].front.length }; });
        if (can.length && !(g.field && Math.random() < (g.mode === 'duel' ? (g.fr ? 0.5 : 0) : 0.15))) {
          await can[Math.floor(Math.random() * can.length)].tap(); await sleep(100);
          const chips = await p.$$('#acts .chip[data-cnt]:not([disabled])');
          if (chips.length > 1) { await chips[0].tap(); await sleep(60); kinds.count = 1; }
          if (shots && !kinds.sel) { await p.screenshot({ path: SS + shots + '_select.png' }); kinds.sel = 1; }
          const cmp = await p.textContent('#acts');
          if (g.field && !/vs/.test(cmp)) fail(`[${who}] no strength comparison shown`);
          if (await p.$('#playBtn:disabled')) { // 選んだ枚数では弱い → 一番多い枚数に
            const cs = await p.$$('#acts .chip[data-cnt]:not([disabled])'); if (cs.length) await cs[cs.length - 1].tap(); await sleep(60);
          }
          if (await p.$('#playBtn:disabled')) { fail(`[${who}] 出す disabled on a playable run`); await p.tap('#passBtn'); }
          else { await p.tap('#playBtn'); kinds.play = 1; }
        } else { await p.tap('#passBtn'); kinds.pass = 1; }
      } else {
        if (st === 'front') { const fp = await p.$$('#acts .chip.fpick'); if (fp.length) { await fp[fp.length - 1].tap(); await sleep(60); } }
        const slots = await p.$$('#hand .slot'); const good = await p.$$('#hand .slot.good');
        if (slots.length < 2) fail(`[${who}] insertion slots missing (${slots.length})`);
        const hl = await p.evaluate(() => window.__nt.view.g.hand.length);
        if (slots.length !== hl + 1) fail(`[${who}] expected ${hl + 1} slots (between every card + both ends), got ${slots.length}`);
        if (Math.random() < 0.15 && !good.length) { await p.tap('#discBtn'); kinds[st + '-discard'] = 1; }
        else {
          const s = good.length ? good[0] : slots[Math.floor(Math.random() * slots.length)];
          await s.scrollIntoViewIfNeeded(); await s.tap(); await sleep(100);
          if (shots && !kinds['shot' + st]) { await p.screenshot({ path: SS + shots + '_insert_' + st + '.png' }); kinds['shot' + st] = 1; }
          const before = await p.evaluate(() => window.__nt.view.g.hand.length);
          await p.tap('#insBtn'); kinds[st + '-insert'] = 1;
          await p.waitForFunction(b => window.__nt.view.g.hand && window.__nt.view.g.hand.length > b, before, { timeout: 5000 }).catch(() => fail(`[${who}] insertion did not grow the hand`));
        }
      }
      await p.waitForFunction(k => { const v = window.__nt.view; return !v.g || v.g.k !== k; }, k, { timeout: 10000 }).catch(() => fail(`[${who}] tap had no effect (${st})`));
      done++;
    }
    ok(`[${who}] ${done} actions by real taps (${Object.keys(kinds).filter(x => !/^shot/.test(x)).join('／')})`);
    return kinds;
  }
  async function finish(p, ms, sample) {
    await p.evaluate(() => { window.__nt.autoplay = true; }); const t0 = Date.now(); let s = 0;
    while (Date.now() - t0 < ms) { const v = await view(p); if (v.phase === 'end') break; await closeRound(p); if (sample && v.phase === 'game' && s < 3) { await layout(p, sample); s++; } await sleep(500); }
    return view(p);
  }

  // ================= 1) ひとり用 390×844, ?from=portal, 基本ルール4人・アストラウルトラ =================
  {
    const p = await phone('solo390');
    await p.goto(ROOT + '?turbo&from=portal'); await sleep(400);
    const L1 = await layout(p, 'title390');
    if (!L1.fab) fail('hub button should show on title with ?from=portal'); else ok('title: 🏠 ひろばへ visible with ?from=portal, no overlap, no page scroll');
    const href = await p.getAttribute('#hirobaFab', 'href'); if (!/fuusan-games/.test(href || '')) fail('hub href ' + href);
    await p.screenshot({ path: SS + 'title.png' });
    await p.fill('#nameIn', 'りょう'); await p.tap('#soloBtn'); await p.waitForSelector('#lobby.active');
    await layout(p, 'lobby390');
    await p.tap('#npSeg button[data-v="6"]'); await waitV(p, 'v.opts.np === 6');
    const nCpu = await p.$$eval('#cpuList select[data-k="ch"]', s => s.length);
    if (nCpu !== 5) fail('6人 should give 5 CPU rows, got ' + nCpu); else ok('6人 → CPU 5人');
    await p.tap('#npSeg button[data-v="4"]'); await waitV(p, 'v.opts.np === 4');
    await p.selectOption('select[data-c="0"][data-k="ch"]', 'kon');
    await p.tap('#lvAllSeg button[data-v="strong"]'); await p.selectOption('select[data-c="0"][data-k="lv"]', 'ultra');
    await waitV(p, "v.opts.cpu[0].lv === 'ultra' && v.opts.cpu[0].ch === 'kon'");
    const chs = await p.evaluate(() => window.__nt.view.opts.cpu.slice(0, 3).map(c => c.ch));
    if (new Set(chs).size !== 3) fail('duplicate characters after swap ' + chs); else ok('character select swaps instead of duplicating: ' + chs.join(','));
    await p.screenshot({ path: SS + 'lobby_solo.png' });
    await p.tap('#startBtn');
    await p.waitForSelector('#awaken.on', { timeout: 5000 }).catch(() => fail('no awakening cinematic'));
    const dur = await p.evaluate(() => Math.max.apply(null, document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#awaken')).map(x => x.effect.getComputedTiming().endTime)));
    await p.evaluate(() => document.getAnimations().forEach(a => { a.pause(); a.currentTime = 4300; }));
    await sleep(200); await p.screenshot({ path: SS + 'awaken.png' });
    const aw = await p.evaluate(() => document.getElementById('awaken').textContent.replace(/\s+/g, ' ').slice(0, 60));
    await p.evaluate(() => document.getAnimations().forEach(a => a.play()));
    if (!(dur > 5000 && dur < 9000)) fail('awakening length ' + dur); else ok(`覚醒 cinematic ${(dur / 1000).toFixed(1)}s 「${aw.trim()}」`);
    await p.tap('#awaken'); await sleep(200);
    if (await p.$('#awaken.on')) fail('tap did not skip the cinematic'); else ok('tap skips the cinematic');
    await waitV(p, 'v.g.wait === 0', 8000); await sleep(800);
    const lay = await layout(p, 'game390');
    ok(`game390 layout: hand cards ≥ ${lay.cardMinW}×${lay.cardMinH}px, no page scroll, hub hidden`);
    await p.screenshot({ path: SS + 'game_390.png' });
    const kinds = await humanTurns(p, 'solo390', 14, 'solo390');
    if (!kinds.play) fail('never played by tapping');
    if (!Object.keys(kinds).some(x => /insert/.test(x))) fail('never inserted by tapping a slot');
    await layout(p, 'game390-after');
    await p.evaluate(() => window.__nt.cutin('7×4 で出した！', 'テスト', '🦊')); await sleep(150);
    if (!(await p.$('#cutin.on'))) fail('ultra cut-in not shown'); else ok('ultra cut-in renders');
    await sleep(1700);
    const t0 = Date.now(); const v = await finish(p, 300000, 'game390-sample');
    if (v.phase !== 'end') fail('solo 390 game did not finish: ' + v.phase);
    else {
      ok(`solo basic game finished (${((Date.now() - t0) / 1000).toFixed(0)}s): rounds ${v.g.round}, eggs ${v.g.owners.map((o, i) => (o.e || '') + o.name + (o.lv ? '(' + o.lv + ')' : '') + ' ' + v.g.tok[i]).join(' / ')}, winners ${JSON.stringify(v.g.winners)}`);
      if (Math.min(...v.g.tok) !== 0) fail('basic should end when someone has 0 eggs');
      await sleep(400); await p.screenshot({ path: SS + 'result_390.png' }); await layout(p, 'result390');
      const fabEnd = await p.evaluate(() => getComputedStyle(document.getElementById('hirobaFab')).display !== 'none');
      if (!fabEnd) fail('hub button should return on the result screen'); else ok('hub button back on result screen');
    }
    await p.context().close();
  }

  // ================= 2) ひとり用 375×667（iPhone SE）: 発展4人 ／ デュエル =================
  for (const [mode, np] of [['adv', 5], ['duel', 2]]) {
    const p = await phone('solo375-' + mode, 375, 667);
    await p.goto(ROOT + '?turbo&from=portal'); await sleep(300);
    await layout(p, 'title375'); if (mode === 'adv') await p.screenshot({ path: SS + 'title_375.png' });
    await p.tap('#soloBtn'); await p.waitForSelector('#lobby.active');
    await p.tap(`#modeSeg button[data-v="${mode}"]`); await sleep(150); if (await p.$(`#npSeg button[data-v="${np}"]:not(.on)`)) await p.tap(`#npSeg button[data-v="${np}"]`); await p.tap('#lvAllSeg button[data-v="strong"]');
    await waitV(p, `v.opts.np === ${np} && v.opts.mode === '${mode}'`).catch(() => fail(`could not select ${mode}/${np}`));
    await layout(p, 'lobby375'); await p.screenshot({ path: SS + `lobby_375_${mode}.png` });
    await p.tap('#startBtn'); await waitV(p, 'v.phase === "game" && v.g.wait === 0');
    if (await p.$('#awaken.on')) fail('cinematic should not play without アストラウルトラ');
    await sleep(500); await layout(p, 'game375-' + mode); await p.screenshot({ path: SS + `game_375_${mode}.png` });
    const g0 = (await view(p)).g;
    if (mode === 'duel') { if (g0.hand.length !== 11 || g0.P.some(P => P.front.length !== 2) || g0.unusedN !== 37) fail('duel setup wrong ' + JSON.stringify({ h: g0.hand.length, f: g0.P.map(P => P.front), u: g0.unusedN })); else ok('duel: 11-card hands, 2 face-up front cards each, 37 unused'); }
    else if (g0.hand.length !== 8 || g0.deckN !== 63 - 8 * np) fail('adv setup wrong'); else ok(`adv: 8 cards each, deck ${g0.deckN}`);
    await p.tap('#menuBtn'); const hub = await p.isVisible('#menuHiroba'); await p.tap('#menuRules'); await sleep(150);
    if (!hub || !(await p.isVisible('#rulesModal'))) fail('⋯ menu: rules / ひろば not reachable'); else ok(`[${mode}] ⋯ menu has 🏠 ひろばへ and あそびかた during play`);
    await p.screenshot({ path: SS + `rules_375_${mode}.png` });
    await p.tap('#rulesClose');
    await humanTurns(p, 'solo375-' + mode, 12, '375_' + mode);
    const v = await finish(p, 240000, 'game375-sample');
    if (v.phase !== 'end') fail(`[${mode}] 375 game did not finish`);
    else {
      ok(`[${mode}] 375×667 ${np}-player game finished: ${mode === 'adv' ? 'scores ' + v.g.score.join(' / ') : 'winner ' + JSON.stringify(v.g.winners)}, rounds ${v.g.round}`);
      if (mode === 'adv' && Math.max(...v.g.score) < 10) fail('adv should end at 10+ points');
      await sleep(300); await p.screenshot({ path: SS + `result_375_${mode}.png` }); await layout(p, 'result375');
    }
    await p.context().close();
  }

  // ================= 2b) 横向き =================
  {
    const p = await phone('land', 844, 390);
    await p.goto(ROOT + '?turbo'); await p.tap('#soloBtn'); await p.waitForSelector('#lobby.active'); await p.tap('#startBtn');
    await waitV(p, 'v.phase === "game" && v.g.wait === 0'); await sleep(1500);
    const r = await p.evaluate(() => { const c = [...document.querySelectorAll('#hand .cd')].map(c => c.getBoundingClientRect()); return { docScroll: document.documentElement.scrollHeight - innerHeight, bottom: Math.max(...c.map(x => x.bottom)), h: Math.min(...c.map(x => x.height)) }; });
    if (r.docScroll > 1 || r.bottom > 390.5) fail('landscape layout overflow ' + JSON.stringify(r)); else ok(`landscape 844×390: no page scroll, hand cards ${r.h.toFixed(0)}px tall`);
    await p.screenshot({ path: SS + 'game_landscape.png' });
    await p.context().close();
  }

  // ================= 3) オンライン：ホスト＋参加者 =================
  {
    const host = await phone('host'), guest = await phone('guest');
    await host.goto(NET); await host.fill('#nameIn', 'りょう'); await host.tap('#createBtn');
    await host.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('codeBig').textContent), null, { timeout: 30000 }).catch(() => {});
    const code = await host.textContent('#codeBig');
    if (!/^[A-Z0-9]{4}$/.test(code)) fail('room could not be created (signaling blocked?)');
    else {
      ok('room created ' + code + ' (PeerJS cloud signaling)');
      if (!(await host.$('#qr svg, #qr canvas, #qr img'))) fail('QR code missing'); else ok('invite QR code shown');
      await guest.goto(NET + '&room=' + code); await guest.fill('#nameIn', 'たろう'); await guest.tap('#joinInvitedBtn');
      await waitV(guest, 'v.seats.length === 2', 45000).then(() => ok('guest joined via invite URL (WebRTC data channel up)'), () => fail('guest could not join'));
      await host.tap('#npSeg button[data-v="3"]'); await waitV(host, 'v.opts.np === 3');
      await host.selectOption('select[data-c="0"][data-k="lv"]', 'ultra');
      await waitV(guest, "v.opts.np === 3 && v.opts.cpu[0].lv === 'ultra'");
      if (!/アストラウルトラ/.test(await guest.textContent('#cpuList'))) fail('guest lobby does not show CPU level'); else ok('guest lobby shows CPU = アストラウルトラ😎');
      await host.screenshot({ path: SS + 'lobby_online.png' });
      await host.tap('#startBtn');
      await guest.waitForSelector('#awaken.on', { timeout: 10000 }).then(() => ok('覚醒 cinematic plays on the guest too'), () => fail('no cinematic on guest'));
      await waitV(guest, 'v.phase === "game" && v.g.wait === 0', 15000);
      // 漏れチェック：参加者のデータに他人の手札・山札・人が引いた札がない（何度か取る）
      let leaks = 0, samples = 0;
      const leakCheck = async () => { const r = await guest.evaluate(() => { const g = window.__nt.view.g; const s = JSON.stringify(window.__nt.view); return { hands: g.P.some(P => 'hand' in P), deck: 'deck' in g || /"deck"\s*:\s*\[/.test(s), priv: /"priv"/.test(s), pend: !!g.pend && g.need.p !== g.me, mineOther: g.ev.some(e => e.mine && e.mine.p !== g.me) }; }); samples++; if (Object.values(r).some(x => x)) { leaks++; fail('guest view leak ' + JSON.stringify(r)); } };
      await leakCheck();
      const watcher = setInterval(() => { leakCheck().catch(() => {}); }, 700);
      await Promise.all([[guest, 'guest', 8, 'guest'], [host, 'host', 6, null]].map(async ([p, who, n, sh]) => { await humanTurns(p, who, n, sh); await p.evaluate(() => { window.__nt.autoplay = true; }); }));
      clearInterval(watcher);
      if (!leaks) ok(`guest view never carried other hands / deck / private draws (${samples} samples)`);
      await host.evaluate(() => { window.__nt.autoplay = false; }); await guest.evaluate(() => { window.__nt.autoplay = false; });
      await sleep(800);
      const hv = await view(host), gv = await view(guest);
      if (JSON.stringify(hv.g.tok) !== JSON.stringify(gv.g.tok) || hv.g.round !== gv.g.round || hv.g.deckN !== gv.g.deckN || JSON.stringify(hv.g.field) !== JSON.stringify(gv.g.field)) fail('host/guest out of sync'); else ok('host and guest views in sync (round, deck, field, eggs)');
      await guest.screenshot({ path: SS + 'online_guest.png' });
      await waitV(host, 'v.g.need && v.g.need.p !== 1 && v.g.phase === "play"', 30000).catch(() => {});
      const before = await view(host);
      if (before.g.need && before.g.need.p !== 1) {
        await guest.evaluate(() => window.__nt.act('pass', {})); await sleep(400);
        const after = await view(host);
        if (after.g.ev.some(e => e.p === 1 && e.k === 'pass' && !before.g.ev.some(b => b.id === e.id))) fail('out-of-turn action accepted'); else ok('out-of-turn action is ignored by the host');
      }
      await host.evaluate(() => { window.__nt.autoplay = true; }); await guest.evaluate(() => { window.__nt.autoplay = true; });
      const t0 = Date.now();
      while (Date.now() - t0 < 300000) { const v = await view(guest); if (v.phase === 'end') break; await closeRound(host); await sleep(600); }
      const ev = await view(guest), eh = await view(host);
      if (ev.phase !== 'end' || eh.phase !== 'end') fail('online game did not finish: ' + eh.phase + '/' + ev.phase);
      else {
        ok(`online game finished in ${((Date.now() - t0) / 1000).toFixed(0)}s: eggs ${eh.g.tok.join(' / ')}`);
        if (JSON.stringify(eh.g.tok) !== JSON.stringify(ev.g.tok)) fail('final eggs differ host/guest');
        await sleep(400); await guest.screenshot({ path: SS + 'result_online_guest.png' });
      }
      await host.evaluate(() => { window.__nt.autoplay = false; }); await guest.evaluate(() => { window.__nt.autoplay = false; });
      await host.tap('#againBtn'); await waitV(guest, 'v.phase === "game"', 15000);
      const clear = async p => { for (let i = 0; i < 20; i++) { if (await p.$('#awaken.on')) await p.tap('#awaken').catch(() => {}); else break; await sleep(200); } };
      await clear(guest); await guest.tap('#menuBtn'); await guest.tap('#menuReq');
      await host.waitForSelector('#lobbyReqBar.show button[data-lr]:not([data-lr="no"])', { timeout: 10000 }).catch(() => {}); await clear(host);
      await host.tap('#lobbyReqBar button[data-lr]:not([data-lr="no"])', { timeout: 5000 }).catch(() => {}); await host.tap('#cfYes', { timeout: 5000 }).catch(() => {});
      await waitV(guest, 'v.phase === "lobby"').then(() => ok('ロビーに戻りたい → host 中断してロビーへ → both in lobby'), () => fail('abort to lobby failed'));
      await host.tap('#startBtn'); await waitV(guest, 'v.phase === "game"', 15000);
      await guest.goto(NET + '&room=' + code); await guest.fill('#nameIn', 'たろう'); await guest.tap('#joinInvitedBtn');
      await waitV(guest, 'v.phase === "game" && v.g.me === 1 && v.g.hand && v.g.hand.length > 0', 45000).then(() => ok('guest reloaded and rejoined mid-game by nickname (got own hand back)'), () => fail('rejoin failed'));
    }
  }
  await browser.close();
  console.log(errors.length ? `\nFAILED (${errors.length})` : '\nALL E2E CHECKS PASSED');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
