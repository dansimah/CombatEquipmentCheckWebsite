import 'dotenv/config';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedFromCsv } from './seed-csv';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Sheets to skip (template/combined sheet)
const SKIP_SHEETS = ['משותף'];

// Known sub-headers / section labels to skip (not soldier names)
const SECTION_LABELS = ["כיתה א'", "כיתה ב'", "כיתה ג'", 'כיתה א', 'כיתה ב', 'כיתה ג'];

// Columns that are metadata, not equipment
const META_COLUMNS = ['שם מלא', 'מספר אישי', 'מס"א'];

function normalizeSerial(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (str === '-' || str === '' || str === '0' || str === 'V' || str === 'חייב מספר') return null;
  return str;
}

function resolveSeedCsvPath(): string | null {
  const candidates = [
    process.env.SEED_CSV,
    path.join(process.cwd(), 'data', 'equipment-signatures-april-26.csv'),
    path.join(process.cwd(), 'data', 'equipment.csv'),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function seedFromExcel() {
  const xlsxPath = path.join(process.cwd(), 'Equpment_Data_Merged.xlsx');
  if (!fs.existsSync(xlsxPath)) {
    console.error('❌ Could not find Equpment_Data_Merged.xlsx in project root');
    process.exit(1);
  }

  const workbook = XLSX.readFile(xlsxPath);
  console.log(`📊 Found sheets: ${workbook.SheetNames.join(', ')}`);

  let totalSoldiers = 0;
  let totalEquipment = 0;

  for (const sheetName of workbook.SheetNames) {
    if (SKIP_SHEETS.includes(sheetName)) {
      console.log(`⏭️  Skipping sheet: ${sheetName}`);
      continue;
    }

    console.log(`\n📋 Processing sheet: ${sheetName}`);

    const worksheet = workbook.Sheets[sheetName];
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, { defval: null });

    if (rows.length === 0) {
      console.log(`  ⚠️  No data rows found`);
      continue;
    }

    const team = await prisma.team.create({
      data: { name: sheetName },
    });
    console.log(`  ✅ Created team: ${sheetName}`);

    const allColumns = Object.keys(rows[0]);
    const equipmentColumns = allColumns.filter((col) => !META_COLUMNS.includes(col));

    for (const row of rows) {
      const soldierName = row['שם מלא'] as string | null;

      if (!soldierName || soldierName.trim() === '') continue;
      if (SECTION_LABELS.includes(soldierName.trim())) {
        console.log(`  ⏭️  Skipping section label: ${soldierName}`);
        continue;
      }

      const soldier = await prisma.soldier.create({
        data: {
          name: soldierName.trim(),
          teamId: team.id,
        },
      });
      totalSoldiers++;

      const equipmentData: { type: string; serialNumber: string; soldierId: string }[] = [];
      for (const col of equipmentColumns) {
        const serial = normalizeSerial(row[col]);
        if (serial) {
          equipmentData.push({
            type: col,
            serialNumber: serial,
            soldierId: soldier.id,
          });
        }
      }

      if (equipmentData.length > 0) {
        await prisma.equipment.createMany({ data: equipmentData });
        totalEquipment += equipmentData.length;
      }

      console.log(`  👤 ${soldierName} — ${equipmentData.length} equipment items`);
    }
  }

  return {
    teams: workbook.SheetNames.length - SKIP_SHEETS.length,
    soldiers: totalSoldiers,
    equipment: totalEquipment,
  };
}

async function main() {
  console.log('🔄 Starting seed process...');

  console.log('🗑️  Clearing existing data...');
  await prisma.verification.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.soldier.deleteMany();
  await prisma.team.deleteMany();

  const csvPath = resolveSeedCsvPath();
  let stats: { teams: number; soldiers: number; equipment: number };

  if (csvPath) {
    console.log(`📂 Using CSV: ${csvPath}`);
    stats = await seedFromCsv(prisma, csvPath);
    console.log(`   Unique soldiers (by team): ${stats.soldiers}`);
  } else {
    console.log('📂 No CSV found — falling back to Excel');
    stats = await seedFromExcel();
  }

  await prisma.appConfig.upsert({
    where: { key: 'VERIFICATION_INTERVAL_HOURS' },
    update: { value: process.env.VERIFICATION_INTERVAL_HOURS || '24' },
    create: {
      key: 'VERIFICATION_INTERVAL_HOURS',
      value: process.env.VERIFICATION_INTERVAL_HOURS || '24',
    },
  });

  console.log(`\n🎉 Seed complete!`);
  console.log(`   Teams: ${stats.teams}`);
  console.log(`   Soldiers: ${stats.soldiers}`);
  console.log(`   Equipment items: ${stats.equipment}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
