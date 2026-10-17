# たしざん

幼児向けの足し算練習アプリ。Android の Chrome で、ホーム画面に追加して使う前提（PWA）。

- 声で答える（Web Speech API）。声は認識のため Google に送られる（数を話す間だけ）。記録は端末の中だけ（localStorage）。
- 声：VOICEVOX:冥鳴ひまり（`audio/`、作り方は `tools/make_voice.py`）。

## ファイル
- `index.html` 画面（デザイン「ほし」）／ `js/app.js` 流れ ／ `js/quiz.js` 問題 ／ `js/store.js` 設定・記録 ／ `js/sound.js` 音 ／ `js/listen.js` 聞き取り ／ `numparse.js` 聞き取った文字 → 数
- `sw.js`・`manifest.webmanifest`・`icons/`（`tools/make_icons.py`）PWA
- `tools/build.py` 公開用一式を作る（`.github/workflows/pages.yml` が main への push ごとに実行）
- `test/` 聞き取りテスト（試作）・`test/logic.html` 問題と記録のテスト ／ `audio/` 声の確認 ／ `design/` デザイン案
