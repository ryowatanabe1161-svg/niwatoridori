/* ニワトリドリ：共通の定数・小道具・汎用UI（ほかのスクリプトより先に読み込む）
 * 構成：WebRTC（PeerJS）による P2P。ホストのブラウザが唯一の正（authoritative）で、山札・手札・進行・CPUの思考はホストだけが持ちます。
 * 参加者の端末には「その人が見てよい情報」だけが送られます（他人の手札・山札の並び・引いた札は送らない）。
 */
'use strict';
var $ = function (id) { return document.getElementById(id); };
var L = window.NT;
var Q = new URLSearchParams(location.search);
var CFG = window.KR_CONFIG || window.SR_CONFIG || {};
var ICE = (CFG.iceServers && CFG.iceServers.length) ? CFG.iceServers : [{ urls: 'stun:stun.l.google.com:19302' }];
if (Q.get('ice')) ICE = Q.get('ice').split(',').map(function (u) { return { urls: u }; });   // テスト・独自環境用
var PEER_OPTS = Object.assign({ debug: 1, config: { iceServers: ICE } }, CFG.peer || {});
var ID_PREFIX = 'niwatoridori-v1-', CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var TURBO = Q.has('turbo');
var T = TURBO ? { cpu: [60, 120], place: [40, 80], off: 1500, roundEnd: 1500, awaken: 2500, k: 0.15 } : { cpu: [900, 1500], place: [500, 800], off: 9000, roundEnd: 12000, awaken: 7500, k: 1 };
var MAX_HUMANS = 6, HB_MS = 3000, LOST_MS = 10000;
var LV = { weak: '弱い', normal: '普通', strong: '強い', ultra: 'アストラウルトラ😎' };
var LV_KEYS = ['weak', 'normal', 'strong', 'ultra'];
var CH = {}; window.NT_CHARS.forEach(function (c) { CH[c.id] = c; });
var CH_KEYS = window.NT_CHARS.map(function (c) { return c.id; });
var GAME_TITLE = 'ニワトリドリ🐔';
// 数字カード（1〜7）：たまごから王さままで育っていくニワトリ（絵文字＋CSS。オリジナル）
var CARD = [null,
  { n: 'たまご', e: '🥚', c: '#a8742a' },
  { n: 'ぱかっ', e: '🐣', c: '#e8590c' },
  { n: 'ひよこ', e: '🐤', c: '#d39e00' },
  { n: 'わかどり', e: '🐥', c: '#2f9e44' },
  { n: 'めんどり', e: '🐔', c: '#1971c2' },
  { n: 'おんどり', e: '🐓', c: '#c2255c' },
  { n: 'コッコ王', e: '🐔', c: '#7048e8', crown: true }];
var MODE_UI = {
  basic: { n: '基本ルール', s: '3〜6人・たまご🥚2個', d: '最後まで手札が残った1人が たまご🥚を1個失います。たまごが0個になった人が出たら終わり（その人の負け、ほかの全員が優勝）。' },
  adv: { n: '発展ルール', s: '3〜6人・10点先取', d: '1番にあがった人4点、最後まで残った人0点、ほかの人2点。だれかが10点以上になったら終わり、いちばん点の多い人が優勝（同点は全員優勝）。' },
  duel: { n: 'デュエル', s: '2人用・パスは2回まで', d: '手札11枚＋手前に表向きの札2枚。パスするたびに手前の札を1枚使い、手前の札がないのにパスしたら負け。手前の札は同じ数字を出すときに足して強くできます。' }
};
var LS_ID = 'nt-client-id', LS_NAME = 'nt-name', LS_HOST = 'nt-host-room', SS_CLIENT = 'nt-joined', LS_SOUND = 'nt-sound-off';
var host = null, client = null, lastView = null, pending = '';
function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} }
function load(k, json) { try { var v = localStorage.getItem(k); return json ? JSON.parse(v) : v; } catch (e) { return null; } }
function sstore(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function sload(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
function rid(n) { var s = ''; for (var i = 0; i < n; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; return s; }
var myId = load(LS_ID) || (function () { var v = rid(16); store(LS_ID, v); return v; })();
var soundOff = load(LS_SOUND) === '1';
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function rand(a) { return a[0] + Math.random() * (a[1] - a[0]); }
function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 8); }
function genCode() { var c = ''; for (var i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }
function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1').slice(0, 4); }
function inviteUrl(code) { var u = location.origin + location.pathname + '?room=' + code; if (Q.get('ice')) u += '&ice=' + encodeURIComponent(Q.get('ice')); return u; }
function fill(t, o) { return t.replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ''; }); }

// ---------- カードの見た目 ----------
function cardHtml(v, cls, attrs) {
  if (!v) return '<div class="cd back' + (cls ? ' ' + cls : '') + '"' + (attrs || '') + '><span class="crest">🐔</span></div>';
  var o = CARD[v], pips = ''; for (var i = 0; i < v; i++) pips += '<i></i>';
  return '<div class="cd' + (cls ? ' ' + cls : '') + '" style="--rc:' + o.c + '"' + (attrs || '') + '><span class="v">' + v + '</span><span class="em">' + o.e + (o.crown ? '<b class="crown">👑</b>' : '') + '</span><span class="nm">' + o.n + '</span><span class="pips">' + pips + '</span></div>';
}
function miniHtml(v, n, cls) { var o = CARD[v]; return '<span class="mini' + (cls ? ' ' + cls : '') + '" style="--rc:' + o.c + '" title="' + o.n + '"><b>' + v + '</b>' + o.e + (n > 1 ? '<small>×' + n + '</small>' : '') + '</span>'; }
function cname(v) { return CARD[v] ? CARD[v].e + CARD[v].n + '(' + v + ')' : '?'; }
function comboText(v, n) { return CARD[v].e + '<b>' + v + '</b>' + (n > 1 ? '×' + n + '枚' : '×1枚'); }

// ---------- 汎用UI ----------
function show(id) { ['title', 'lobby', 'game', 'end'].forEach(function (s) { $(s).classList.toggle('active', s === id); }); document.body.classList.toggle('in-game', id === 'game'); }
function overlay(id, on) { $(id).classList.toggle('active', on); }
var toastT;
function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 3000); }
function banner(msg) { var b = $('banner'); b.textContent = msg || ''; b.classList.toggle('show', !!msg); }
function confirmBox(title, text, yes, cb) {
  $('cfTitle').textContent = title; $('cfText').textContent = text; $('cfYes').textContent = yes; $('cfNo').style.display = '';
  overlay('confirmModal', true);
  $('cfYes').onclick = function () { overlay('confirmModal', false); cb(); };
  $('cfNo').onclick = function () { overlay('confirmModal', false); };
}
function alertBox(msg) { confirmBox('お知らせ', msg, 'OK', function () {}); $('cfNo').style.display = 'none'; }
function connecting(on, title, text, onCancel) {
  overlay('connecting', on);
  if (on) { $('connTitle').textContent = title || '接続中…'; $('connText').textContent = text || ''; $('connCancel').onclick = onCancel || function () { location.href = location.pathname; }; }
}
// あそびかた（モードごと）
function rulesHtml(mode) {
  var common = [
    '数字カードは 1〜7 が9枚ずつ、全部で63枚。数字が大きいほど強く（1＜7）、<b>枚数が多いほど強い</b>（数字に関係なく、7が3枚 ＜ 1が4枚）。',
    '<b>⚠️ 手札の順番は入れかえられません！</b> 配られた順のまま。場のカードや引いたカードを<b>好きな場所に差しこんで</b>、同じ数字を となり合わせよう。',
    '自分の番は「<b>カードを出す</b>」か「<b>パス</b>」のどちらか。場にカードがないときは、好きなカードを出します（パスはできません）。',
    '<b>出す</b>：手札で<b>となり合っている同じ数字</b>は、何枚でもまとめて出せます（となりの一部だけでもOK）。場にカードがあるときは、それより<b>強い組み合わせ</b>だけ。',
    '出したら、<b>直前に場にあったカード</b>を「手札に加える」か「捨てる」か選びます。加えるなら、まとめて手札の好きな場所に差しこみます。',
    'カードが出せない・出したくないときは<b>パス</b>（パスしても、次の自分の番はまた来ます）。'
  ];
  var li;
  if (mode === 'duel') {
    li = ['<b>デュエル（2人用）</b>：' + MODE_UI.duel.d].concat(common.slice(0, 5), [
      '<b>パス</b>：手前の札を1枚えらんで、手札の好きな場所に差しこむか、捨てます。<b>手前の札がないのにパスしたら負け</b>（だからパスは2回まで）。',
      '<b>手前の札を足して出す</b>：手札から出す数字と同じ数字の手前の札を、いっしょに出して強くできます（2枚とも同じなら2枚とも）。手前の札「だけ」では出せません。',
      '相手がパスしたら場のカードを全部捨てて、最後に出した人から好きなカードを出します。',
      '<b>手札を出し切ったら勝ち</b>（手前の札が残っていてもOK）。または、相手を「手前の札なしでパス」に追いこめば勝ち。'
    ]);
  } else {
    li = ['<b>' + MODE_UI[mode].n + '（3〜6人）</b>：1人8枚ずつ配り、残りは山札。' + MODE_UI[mode].d].concat(common, [
      '<b>パス</b>するときは山札から1枚引いて見て、手札の好きな場所に差しこむか、捨てます。山札がなくなったら、引かずにパスします。',
      '自分が出したあと<b>ほかの全員がパス</b>して自分の番が来たら、場のカードを全部捨てて、自分から好きなカードを出します（自分がもう上がっていたら、次の人から）。',
      '手札が0枚になったら<b>あがり</b>（勝ちぬけ）。最後の1人が残ったらラウンド終了。次のラウンドは最後に残った人から始めます。'
    ]);
  }
  li.push('空いた席はCPU（ふーさん🐻・ミミ🐰・ロボミ🤖・ニャコ😺・ポチ太🐶・コンタ🦊）。強さは 弱い／普通／強い／アストラウルトラ😎。CPUは<b>見えている情報だけ</b>で考えます（山札や他人の手札はのぞきません）。');
  li.push('<b>カード</b>：' + [1, 2, 3, 4, 5, 6, 7].map(function (v) { return miniHtml(v, 1) + ' ' + CARD[v].n; }).join('　'));
  return li.map(function (t) { return '<li>' + t + '</li>'; }).join('');
}
