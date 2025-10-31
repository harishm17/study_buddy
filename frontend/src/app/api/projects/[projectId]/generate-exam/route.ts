import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const generateExamSchema = z.object({
  topicIds: z.array(z.string()).min(1, 'At least one topic must be selected'),
  totalQuestions: z.number().min(5).max(100),
  durationMinutes: z.number().min(15).max(300),
  difficultyLevel: z.enum(['easy', 'medium', 'hard']),
  questionTypeDistribution: z.object({
    multiple_choice: z.number().min(0).max(100),
    short_answer: z.number().min(0).max(100),
    numerical: z.number().min(0).max(100),
  }).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = params;

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

    const body = await req.json();
    const validation = generateExamSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { topicIds, totalQuestions, durationMinutes, difficultyLevel, questionTypeDistribution } = validation.data;

    // Verify all topics belong to this project
    const topics = await prisma.topic.findMany({
      where: {
        id: { in: topicIds },
        projectId,
      },
      select: { id: true },
    });

    if (topics.length !== topicIds.length) {
      return NextResponse.json(
        { error: 'Some topics not found or do not belong to this project' },
        { status: 400 }
      );
    }

    // Default question type distribution
    const defaultDistribution = {
      multiple_choice: 60,
      short_answer: 30,
      numerical: 10,
    };

    const config = {
      total_questions: totalQuestions,
      duration_minutes: durationMinutes,
      difficulty_level: difficultyLevel,
      question_type_distribution: questionTypeDistribution || defaultDistribution,
    };

    // Create processing job
    const job = await prisma.processingJob.create({
      data: {
        userId: session.user.id,
        projectId,
        jobType: 'generate_exam',
        status: 'pending',
        inputData: {
          projectId,
          topicIds,
          config,
        },
      },
    });

    // Enqueue task to AI service
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';

    try {
      const response = await fetch(`${aiServiceUrl}/api/jobs/generate-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          jobType: 'generate_exam',
          data: {
            projectId,
            topicIds,
            config,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to enqueue exam generation job');
      }
    } catch (error) {
      console.error('Error enqueuing job:', error);

      // Update job status to failed
      await prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorMessage: 'Failed to start exam generation',
          completedAt: new Date(),
        },
      });

      return NextResponse.json(
        { error: 'Failed to start exam generation' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      jobId: job.id,
      status: 'pending',
    });
  } catch (error) {
    console.error('Error in generate-exam:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
