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

/**
 * Group sheet rows by soldier, then by equipment type. Multiple rows of the
 * same type for the same soldier are preserved as a list of serials so that a
 * soldier can legitimately carry two of the same item (e.g. two magazines).
 */
function buildSheetMap(rows: CsvEquipmentRow[]): Map<
  string,
  { team: string; name: string; equipment: Map<string, string[]> }
> {
  const map = new Map<
    string,
    { team: string; name: string; equipment: Map<string, string[]> }
  >();

  for (const row of rows) {
    const key = soldierKey(row.team, row.name);
    let entry = map.get(key);
    if (!entry) {
      entry = { team: row.team, name: row.name, equipment: new Map() };
      map.set(key, entry);
    }
    const serial = normalizeCsvSerial(row.serial);
    const serials = entry.equipment.get(row.type);
    if (serials) {
      serials.push(serial);
    } else {
      entry.equipment.set(row.type, [serial]);
    }
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

  const dbSoldiersByKey = new Map<
    string,
    {
      id: string;
      team: string;
      name: string;
      equipment: { id: string; type: string; serialNumber: string }[];
    }
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

  for (const [sKey, sheetSoldier] of sheetMap) {
    let dbSoldier = dbSoldiersByKey.get(sKey);
    const isNewSoldier = !dbSoldier;
    let soldierId: string;

    if (!dbSoldier) {
      let teamId = teamCache.get(sheetSoldier.team);
      if (!teamId) {
        const team = await db.team.create({
          data: { name: sheetSoldier.team },
        });
        teamId = team.id;
        teamCache.set(sheetSoldier.team, teamId);
      }

      const created = await db.soldier.create({
        data: { name: sheetSoldier.name, teamId },
      });
      soldierId = created.id;
      dbSoldier = {
        id: soldierId,
        team: sheetSoldier.team,
        name: sheetSoldier.name,
        equipment: [],
      };
      dbSoldiersByKey.set(sKey, dbSoldier);

      changes.addedSoldiers.push({
        name: sheetSoldier.name,
        team: sheetSoldier.team,
        equipmentTypes: [...sheetSoldier.equipment.keys()],
      });
    } else {
      soldierId = dbSoldier.id;
    }

    // Bucket the soldier's DB equipment by type so we can do a multiset diff
    // per (soldier, type). This is what lets a soldier carry more than one
    // item of the same type (e.g. two magazines) without the sync collapsing
    // them down to one.
    const dbByType = new Map<string, { id: string; serial: string }[]>();
    for (const eq of dbSoldier.equipment) {
      const list = dbByType.get(eq.type);
      const entry = { id: eq.id, serial: eq.serialNumber };
      if (list) {
        list.push(entry);
      } else {
        dbByType.set(eq.type, [entry]);
      }
    }

    const allTypes = new Set<string>([
      ...sheetSoldier.equipment.keys(),
      ...dbByType.keys(),
    ]);

    for (const type of allTypes) {
      const sheetSerials = [...(sheetSoldier.equipment.get(type) ?? [])];
      const dbItems = [...(dbByType.get(type) ?? [])];

      // Pair sheet serials against DB items with the same serial — these are
      // already in sync and need no work.
      const usedDb = new Set<number>();
      const unmatchedSheet: string[] = [];
      for (const serial of sheetSerials) {
        let foundIdx = -1;
        for (let i = 0; i < dbItems.length; i++) {
          if (usedDb.has(i)) continue;
          if (dbItems[i].serial === serial) {
            foundIdx = i;
            break;
          }
        }
        if (foundIdx >= 0) {
          usedDb.add(foundIdx);
        } else {
          unmatchedSheet.push(serial);
        }
      }
      const remainingDb: { id: string; serial: string }[] = [];
      for (let i = 0; i < dbItems.length; i++) {
        if (!usedDb.has(i)) remainingDb.push(dbItems[i]);
      }

      // Pair leftovers as in-place modifications — preserves the existing
      // "type X serial changed from A to B" change-log entries for the common
      // single-item case while still doing the right thing when counts differ.
      while (unmatchedSheet.length > 0 && remainingDb.length > 0) {
        const newSerial = unmatchedSheet.shift()!;
        const dbItem = remainingDb.shift()!;
        await db.equipment.update({
          where: { id: dbItem.id },
          data: { serialNumber: newSerial },
        });
        changes.modifiedEquipment.push({
          name: sheetSoldier.name,
          team: sheetSoldier.team,
          type,
          oldSerial: dbItem.serial,
          newSerial,
        });
      }

      for (const serial of unmatchedSheet) {
        await db.equipment.create({
          data: { type, serialNumber: serial, soldierId },
        });
        if (!isNewSoldier) {
          changes.addedEquipment.push({
            name: sheetSoldier.name,
            team: sheetSoldier.team,
            type,
            serial,
          });
        }
      }

      for (const dbItem of remainingDb) {
        await db.equipment.delete({ where: { id: dbItem.id } });
        changes.removedEquipment.push({
          name: sheetSoldier.name,
          team: sheetSoldier.team,
          type,
        });
      }
    }
  }

  // Soldiers no longer in the sheet are deleted; cascade removes their
  // equipment, so we don't need to enumerate it as individual removals.
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
