# SLTI Diagnosis

SLTI診断サイトのVercel配布用静的ビルドです。

## Vercel設定

- Framework Preset: Other
- Build Command: 空欄
- Output Directory: `.`

`vercel.json` のrewriteにより、`/quiz`、`/profile`、`/result`、`/types`、`/type/{code}` へ直接アクセスしても `index.html` を返します。

## 注意

この配布版はブラウザ内で診断・採点できます。Googleスプレッドシートへの回答保存APIは含みません。
