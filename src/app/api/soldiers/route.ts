import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getToday } from '@/lib/utils';

export const dynamic = 'force-dynamic';

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
          select: { id: true },
          take: 1,
        },
      },
    });

    const result = soldiers.map((s) => ({
      id: s.id,
      name: s.name,
      verifiedToday: s.verifications.length > 0,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching soldiers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch soldiers' },
      { status: 500 }
    );
  }
}
