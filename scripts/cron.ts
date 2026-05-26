/**
 * Scheduled tasks for LXC deployment (systemd: combatcheck-cron.service).
 * - 22:00 — sync Google Sheets → DB, Telegram change log
 * - 11:00 — Telegram daily verification status
 *
 * Uses server local timezone (set LXC to Asia/Jerusalem).
 */
import 'dotenv/config';
import cron from 'node-cron';
import { syncFromGoogleSheets } from '../src/lib/sheets-sync';
import {
  isTelegramConfigured,
  sendDailyStatusToTelegram,
  sendSyncChangeLogToTelegram,
} from '../src/lib/telegram';

const TZ = process.env.CRON_TIMEZONE || 'Asia/Jerusalem';

async function runNightlySync() {
  console.log(`[cron] Nightly Sheets sync started (${new Date().toISOString()})`);
  try {
    const result = await syncFromGoogleSheets('cron');
    console.log(`[cron] Sync done: ${result.summary} (${result.rowCount} rows)`);

    if (isTelegramConfigured()) {
      if (result.hasChanges) {
        await sendSyncChangeLogToTelegram(result.changes, '22:00');
      } else {
        console.log('[cron] No changes — skipping Telegram change log');
      }
    }
  } catch (err) {
    console.error('[cron] Nightly sync failed:', err);
  }
}

async function runMorningStatus() {
  console.log(`[cron] Morning status started (${new Date().toISOString()})`);
  try {
    if (!isTelegramConfigured()) {
      console.warn('[cron] Telegram not configured — skipping morning status');
      return;
    }
    const ok = await sendDailyStatusToTelegram();
    console.log(`[cron] Morning status sent: ${ok}`);
  } catch (err) {
    console.error('[cron] Morning status failed:', err);
  }
}

console.log(`[cron] Combat Equipment Check scheduler (timezone: ${TZ})`);
console.log('[cron]   22:00 — Google Sheets sync + change log');
console.log('[cron]   11:00 — daily verification status');

cron.schedule(
  '0 22 * * *',
  () => {
    void runNightlySync();
  },
  { timezone: TZ },
);

cron.schedule(
  '0 11 * * *',
  () => {
    void runMorningStatus();
  },
  { timezone: TZ },
);

// Keep process alive
process.stdin.resume();
