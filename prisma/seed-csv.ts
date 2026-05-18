import * as fs from 'fs';
import type { PrismaClient } from '../src/generated/prisma/client';

export type CsvEquipmentRow = {
  name: string;
  team: string;
  type: string;
  serial: string;
};

/** Parse a single CSV line respecting quoted fields and doubled quotes. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

export function readEquipmentCsv(csvPath: string): CsvEquipmentRow[] {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split(/\r?\n/);

  const headerIndex = lines.findIndex(
    (line) => line.includes('שם') && line.includes('צוות') && line.includes('פריט'),
  );
  if (headerIndex === -1) {
    throw new Error('CSV header row not found (expected columns: שם, צוות, פריט, צ\')');
  }

  const header = parseCsvLine(lines[headerIndex]);
  const nameIdx = header.findIndex((h) => h.trim() === 'שם');
  const teamIdx = header.findIndex((h) => h.trim() === 'צוות');
  const typeIdx = header.findIndex((h) => h.trim() === 'פריט');
  const serialIdx = header.findIndex((h) => h.trim() === "צ'" || h.trim() === 'צ');

  if (nameIdx === -1 || teamIdx === -1 || typeIdx === -1 || serialIdx === -1) {
    throw new Error('CSV is missing required columns: שם, צוות, פריט, צ\'');
  }

  const rows: CsvEquipmentRow[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCsvLine(line);
    const name = (fields[nameIdx] ?? '').trim();
    const team = (fields[teamIdx] ?? '').trim();
    const type = (fields[typeIdx] ?? '').trim();
    const serial = (fields[serialIdx] ?? '').trim();

    if (!name || !team || !type) continue;
    rows.push({ name, team, type, serial });
  }

  return rows;
}

export function normalizeCsvSerial(val: string): string {
  const str = val.trim();
  if (
    str === '' ||
    str === '-' ||
    str === '---' ||
    str === '0' ||
    str === 'V' ||
    str === 'חייב מספר'
  ) {
    return '—';
  }
  return str;
}

export async function seedFromCsv(prisma: PrismaClient, csvPath: string) {
  const rows = readEquipmentCsv(csvPath);
  console.log(`📄 Loaded ${rows.length} equipment rows from CSV`);

  const teamCache = new Map<string, string>();
  const soldierCache = new Map<string, string>();

  let totalSoldiers = 0;
  let totalEquipment = 0;
  const teamsCreated = new Set<string>();

  for (const row of rows) {
    let teamId = teamCache.get(row.team);
    if (!teamId) {
      const team = await prisma.team.upsert({
        where: { name: row.team },
        update: {},
        create: { name: row.team },
      });
      teamId = team.id;
      teamCache.set(row.team, teamId);
      if (!teamsCreated.has(row.team)) {
        teamsCreated.add(row.team);
        console.log(`  ✅ Team: ${row.team}`);
      }
    }

    const soldierKey = `${row.team}::${row.name}`;
    let soldierId = soldierCache.get(soldierKey);
    if (!soldierId) {
      const soldier = await prisma.soldier.upsert({
        where: {
          name_teamId: { name: row.name, teamId },
        },
        update: {},
        create: { name: row.name, teamId },
      });
      soldierId = soldier.id;
      soldierCache.set(soldierKey, soldierId);
      totalSoldiers++;
    }

    await prisma.equipment.create({
      data: {
        type: row.type,
        serialNumber: normalizeCsvSerial(row.serial),
        soldierId,
      },
    });
    totalEquipment++;
  }

  return {
    teams: teamsCreated.size,
    soldiers: soldierCache.size,
    equipment: totalEquipment,
    soldiersCreated: totalSoldiers,
  };
}
