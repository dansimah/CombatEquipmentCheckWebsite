import { getDailyStatusSnapshot, type DailyStatusSnapshot } from '@/lib/daily-status';
import type { SyncChanges } from '@/lib/sheets-sync';

function getTelegramConfig(): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return null;
  return { token, chatId };
}

export function isTelegramConfigured(): boolean {
  return getTelegramConfig() !== null;
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const config = getTelegramConfig();
  if (!config) {
    console.warn('Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)');
    return false;
  }

  const url = `https://api.telegram.org/bot${config.token}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.chatId,
      text,
      parse_mode: 'HTML',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('Telegram sendMessage failed:', response.status, body);
    return false;
  }

  return true;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDailyStatusMessage(snapshot: DailyStatusSnapshot): string {
  const lines: string[] = [
    `📊 <b>סטטוס בדיקת צל״ם</b> - ${formatDateShort(snapshot.date)}`,
    '',
  ];

  for (const team of snapshot.teams) {
    const complete =
      team.totalCount > 0 && team.verifiedCount === team.totalCount;
    const suffix = complete ? ' ✅' : '';
    lines.push(
      `🎖️ ${escapeHtml(team.teamName)}: ${team.verifiedCount}/${team.totalCount}${suffix}`,
    );
  }

  const pct =
    snapshot.totalSoldiers > 0
      ? Math.round((snapshot.totalVerified / snapshot.totalSoldiers) * 100)
      : 0;

  lines.push('');
  lines.push(
    `סה״כ: ${snapshot.totalVerified}/${snapshot.totalSoldiers} (${pct}%)`,
  );

  return lines.join('\n');
}

export function formatChangeLogMessage(
  changes: SyncChanges,
  triggerLabel: string,
): string {
  const lines: string[] = [`🔄 <b>עדכון נתונים מ-Sheets</b> (${triggerLabel})`, ''];

  if (changes.addedSoldiers.length > 0) {
    lines.push('➕ <b>נוספו חיילים:</b>');
    for (const s of changes.addedSoldiers) {
      const types = s.equipmentTypes.join(', ');
      lines.push(`  • ${escapeHtml(s.name)} (${escapeHtml(s.team)}) - ${escapeHtml(types)}`);
    }
    lines.push('');
  }

  if (changes.addedEquipment.length > 0) {
    lines.push('➕ <b>פריטים שנוספו:</b>');
    for (const e of changes.addedEquipment) {
      lines.push(
        `  • ${escapeHtml(e.name)} (${escapeHtml(e.team)}) - ${escapeHtml(e.type)}`,
      );
    }
    lines.push('');
  }

  if (changes.removedSoldiers.length > 0) {
    lines.push('🗑️ <b>הוסרו חיילים:</b>');
    for (const s of changes.removedSoldiers) {
      lines.push(`  • ${escapeHtml(s.name)} (${escapeHtml(s.team)})`);
    }
    lines.push('');
  }

  if (changes.removedEquipment.length > 0) {
    lines.push('🗑️ <b>פריטים שהוסרו:</b>');
    for (const e of changes.removedEquipment) {
      lines.push(
        `  • ${escapeHtml(e.name)} (${escapeHtml(e.team)}) - ${escapeHtml(e.type)}`,
      );
    }
    lines.push('');
  }

  if (changes.modifiedEquipment.length > 0) {
    lines.push('✏️ <b>שונו:</b>');
    for (const m of changes.modifiedEquipment) {
      lines.push(
        `  • ${escapeHtml(m.name)} - ${escapeHtml(m.type)}: ${escapeHtml(m.oldSerial)} → ${escapeHtml(m.newSerial)}`,
      );
    }
    lines.push('');
  }

  const total =
    changes.addedSoldiers.length +
    changes.removedSoldiers.length +
    changes.addedEquipment.length +
    changes.removedEquipment.length +
    changes.modifiedEquipment.length;

  if (total === 0) {
    lines.push('אין שינויים מהסנכרון האחרון.');
  } else {
    lines.push(
      `סה״כ: ${changes.addedSoldiers.length + changes.addedEquipment.length} נוספו, ` +
        `${changes.removedSoldiers.length + changes.removedEquipment.length} הוסרו, ` +
        `${changes.modifiedEquipment.length} שונו`,
    );
  }

  return lines.join('\n');
}

export async function sendDailyStatusToTelegram(date?: string): Promise<boolean> {
  const snapshot = await getDailyStatusSnapshot(date);
  const message = formatDailyStatusMessage(snapshot);
  return sendTelegramMessage(message);
}

export async function sendSyncChangeLogToTelegram(
  changes: SyncChanges,
  triggerLabel: string,
): Promise<boolean> {
  const message = formatChangeLogMessage(changes, triggerLabel);
  return sendTelegramMessage(message);
}
