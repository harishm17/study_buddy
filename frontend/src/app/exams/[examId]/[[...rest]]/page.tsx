import { notFound, redirect } from 'next/navigation'
import { loginUrl } from '@/lib/safe-redirect'
import { findExamCourse } from '@/server/queries/exams'
import { getSessionUser } from '@/server/session'

/**
 * Old exam URLs (/exams/:examId and /exams/:examId/results/:submissionId) had no course in
 * them. Look the course up and send the visitor to the new address.
 */
export default async function LegacyExamRedirect({
  params,
}: {
  params: Promise<{ examId: string; rest?: string[] }>
}) {
  const { examId, rest = [] } = await params
  const user = await getSessionUser()
  const suffix = rest.length ? '/' + rest.map(encodeURIComponent).join('/') : ''
  if (!user) redirect(loginUrl(`/exams/${encodeURIComponent(examId)}${suffix}`))

  const courseId = await findExamCourse(user.id, examId)
  if (!courseId) notFound()
  redirect(`/courses/${courseId}/exams/${encodeURIComponent(examId)}${suffix}`)
}
