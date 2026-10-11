/* ニワトリドリ：ホスト側のゲーム進行（authoritative）。山札・手札・進行・CPUの思考はここだけ */
'use strict';
function hostId(code) { return ID_PREFIX + code; }
function defCpu() { return CH_KEYS.map(function (c) { return { lv: 'normal', ch: c }; }); }
function newRoom(name, solo) {
  return { code: solo ? 'SOLO' : genCode(), solo: !!solo, phase: 'lobby', opts: { mode: 'basic', np: 4, cpu: defCpu() }, nextSid: 2, gameNo: 0,
    seats: [{ sid: 1, name: name, kind: 'host', clientId: myId, connected: true }], G: null, notice: null, lobbyReq: null };
}
function startHost(name, resumeRoom, solo) {
  document.body.classList.add('is-host');
  host = { room: resumeRoom || newRoom(name, solo), conns: {}, lastSeen: {}, tries: 0, opened: false };
  document.body.classList.toggle('solo', !!host.room.solo);
  if (resumeRoom) host.room.seats.forEach(function (s) { if (s.kind === 'remote') s.connected = false; });
  if (resumeRoom && resumeRoom.G) { resumeRoom.G.cpuAt = 0; resumeRoom.G.nextAt = 0; resumeRoom.G.S.rng = Math.random; }
  if (host.room.solo) { host.opened = true; hostRender(); saveHost(); }
  else { connecting(true, resumeRoom ? '部屋を再開しています…' : '部屋を作っています…', 'シグナリングサーバーに接続中', function () { location.href = location.pathname; }); openHostPeer(); }
  setInterval(hostHeartbeat, 2000);
  setInterval(hostTick, TURBO ? 25 : 80);
}
function npRange(opts, nh) { var M = L.MODES[opts.mode]; return [Math.max(M.np[0], nh), M.np[1]]; }
// 席：人間が参加順に前から。残りは CPU（キャラは opts.cpu の順）
function planOwners(seats, opts) {
  var M = L.MODES[opts.mode], np = Math.min(M.np[1], Math.max(opts.np, seats.length, M.np[0])), out = [], ci = 0;
  for (var i = 0; i < np; i++) {
    var h = seats[i];
    if (h) out.push({ kind: 'human', sid: h.sid, name: h.name });
    else { var c = opts.cpu[ci++] || { lv: 'normal', ch: 'fuu' }; out.push({ kind: 'cpu', lv: c.lv, ch: c.ch, name: CH[c.ch].name, e: CH[c.ch].e }); }
  }
  return out;
}
function hostStartGame() {
  var R = host.room;
  if (!R.seats.length) return;
  if (R.seats.length > L.MODES[R.opts.mode].np[1]) { toast('このルールは' + L.MODES[R.opts.mode].np[1] + '人までです'); return; }
  R.gameNo++; R.lobbyReq = null;
  var owners = planOwners(R.seats, R.opts), ultraI = -1;
  owners.forEach(function (o, i) { if (o.kind === 'cpu' && o.lv === 'ultra' && ultraI < 0) ultraI = i; });
  var S = L.newMatch({ mode: R.opts.mode, n: owners.length });
  L.startRound(S);
  R.G = { S: S, owners: owners, ultra: ultraI >= 0 ? owners[ultraI].ch : null, startAt: Date.now() + (ultraI >= 0 ? T.awaken : 600), started: false, cpuAt: 0, nextAt: 0, roundEndAt: 0, say: null, seenEv: S.evId };
  R.phase = 'game';
  hostBroadcast();
}
function say(p, key, o) {
  var G = host.room.G, ow = G.owners[p]; if (!ow || ow.kind !== 'cpu') return;
  var lines = CH[ow.ch].L[key]; if (!lines) return;
  G.say = { id: (G.say ? G.say.id : 0) + 1, p: p, text: fill(pick(lines), o || {}) + (ow.lv === 'ultra' && Math.random() < 0.5 ? '😎' : '') };
}
function isCpu(p) { var o = host.room.G.owners[p]; return o && o.kind === 'cpu'; }
function afterEvents() {   // 新しく起きた出来事に CPU がひとこと
  var G = host.room.G, S = G.S;
  S.ev.forEach(function (e) {
    if (e.id <= G.seenEv) return;
    G.seenEv = e.id;
    var rr = Math.random();
    if (e.k === 'play' && isCpu(e.p) && e.n >= 3) say(e.p, 'big', { n: e.n });
    else if (e.k === 'take' && e.keep && isCpu(e.p) && rr < 0.35) say(e.p, 'take');
    else if (e.k === 'pass' && isCpu(e.p) && rr < 0.12) say(e.p, 'pass');
    else if (e.k === 'flush' && isCpu(e.lead) && rr < 0.3) say(e.lead, 'lead');
    else if (e.k === 'out' && isCpu(e.p)) say(e.p, 'out');
    else if (e.k === 'end' && e.loser >= 0 && isCpu(e.loser) && S.mode !== 'duel') say(e.loser, 'last');
    else if (e.k === 'round' && e.round === 1) { var cs = G.owners.map(function (o, i) { return i; }).filter(isCpu); if (cs.length) say(pick(cs), 'greet'); }
  });
}
function delayFor() {
  var S = host.room.G.S, e = S.ev[S.ev.length - 1], d = 700;
  if (!e) return 500;
  if (e.k === 'play') d = S.need && S.need.k !== 'play' ? 500 : 1000 + Math.min(e.n, 6) * 120;
  else if (e.k === 'flush') d = 1300;
  else if (e.k === 'out') d = 1800;
  else if (e.k === 'pass') d = 600;
  else if (e.k === 'take' || e.k === 'draw' || e.k === 'front') d = 650;
  else if (e.k === 'round') d = 1200;
  return d * T.k;
}
function applyAct(p, a) {
  var G = host.room.G, S = G.S;
  var err = L.act(S, p, a); if (err) return err;
  afterEvents(); G.nextAt = Date.now() + delayFor(); G.cpuAt = 0;
  if (S.phase === 'roundEnd' || S.phase === 'over') G.roundEndAt = Date.now() + T.roundEnd + 1600 * T.k;
  hostBroadcast(); return null;
}
function num(x) { return typeof x === 'number' ? x : x == null ? NaN : +x; }
function hostAction(sid, m) {
  var R = host.room, G = R.G; if (!G || R.phase !== 'game') return null;
  var S = G.S, nd = S.need;
  if (Date.now() < G.startAt || !nd) return null;
  var o = G.owners[nd.p];
  if (!o || o.kind !== 'human' || o.sid !== sid) return 'あなたの番ではありません';
  var v = m.v || {}, a;
  if (m.a === 'play') a = { a: 'play', i: num(v.i), n: num(v.n), f: Array.isArray(v.f) ? v.f.slice(0, 2).map(num) : [] };
  else if (m.a === 'pass') a = { a: 'pass' };
  else if (m.a === 'take' || m.a === 'draw') a = { a: m.a, pos: num(v.pos) };
  else if (m.a === 'front') a = { a: 'front', f: num(v.f), pos: num(v.pos) };
  else return '不明な操作です';
  return applyAct(nd.p, a);
}
function hostTick() {
  if (!host || !host.opened) return;
  var R = host.room, G = R.G, now = Date.now();
  if (R.phase !== 'game' || !G) return;
  if (now < G.startAt) return;
  if (!G.started) { G.started = true; G.nextAt = now + 300; afterEvents(); hostBroadcast(); return; }
  var S = G.S;
  if (S.phase === 'play' && S.need) {
    var p = S.need.p, o = G.owners[p], seat = o.kind === 'human' ? seatBySid(o.sid) : null;
    var proxy = o.kind === 'human' && seat && seat.kind === 'remote' && !seat.connected;
    if (o.kind !== 'cpu' && !proxy) { G.cpuAt = 0; return; }
    if (now < G.nextAt) return;
    if (!G.cpuAt) { G.cpuAt = now + (o.kind === 'cpu' ? rand(S.need.k === 'play' ? T.cpu : T.place) : T.off); hostBroadcast(); return; }
    if (now < G.cpuAt) return;
    G.cpuAt = 0;
    if (proxy) toastAll('切断中の ' + seat.name + ' のかわりに CPU が出しました');
    var a = L.aiAct(S, p, o.kind === 'cpu' ? o.lv : 'normal', { budget: TURBO ? 300 : 1500, ms: TURBO ? 120 : 650 });
    if (applyAct(p, a)) applyAct(p, L.fallback(S, p));
    return;
  }
  if (S.phase === 'roundEnd' || S.phase === 'over') {
    if (!G.roundEndAt) G.roundEndAt = now + T.roundEnd;
    if (now >= G.roundEndAt) {
      G.roundEndAt = 0;
      if (S.phase === 'over') R.phase = 'end';
      else { L.nextRound(S); G.nextAt = now + 1200 * T.k; afterEvents(); }
      hostBroadcast();
    } else if (now - (G.tickAt || 0) > 1000) { G.tickAt = now; hostBroadcast(); }
  }
}
function viewFor(sid) {
  var R = host.room, G = R.G, now = Date.now(), you = -1;
  R.seats.forEach(function (s, i) { if (s.sid === sid) you = i; });
  var v = { t: 'state', phase: R.phase, code: R.code, solo: R.solo, you: you, sid: sid, gameNo: R.gameNo, opts: JSON.parse(JSON.stringify(R.opts)),
    seats: R.seats.map(function (s) { return { sid: s.sid, name: s.name, kind: s.kind, connected: s.kind !== 'remote' || s.connected }; }), notice: R.notice };
  if (sid === 1 && R.lobbyReq && R.phase !== 'lobby') v.lobbyReq = R.lobbyReq;
  if (R.phase === 'lobby' || !G) return v;
  var S = G.S, me = -1;
  G.owners.forEach(function (o, i) { if (o.kind === 'human' && o.sid === sid) me = i; });
  v.g = L.viewFor(S, me);   // ← 自分が見てよい情報だけ（他人の手札・山札・人の引いた札は入らない）
  v.g.me = me;
  v.g.owners = G.owners.map(function (o) { var s = o.kind === 'human' ? seatBySid(o.sid) : null; return { kind: o.kind, sid: o.sid, name: o.name, lv: o.lv, ch: o.ch, e: o.e, connected: !s || s.kind !== 'remote' || s.connected }; });
  v.g.ultra = G.ultra; v.g.wait = Math.max(0, G.startAt - now); v.g.say = G.say; v.g.thinking = G.cpuAt ? S.need && S.need.p : -1;
  v.g.nextIn = G.roundEndAt ? Math.max(0, G.roundEndAt - now) : null;
  return v;
}
function seatByClient(cid) { return host.room.seats.filter(function (s) { return s.clientId === cid; })[0]; }
function seatBySid(sid) { return host.room.seats.filter(function (s) { return s.sid === sid; })[0]; }
function toastAll(msg) { var R = host.room; R.notice = { id: (R.notice ? R.notice.id : 0) + 1, msg: msg, toast: true }; }
function hostToLobby(msg) {
  var R = host.room;
  R.phase = 'lobby'; R.G = null; R.lobbyReq = null;
  R.seats = R.seats.filter(function (s) { if (s.kind === 'remote') { s.left = false; return !!s.connected; } return true; });
  R.notice = { id: (R.notice ? R.notice.id : 0) + 1, msg: msg };
  hostBroadcast();
}
function hostLobbyReq(seat) {
  var R = host.room;
  if (seat.kind !== 'remote' || R.phase === 'lobby') return;
  if (R.lobbyReq && R.lobbyReq.sid === seat.sid && Date.now() - R.lobbyReq.at < 5000) return;
  R.lobbyReq = { sid: seat.sid, name: seat.name, at: Date.now() };
  hostBroadcast();
}
function hostBroadcast() {
  var R = host.room;
  R.seats.forEach(function (s) { if (s.kind !== 'remote') return; var c = host.conns[s.clientId]; if (c && c.open) { try { c.send(viewFor(s.sid)); } catch (e) {} } });
  hostRender(); saveHost();
}
function hostRender() { render(viewFor(1)); }
var saveT = 0;
function saveHost() {
  var now = Date.now(); if (now - saveT < 700 && host.room.phase === 'game') return; saveT = now;
  try { localStorage.setItem(LS_HOST, JSON.stringify({ room: host.room, saved: now }, function (k, v) { return k === 'rng' ? undefined : v; })); } catch (e) {}
}
