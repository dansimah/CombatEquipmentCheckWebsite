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
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');

    if (!teamId) {
      return NextResponse.json(
        { error: 'teamId parameter is required' },
        { status: 400 }
      );
    }

    const today = getToday();

    const soldiers = await prisma.soldier.findMany({
      where: { teamId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        verifications: {
          where: { date: today },
          orderBy: { timestamp: 'desc' },
          select: { items: true },
          take: 1,
        },
        _count: {
          select: { equipment: true },
        },
      },
    });

    const result = soldiers.map((s) => {
      const lastVerification = s.verifications[0] || null;
      const totalEquipment = s._count.equipment;

      let verificationStatus: 'full' | 'partial' | 'none' = 'none';
      if (lastVerification) {
        const items =
          (lastVerification.items as unknown as VerificationItemData[]) || [];
        const verifiedItemCount = items.filter((i) => i.verified).length;
        if (verifiedItemCount >= totalEquipment && verifiedItemCount > 0) {
          verificationStatus = 'full';
        } else if (verifiedItemCount > 0) {
          verificationStatus = 'partial';
        }
      }

      return {
        id: s.id,
        name: s.name,
        verificationStatus,
        verifiedToday: verificationStatus === 'full',
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching soldiers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch soldiers' },
      { status: 500 }
    );
  }
}
