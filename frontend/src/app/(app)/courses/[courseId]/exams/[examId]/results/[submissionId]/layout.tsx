import { notFound } from 'next/navigation'
import { getSubmissionBasics } from '@/server/queries/exams'
import { requireUser } from '@/server/session'

/** A results page: the attempt must be a submitted one of this exam, otherwise it is a real 404. */
export default async function ResultsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ courseId: string; examId: string; submissionId: string }>
}) {
  const user = await requireUser()
  const { courseId, examId, submissionId } = await params
  if (!(await getSubmissionBasics(user.id, courseId, examId, submissionId))) notFound()
  return children
}
