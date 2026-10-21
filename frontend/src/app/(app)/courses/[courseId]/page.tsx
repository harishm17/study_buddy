import { notFound } from 'next/navigation'
import { ComingSoon } from '@/features/courses/coming-soon'
import { getCourseShell } from '@/server/queries/courses'
import { requireUser } from '@/server/session'

export async function generateMetadata({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requireUser()
  const course = await getCourseShell(user.id, (await params).courseId)
  return { title: course?.name ?? 'Course' }
}

export default async function CourseOverviewPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requireUser()
  const course = await getCourseShell(user.id, (await params).courseId)
  if (!course) notFound()
  return <ComingSoon title={course.name} description={course.description ?? undefined} />
}
