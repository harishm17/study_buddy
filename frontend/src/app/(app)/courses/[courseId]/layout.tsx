import { notFound } from 'next/navigation'
import { getCourseShell } from '@/server/queries/courses'
import { requireUser } from '@/server/session'

/** Every course page: the course must be the signed-in user's, otherwise it is a 404. */
export default async function CourseLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ courseId: string }>
}) {
  const user = await requireUser()
  const { courseId } = await params
  const course = await getCourseShell(user.id, courseId)
  if (!course) notFound()
  return children
}
