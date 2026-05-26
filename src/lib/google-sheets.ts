import {
  parseEquipmentCsvContent,
  type CsvEquipmentRow,
} from '../../prisma/seed-csv';

function getSheetExportUrl(): string {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const gid = process.env.GOOGLE_SHEET_GID;

  if (!spreadsheetId || !gid) {
    throw new Error(
      'GOOGLE_SPREADSHEET_ID and GOOGLE_SHEET_GID must be set in environment',
    );
  }

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

/** Fetch equipment rows from the public Google Sheets CSV export. */
export async function fetchSheetEquipmentRows(): Promise<CsvEquipmentRow[]> {
  const url = getSheetExportUrl();
  const response = await fetch(url, {
    headers: { 'User-Agent': 'CombatEquipmentCheck/1.0' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Google Sheet (HTTP ${response.status}): ${response.statusText}`,
    );
  }

  const csv = await response.text();
  if (!csv.trim()) {
    throw new Error('Google Sheet returned empty CSV');
  }

  return parseEquipmentCsvContent(csv);
}
