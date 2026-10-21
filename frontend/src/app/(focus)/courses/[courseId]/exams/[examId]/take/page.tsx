import { notFound } from 'next/navigation'
import { FocusHeader } from '@/components/shell/slots'
import { ComingSoon } from '@/features/courses/coming-soon'
import { getExamBasics } from '@/server/queries/exams'
import { requireUser } from '@/server/session'

export const metadata = { title: 'Taking a mock exam' }

export default async function TakeExamPage({
  params,
}: {
  params: Promise<{ courseId: string; examId: string }>
}) {
  const user = await requireUser()
  const { courseId, examId } = await params
  const exam = await getExamBasics(user.id, courseId, examId)
  if (!exam) notFound()
  return (
    <>
      <FocusHeader title={exam.name} />
      <ComingSoon title={exam.name} description="The exam taker is part of the next build." />
    </>
  )
}
