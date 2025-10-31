import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const submitExamSchema = z.object({
  answers: z.record(z.any()), // Map of questionIndex -> answer
});

export async function POST(
  req: NextRequest,
  { params }: { params: { examId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { examId } = params;

    // Verify exam exists and user has access
    const exam = await prisma.sampleExam.findFirst({
      where: {
        id: examId,
        project: {
          userId: session.user.id,
        },
      },
      select: {
        id: true,
        questions: true,
        projectId: true,
      },
    });

    if (!exam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
    }

    const body = await req.json();
    const validation = submitExamSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { answers } = validation.data;

    // Create exam submission
    const submission = await prisma.examSubmission.create({
      data: {
        sampleExamId: examId,
        userId: session.user.id,
        answers,
      },
    });

    // Create processing job for AI grading
    const job = await prisma.processingJob.create({
      data: {
        userId: session.user.id,
        projectId: exam.projectId,
        jobType: 'grade_exam',
        status: 'pending',
        inputData: {
          submissionId: submission.id,
          examId,
          answers,
          questions: exam.questions,
        },
      },
    });

    // Enqueue grading task to AI service
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';

    try {
      const response = await fetch(`${aiServiceUrl}/api/jobs/grade-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          jobType: 'grade_exam',
          data: {
            submissionId: submission.id,
            examId,
            answers,
            questions: exam.questions,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to enqueue grading job');
      }
    } catch (error) {
      console.error('Error enqueuing grading job:', error);

      // Update job status to failed
      await prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorMessage: 'Failed to start exam grading',
          completedAt: new Date(),
        },
      });

      return NextResponse.json(
        { error: 'Failed to start exam grading' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      submissionId: submission.id,
      jobId: job.id,
      status: 'pending',
    });
  } catch (error) {
    console.error('Error submitting exam:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
