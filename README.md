# SPEAK BEAT

音楽に乗りながら重要な英語表現を声に出し、反応速度と表現の自動化を鍛える個人用PWAです。

公開URL: https://yuuuh26.github.io/english-speaking-beat/

## Modes

- QUICK SPEAK — 日本語から瞬間英作文
- MEMORY SPEAK — 読み上げを聞き、段階的な穴あき英文を再現
- LISTEN & REPEAT — 音声だけを聞いて全文を再現
- REVIEW — 苦手表現を優先出題

## Local check

ES ModulesとService Workerを利用するため、ファイルを直接開かずHTTPサーバーで確認します。

```sh
npm test
npm run validate
python3 -m http.server 4173
```

その後 `http://localhost:4173/` を開きます。SpeechRecognitionはAndroid Chromeでの実機確認が必要です。

## BGMを追加する

1. MP3などの音源を `assets/bgm/` に置く（Base64化しない）
2. `data/tracks.json` の `tracks` に項目を追加する

```json
{"id":"track-01","title":"Track 01","src":"./assets/bgm/track-01.mp3","enabled":true}
```

曲はSTART操作後に読み込み・再生され、問題切替では曲頭へ戻りません。ユーザー提供音源が未配置でも、BGMなしでプレイできます。

## Data

- 英文: `data/phrases-core.json`
- Score / Combo / MEMORY倍率: `data/game-config.json`
- BGM一覧: `data/tracks.json`
- 学習記録: IndexedDB

問題追加時にゲームロジックの変更は不要です。

## Privacy

外部AI API、広告、アクセス解析、アカウント、クラウド同期は使用しません。音声そのものは保存しません。`noindex` は検索エンジン向けの指定であり、アクセス制限ではありません。
