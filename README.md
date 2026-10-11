# ニワトリドリ🐔 〜こっこを そろえて おうちへ帰そう〜

ふらっとgames ／ 制作 watg
ナナトリドリ（アークライト）のルールを参考にした非公式ファンメイドのブラウザカードゲーム。iPhone 向け、サーバー不要（静的ホスティング＋PeerJS P2P）。

- 遊び方：基本ルール（3〜6人・たまご🥚2個）／発展ルール（3〜6人・10点先取）／2人デュエル
- ひとりで CPU と（弱い・普通・強い・アストラウルトラ😎）、または部屋コード・招待URL・QR でオンライン対戦（ホストが進行し、他人の手札は送らない）
- ルールの調査と判断：[RULES_NOTES.md](RULES_NOTES.md)

## ファイル
| ファイル | 役割 |
|---|---|
| index.html | 画面とスタイル |
| logic.js | ルール本体（ブラウザ／Node 共通）、CPU（強い＝評価関数、アストラウルトラ＝確定化モンテカルロ） |
| weights.js | 自己対戦で調整した「強い」の重み（tools/train.js が生成） |
| core.js / ui.js / app.js | 共通部品・描画・操作 |
| host.js / net.js | ホスト進行と PeerJS 通信（STUN のみ） |
| chars.js | CPU キャラ（ふーさん🐻 ミミ🐰 ロボミ🤖 ニャコ😺 ポチ太🐶 コンタ🦊） |
| audio.js / bgm.js / fx.js | 効果音・BGM・覚醒演出 |

## テスト
```
node test/logic.test.js                 # ルール・端のケース・漏れ・CPU の公平さ（3モード）
node test/sim.js 1000 100 800           # CPU 強さ → test/sim-report.json
python3 -m http.server 8941 &
node test/stun.js <box-ip> 3478 &
node test/e2e.js <box-ip> 8941          # ヘッドレス Chrome：390×844／375×667／横向き／2タブオンライン
node tools/train.js <basic|adv|duel> <iters> <rounds>   # 「強い」の重みを自己対戦で調整
```
