import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface VerificationItemData {
  equipmentType: string;
  serialNumber: string;
  verified: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const soldierId = searchParams.get('soldierId');

    if (!soldierId) {
      return NextResponse.json(
        { error: 'soldierId parameter is required' },
        { status: 400 }
      );
    }

    const equipment = await prisma.equipment.findMany({
      where: { soldierId },
      orderBy: { type: 'asc' },
      select: {
        id: true,
        type: true,
        serialNumber: true,
      },
    });

    // Fetch today's latest verification to return current item states
    const today = formatDate(new Date());
    const latestVerification = await prisma.verification.findFirst({
      where: { soldierId, date: today },
      orderBy: { timestamp: 'desc' },
    });

    const verifiedSet = new Set<string>();
    if (latestVerification) {
      const items = (latestVerification.items as unknown as VerificationItemData[]) || [];
      for (const item of items) {
        if (item.verified) {
          verifiedSet.add(`${item.equipmentType}:${item.serialNumber}`);
        }
      }
    }

    const result = equipment.map((eq) => ({
      ...eq,
      verifiedToday: verifiedSet.has(`${eq.type}:${eq.serialNumber}`),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching equipment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch equipment' },
      { status: 500 }
    );
  }
}
