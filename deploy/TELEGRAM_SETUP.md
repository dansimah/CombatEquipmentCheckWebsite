# Telegram Bot Setup

## 1. Create a bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the prompts.
3. Copy the **bot token** (looks like `123456789:ABCdefGHI...`).

## 2. Create a group and add the bot

1. Create a new Telegram group (or use an existing one).
2. Add your bot as a member.
3. Send any message in the group (so the bot can see activity).

## 3. Get the chat ID

1. Visit in a browser (replace `YOUR_TOKEN`):

   ```
   https://api.telegram.org/botYOUR_TOKEN/getUpdates
   ```

2. Find `"chat":{"id":-1001234567890,...}` — the **id** is your `TELEGRAM_CHAT_ID`.
   - Group IDs are usually negative numbers (e.g. `-1001234567890`).

## 4. Configure `.env` on the LXC

```env
TELEGRAM_BOT_TOKEN="your-bot-token"
TELEGRAM_CHAT_ID="-1001234567890"
```

Restart the cron service after updating:

```bash
sudo systemctl restart combatcheck-cron
```

## 5. Test manually (on LXC)

```bash
cd /opt/combatcheck
source .env
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\":\"${TELEGRAM_CHAT_ID}\",\"text\":\"בדיקה מערכת צל״ם\"}"
```
