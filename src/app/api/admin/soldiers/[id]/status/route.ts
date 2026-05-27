import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getToday } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface VerificationItemData {
  equipmentId?: string;
  equipmentType: string;
  serialNumber: string;
  verified: boolean;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const authCookie = request.cookies.get('admin_auth');
    if (!authCookie || authCookie.value !== 'true') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: soldierId } = await context.params;
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || getToday();

    const soldier = await prisma.soldier.findUnique({
      where: { id: soldierId },
      include: {
        equipment: { orderBy: { type: 'asc' } },
        verifications: {
          where: { date },
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
    });

    if (!soldier) {
      return NextResponse.json({ error: 'Soldier not found' }, { status: 404 });
    }

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

    const items = soldier.equipment.map((eq) => ({
      equipmentId: eq.id,
      type: eq.type,
      serialNumber: eq.serialNumber,
      verified: verifiedMap.get(`${eq.type}:${eq.serialNumber}`) || false,
    }));

    return NextResponse.json({
      soldierId,
      date,
      items,
    });
  } catch (error) {
    console.error('Error fetching soldier status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch soldier status' },
      { status: 500 }
    );
  }
}
