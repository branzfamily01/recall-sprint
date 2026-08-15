# Recall Sprint

勉強したら、60秒だけ思い出す。Active Recallを習慣にする超軽量PWAです。

## GitHub Pages で公開

1. ZIPを解凍します。
2. `recall-sprint` フォルダの**中身**（`index.html`、`styles.css`、`app.js`、`manifest.webmanifest`、`service-worker.js`、`icons`フォルダ）をGitHubリポジトリ直下へアップロードします。
3. GitHubの `Settings` → `Pages` → `Deploy from a branch` を選びます。
4. `main` / `(root)` を指定して保存します。

推奨リポジトリ名: `recall-sprint`

## 保存

記録はブラウザの `localStorage` に保存します。サーバー送信や外部AI APIはありません。
