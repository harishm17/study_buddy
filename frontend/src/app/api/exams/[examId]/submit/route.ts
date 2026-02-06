import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { createHash } from 'crypto';
import { stableStringify } from '@/lib/utils/stable-json';
import {
  apiError,
  ApiErrorCode,
  apiInternal,
  zodDetails,
} from '@/lib/api/errors';
import { ensureAiGenerationReady } from '@/lib/api/ai-preflight';

const submitExamSchema = z.object({
  answers: z.record(
    z.union([z.string(), z.number(), z.boolean(), z.null()])
  ), // Map of questionIndex -> answer
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { examId } = await params;

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

    const preflightError = await ensureAiGenerationReady();
    if (preflightError) {
      return preflightError;
    }

    const body = await req.json();
    const validation = submitExamSchema.safeParse(body);

    if (!validation.success) {
      return apiError(
        ApiErrorCode.INVALID_INPUT,
        'Invalid input',
        zodDetails(validation.error),
        400
      );
    }

    const { answers } = validation.data;
    const questionsPayload = Array.isArray(exam.questions) ? exam.questions : [];
    const answersFingerprint = createHash('sha256')
      .update(stableStringify(answers))
      .digest('hex');
    const idempotencyKey = `${examId}:${answersFingerprint}`;

    const existingJob = await prisma.processingJob.findFirst({
      where: {
        userId: session.user.id,
        projectId: exam.projectId,
        jobType: 'grade_exam',
        status: { in: ['pending', 'processing'] },
        inputData: {
          path: ['idempotencyKey'],
          equals: idempotencyKey,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingJob) {
      return NextResponse.json({
        submissionId: existingJob.inputData && typeof existingJob.inputData === 'object'
          ? (existingJob.inputData as { submissionId?: string }).submissionId
          : null,
        jobId: existingJob.id,
        status: existingJob.status === 'processing' ? 'processing' : 'queued',
        message: 'Exam grading already in progress',
        estimatedSeconds: 90,
      });
    }

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
        stage: 'grading',
        inputData: {
          submissionId: submission.id,
          examId,
          answers,
          questions: questionsPayload,
          idempotencyKey,
        },
      },
    });

    // Enqueue grading task via Cloud Tasks (or direct call in dev)
    try {
      const { enqueueExamGradingJob } = await import('@/lib/tasks/cloud-tasks');
      await enqueueExamGradingJob(
        job.id,
        submission.id,
        examId,
        questionsPayload as Record<string, unknown>[],
        answers
      );
    } catch (error) {
      console.error('Error enqueuing grading job:', error);
      const retryable = typeof (error as { retryable?: unknown })?.retryable === 'boolean'
        ? Boolean((error as { retryable: boolean }).retryable)
        : true

      // Update job status to failed
      await prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorCode: retryable ? 'ENQUEUE_FAILED' : 'ENQUEUE_PERMANENT',
          errorMessage: 'Failed to start exam grading',
          retryable,
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
      status: 'queued',
      message: 'Exam submitted and grading started',
      estimatedSeconds: 90,
    });
  } catch (error) {
    console.error('Error submitting exam:', error);
    return apiInternal('Internal server error');
  }
}
