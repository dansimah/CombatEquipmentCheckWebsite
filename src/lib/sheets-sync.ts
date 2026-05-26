import type { PrismaClient } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { fetchSheetEquipmentRows } from '@/lib/google-sheets';
import {
  normalizeCsvSerial,
  type CsvEquipmentRow,
} from '../../prisma/seed-csv';

export type SyncTrigger = 'manual' | 'cron';

export interface AddedSoldierChange {
  name: string;
  team: string;
  equipmentTypes: string[];
}

export interface RemovedSoldierChange {
  name: string;
  team: string;
}

export interface AddedEquipmentChange {
  name: string;
  team: string;
  type: string;
  serial: string;
}

export interface RemovedEquipmentChange {
  name: string;
  team: string;
  type: string;
}

export interface ModifiedEquipmentChange {
  name: string;
  team: string;
  type: string;
  oldSerial: string;
  newSerial: string;
}

export interface SyncChanges {
  addedSoldiers: AddedSoldierChange[];
  removedSoldiers: RemovedSoldierChange[];
  addedEquipment: AddedEquipmentChange[];
  removedEquipment: RemovedEquipmentChange[];
  modifiedEquipment: ModifiedEquipmentChange[];
}

export interface SyncResult {
  changes: SyncChanges;
  summary: string;
  rowCount: number;
  hasChanges: boolean;
}

function soldierKey(team: string, name: string): string {
  return `${team}::${name}`;
}

function equipmentKey(team: string, name: string, type: string): string {
  return `${team}::${name}::${type}`;
}

/** Group sheet rows by soldier, then by equipment type (last row wins for duplicates). */
function buildSheetMap(rows: CsvEquipmentRow[]): Map<
  string,
  { team: string; name: string; equipment: Map<string, string> }
> {
  const map = new Map<
    string,
    { team: string; name: string; equipment: Map<string, string> }
  >();

  for (const row of rows) {
    const key = soldierKey(row.team, row.name);
    let entry = map.get(key);
    if (!entry) {
      entry = { team: row.team, name: row.name, equipment: new Map() };
      map.set(key, entry);
    }
    entry.equipment.set(row.type, normalizeCsvSerial(row.serial));
  }

  return map;
}

function countChanges(changes: SyncChanges): number {
  return (
    changes.addedSoldiers.length +
    changes.removedSoldiers.length +
    changes.addedEquipment.length +
    changes.removedEquipment.length +
    changes.modifiedEquipment.length
  );
}

export function formatSyncSummary(changes: SyncChanges): string {
  const parts: string[] = [];
  if (changes.addedSoldiers.length) {
    parts.push(`${changes.addedSoldiers.length} חיילים נוספו`);
  }
  if (changes.removedSoldiers.length) {
    parts.push(`${changes.removedSoldiers.length} חיילים הוסרו`);
  }
  if (changes.addedEquipment.length) {
    parts.push(`${changes.addedEquipment.length} פריטים נוספו`);
  }
  if (changes.removedEquipment.length) {
    parts.push(`${changes.removedEquipment.length} פריטים הוסרו`);
  }
  if (changes.modifiedEquipment.length) {
    parts.push(`${changes.modifiedEquipment.length} פריטים שונו`);
  }
  if (parts.length === 0) return 'אין שינויים';
  return parts.join(', ');
}

export async function syncFromGoogleSheets(
  trigger: SyncTrigger,
  db: PrismaClient = prisma,
): Promise<SyncResult> {
  const sheetRows = await fetchSheetEquipmentRows();
  const sheetMap = buildSheetMap(sheetRows);

  const dbTeams = await db.team.findMany({
    include: {
      soldiers: {
        include: { equipment: true },
      },
    },
  });

  const dbEquipmentByKey = new Map<
    string,
    { id: string; serial: string; soldierId: string; team: string; name: string; type: string }
  >();
  const dbSoldiersByKey = new Map<
    string,
    { id: string; team: string; name: string; equipment: { id: string; type: string; serialNumber: string }[] }
  >();

  for (const team of dbTeams) {
    for (const soldier of team.soldiers) {
      const sKey = soldierKey(team.name, soldier.name);
      dbSoldiersByKey.set(sKey, {
        id: soldier.id,
        team: team.name,
        name: soldier.name,
        equipment: soldier.equipment.map((e) => ({
          id: e.id,
          type: e.type,
          serialNumber: e.serialNumber,
        })),
      });
      for (const eq of soldier.equipment) {
        dbEquipmentByKey.set(equipmentKey(team.name, soldier.name, eq.type), {
          id: eq.id,
          serial: eq.serialNumber,
          soldierId: soldier.id,
          team: team.name,
          name: soldier.name,
          type: eq.type,
        });
      }
    }
  }

  const changes: SyncChanges = {
    addedSoldiers: [],
    removedSoldiers: [],
    addedEquipment: [],
    removedEquipment: [],
    modifiedEquipment: [],
  };

  const teamCache = new Map<string, string>();
  for (const team of dbTeams) {
    teamCache.set(team.name, team.id);
  }

  // Apply additions and updates from sheet
  for (const [sKey, sheetSoldier] of sheetMap) {
    const dbSoldier = dbSoldiersByKey.get(sKey);
    let soldierId = dbSoldier?.id;

    if (!soldierId) {
      let teamId = teamCache.get(sheetSoldier.team);
      if (!teamId) {
        const team = await db.team.create({
          data: { name: sheetSoldier.team },
        });
        teamId = team.id;
        teamCache.set(sheetSoldier.team, teamId);
      }

      const soldier = await db.soldier.create({
        data: { name: sheetSoldier.name, teamId },
      });
      soldierId = soldier.id;
      dbSoldiersByKey.set(sKey, {
        id: soldierId,
        team: sheetSoldier.team,
        name: sheetSoldier.name,
        equipment: [],
      });

      changes.addedSoldiers.push({
        name: sheetSoldier.name,
        team: sheetSoldier.team,
        equipmentTypes: [...sheetSoldier.equipment.keys()],
      });
    }

    for (const [type, serial] of sheetSoldier.equipment) {
      const eKey = equipmentKey(sheetSoldier.team, sheetSoldier.name, type);
      const existing = dbEquipmentByKey.get(eKey);

      if (!existing) {
        await db.equipment.create({
          data: { type, serialNumber: serial, soldierId },
        });
        if (!changes.addedSoldiers.some((s) => s.name === sheetSoldier.name && s.team === sheetSoldier.team)) {
          changes.addedEquipment.push({
            name: sheetSoldier.name,
            team: sheetSoldier.team,
            type,
            serial,
          });
        }
        continue;
      }

      if (existing.serial !== serial) {
        await db.equipment.update({
          where: { id: existing.id },
          data: { serialNumber: serial },
        });
        changes.modifiedEquipment.push({
          name: sheetSoldier.name,
          team: sheetSoldier.team,
          type,
          oldSerial: existing.serial,
          newSerial: serial,
        });
      }
    }
  }

  // Remove equipment not in sheet
  for (const [eKey, dbEq] of dbEquipmentByKey) {
    const sheetSoldier = sheetMap.get(soldierKey(dbEq.team, dbEq.name));
    if (!sheetSoldier || !sheetSoldier.equipment.has(dbEq.type)) {
      await db.equipment.delete({ where: { id: dbEq.id } });
      changes.removedEquipment.push({
        name: dbEq.name,
        team: dbEq.team,
        type: dbEq.type,
      });
    }
  }

  // Remove soldiers not in sheet
  for (const [sKey, dbSoldier] of dbSoldiersByKey) {
    if (!sheetMap.has(sKey)) {
      await db.soldier.delete({ where: { id: dbSoldier.id } });
      changes.removedSoldiers.push({
        name: dbSoldier.name,
        team: dbSoldier.team,
      });
    }
  }

  const summary = formatSyncSummary(changes);
  const hasChanges = countChanges(changes) > 0;

  await db.syncLog.create({
    data: {
      trigger,
      changes: changes as unknown as object,
      summary,
    },
  });

  return {
    changes,
    summary,
    rowCount: sheetRows.length,
    hasChanges,
  };
}
