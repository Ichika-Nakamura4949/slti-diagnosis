# SLTI Diagnosis

SLTI診断サイトのVercel配布用静的ビルドです。

## Vercel設定

- Framework Preset: Other
- Build Command: 空欄
- Output Directory: `.`

`vercel.json` のrewriteにより、`/quiz`、`/profile`、`/result`、`/types`、`/type/{code}` へ直接アクセスしても `index.html` を返します。

## Googleスプレッドシート保存

VercelのProject Settings > Environment Variables に次を追加します。

- `GOOGLE_SERVICE_ACCOUNT_JSON`: Google CloudのサービスアカウントJSONを1行の文字列で入れる
- `GOOGLE_SHEETS_SPREADSHEET_ID`: 保存先スプレッドシートID
- `GOOGLE_SHEETS_RANGE`: `responses!A:BS`（未設定でもこの値になります）

保存先のGoogleスプレッドシートは、サービスアカウントJSON内の `client_email` に編集者権限で共有してください。

## 注意

認証情報やスプレッドシートIDが未設定でも、診断結果は表示されます。その場合は回答保存だけ行われません。
