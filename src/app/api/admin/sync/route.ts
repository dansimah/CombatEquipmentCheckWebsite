import { NextRequest, NextResponse } from 'next/server';
import { syncFromGoogleSheets } from '@/lib/sheets-sync';
import {
  isTelegramConfigured,
  sendSyncChangeLogToTelegram,
} from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authCookie = request.cookies.get('admin_auth');
    if (!authCookie || authCookie.value !== 'true') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await syncFromGoogleSheets('manual');

    if (result.hasChanges && isTelegramConfigured()) {
      const now = new Date().toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Jerusalem',
      });
      await sendSyncChangeLogToTelegram(result.changes, `ידני ${now}`);
    }

    return NextResponse.json({
      success: true,
      summary: result.summary,
      rowCount: result.rowCount,
      hasChanges: result.hasChanges,
      changes: result.changes,
    });
  } catch (error) {
    console.error('Error syncing from Google Sheets:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to sync from Google Sheets';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
