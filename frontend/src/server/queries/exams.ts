import { cache } from 'react'
import { prisma } from '@/lib/db/prisma'

export type ExamBasics = { id: string; name: string; courseId: string; createdAt: string }

/** An exam of one of the user's courses, or null. For breadcrumbs and guards. */
export const getExamBasics = cache(
  async (userId: string, courseId: string, examId: string): Promise<ExamBasics | null> => {
    const exam = await prisma.sampleExam.findFirst({
      where: { id: examId, projectId: courseId, project: { userId } },
      select: { id: true, name: true, projectId: true, createdAt: true },
    })
    return exam
      ? { id: exam.id, name: exam.name, courseId: exam.projectId, createdAt: exam.createdAt.toISOString() }
      : null
  }
)

/** The course an exam belongs to, for the old /exams/:id URLs. */
export async function findExamCourse(userId: string, examId: string): Promise<string | null> {
  const exam = await prisma.sampleExam.findFirst({
    where: { id: examId, project: { userId } },
    select: { projectId: true },
  })
  return exam?.projectId ?? null
}
