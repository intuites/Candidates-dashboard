# Telegram Bot Setup

This project now includes a Telegram bot for checking and updating candidate status in the `Email_Atm` table.

## Features

- List active candidates with `/active`
- List inactive candidates with `/inactive`
- Show totals with `/counts`
- Search by name, title, skill, recruiter, or email with `/search <text>`
- View one candidate with `/status <candidateId>`
- Mark a candidate active with `/activate <candidateId>`
- Hold a candidate inactive with `/deactivate <candidateId> week`, `/deactivate <candidateId> month`, `/deactivate <candidateId> until YYYY-MM-DD`, or `/deactivate <candidateId> permanent`

## Setup

1. Create a Telegram bot with BotFather and copy the token.
2. Copy `.env.example` to `.env`.
3. Fill in:
   - `TELEGRAM_BOT_TOKEN`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_ANON_KEY`
   - `TELEGRAM_ALLOWED_CHAT_IDS` if you want to restrict access
   - `EDGE_SHEET_URL` if you also want Google Sheets sync on bot updates
4. Install dependencies:

```bash
npm install
```

5. Start the bot locally:

```bash
npm run bot
```

## Vercel Webhook

The Vercel deployment uses `/api/telegram` as the Telegram webhook endpoint:

```text
https://candidate-dashboards.vercel.app/api/telegram
```

After deploying, set the Telegram webhook to that URL. The same environment variables listed above must be configured in the Vercel project for Production.

## Notes

- The local bot uses Telegram long polling. The Vercel deployment uses a webhook because Vercel does not run long-lived polling workers.
- If `TELEGRAM_ALLOWED_CHAT_IDS` is empty, any chat that can reach the bot can use it.
- Bot status updates write to Supabase first, then try to sync the same record to Google Sheets.
- Timed holds require these Supabase columns on `Email_Atm`:

```sql
alter table "Email_Atm"
add column if not exists "Hold Type" text,
add column if not exists "Hold Until" timestamptz;
```

- Expired weekly/monthly/custom holds are activated automatically when the frontend loads candidates or when the bot checks candidates.
- If those columns are not added yet, the app falls back to storing timed hold data in the existing `Active` field. Adding the columns is still recommended for cleaner reporting and Google Sheets sync.
