import { notFound } from 'next/navigation'
import { getExamBasics } from '@/server/queries/exams'
import { requireUser } from '@/server/session'

/** The exam must exist before the focus shell and its loading screen are sent, so a bad address is a real 404. */
export default async function TakeLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ courseId: string; examId: string }>
}) {
  const user = await requireUser()
  const { courseId, examId } = await params
  if (!(await getExamBasics(user.id, courseId, examId))) notFound()
  return children
}
