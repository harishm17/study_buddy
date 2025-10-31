import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;

    // Verify user owns project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: session.user.id,
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Fetch all exams for this project
    const exams = await prisma.sampleExam.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        durationMinutes: true,
        difficultyLevel: true,
        topicsCovered: true,
        createdAt: true,
        _count: {
          select: { submissions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // For each exam, get user's best submission if exists
    const examsWithScores = await Promise.all(
      exams.map(async (exam) => {
        const bestSubmission = await prisma.examSubmission.findFirst({
          where: {
            sampleExamId: exam.id,
            userId: session.user.id,
          },
          select: {
            aiGrading: true,
            submittedAt: true,
          },
          orderBy: { submittedAt: 'desc' },
        });

        return {
          ...exam,
          attemptsCount: exam._count.submissions,
          lastAttempt: bestSubmission?.submittedAt,
          lastScore: bestSubmission?.aiGrading
            ? (bestSubmission.aiGrading as any).overall_score
            : null,
        };
      })
    );

    return NextResponse.json({ exams: examsWithScores });
  } catch (error) {
    console.error('Error fetching exams:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
