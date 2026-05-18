import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getToday } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface VerificationItemData {
  equipmentType: string;
  serialNumber: string;
  verified: boolean;
}

export async function GET(request: NextRequest) {
  try {
    // Check admin auth cookie
    const authCookie = request.cookies.get('admin_auth');
    if (!authCookie || authCookie.value !== 'true') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || getToday();
    const teamId = searchParams.get('teamId') || null;

    // Get soldiers (filtered by teamId if provided) with their equipment count and latest verification for the date
    const soldiers = await prisma.soldier.findMany({
      where: teamId ? { teamId } : undefined,
      include: {
        equipment: true,
        verifications: {
          where: { date },
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
    });

    const summary: Record<string, { total: number; verified: number }> = {};

    for (const soldier of soldiers) {
      const lastVerification = soldier.verifications[0] || null;
      const verifiedItems = lastVerification
        ? ((lastVerification.items as unknown as VerificationItemData[]) || [])
        : [];

      const verifiedMap = new Map<string, boolean>();
      for (const vi of verifiedItems) {
        if (vi.verified) {
          verifiedMap.set(`${vi.equipmentType}:${vi.serialNumber}`, true);
        }
      }

      for (const eq of soldier.equipment) {
        if (!summary[eq.type]) {
          summary[eq.type] = { total: 0, verified: 0 };
        }
        summary[eq.type].total += 1;

        if (verifiedMap.get(`${eq.type}:${eq.serialNumber}`)) {
          summary[eq.type].verified += 1;
        }
      }
    }

    // Convert to an array for easy rendering, filter out items with 0 total (optional, but requested format implies all or just active)
    const summaryArray = Object.entries(summary)
      .map(([type, counts]) => ({
        type,
        total: counts.total,
        verified: counts.verified,
      }))
      // Usually, it's better to show only items that actually exist in the inventory
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total); // Sort by quantity descending

    return NextResponse.json({
      date,
      teamId,
      summary: summaryArray,
    });
  } catch (error) {
    console.error('Error fetching admin summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch equipment summary' },
      { status: 500 }
    );
  }
}
