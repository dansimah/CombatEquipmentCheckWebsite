import { prisma } from '@/lib/db';
import { getToday } from '@/lib/utils';

interface VerificationItemData {
  equipmentType: string;
  serialNumber: string;
  verified: boolean;
}

export interface TeamDailyStatus {
  teamName: string;
  verifiedCount: number;
  totalCount: number;
}

export interface DailyStatusSnapshot {
  date: string;
  teams: TeamDailyStatus[];
  totalVerified: number;
  totalSoldiers: number;
}

/** Load per-team verification completion for a given date (same logic as admin status). */
export async function getDailyStatusSnapshot(
  date: string = getToday(),
): Promise<DailyStatusSnapshot> {
  const teams = await prisma.team.findMany({
    orderBy: { name: 'asc' },
    include: {
      soldiers: {
        include: {
          verifications: {
            where: { date },
            orderBy: { timestamp: 'desc' },
            take: 1,
          },
          _count: { select: { equipment: true } },
        },
      },
    },
  });

  const teamStatuses: TeamDailyStatus[] = [];
  let totalVerified = 0;
  let totalSoldiers = 0;

  for (const team of teams) {
    let verifiedCount = 0;
    const totalCount = team.soldiers.length;
    totalSoldiers += totalCount;

    for (const soldier of team.soldiers) {
      const lastVerification = soldier.verifications[0] ?? null;
      const totalEquipment = soldier._count.equipment;

      if (lastVerification && totalEquipment > 0) {
        const items =
          (lastVerification.items as unknown as VerificationItemData[]) || [];
        const verifiedItemCount = items.filter((i) => i.verified).length;
        if (verifiedItemCount >= totalEquipment) {
          verifiedCount++;
        }
      }
    }

    totalVerified += verifiedCount;
    teamStatuses.push({
      teamName: team.name,
      verifiedCount,
      totalCount,
    });
  }

  return {
    date,
    teams: teamStatuses,
    totalVerified,
    totalSoldiers,
  };
}
