import { notFound, redirect } from 'next/navigation'
import { ExamTakerLazy } from '@/features/exams/exam-taker-lazy'
import { getTakeState } from '@/server/queries/mock-exams'
import { requireUser } from '@/server/session'

export const metadata = { title: 'Taking a mock exam' }

export default async function TakeExamPage({
  params,
}: {
  params: Promise<{ courseId: string; examId: string }>
}) {
  const user = await requireUser()
  const { courseId, examId } = await params
  const state = await getTakeState(user.id, courseId, examId)

  if (state.kind === 'missing') notFound()
  // No attempt is running: the lobby is where one starts.
  if (state.kind === 'none') redirect(`/courses/${courseId}/exams/${examId}`)
  // The deadline passed while the student was away; it was submitted as saved.
  if (state.kind === 'finalized') redirect(`/courses/${courseId}/exams/${examId}/results/${state.submissionId}`)

  return (
    <ExamTakerLazy
      courseId={courseId}
      examId={examId}
      title={state.exam.title}
      questions={state.exam.questions}
      attempt={state.attempt}
    />
  )
}
