import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PlanView } from '@/features/plan/plan-view'
import { getPlanData } from '@/server/queries/plan'
import { requireUser } from '@/server/session'
import { PlanSkeleton } from '@/features/shell/page-skeletons'
import { getTimeZoneState } from '@/server/timezone'

export const metadata: Metadata = { title: 'Plan' }

export default async function PlanPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requireUser()
  const { courseId } = await params
  const { timeZone, known } = await getTimeZoneState()
  // The browser's first request: its time zone is not known, so wait for it rather than draw the wrong days.
  if (!known) return <PlanSkeleton />
  const data = await getPlanData(user.id, courseId, timeZone)
  if (!data) notFound()
  const unitTitles = Object.fromEntries(data.course.units.map((unit) => [unit.id, unit.title]))
  return <PlanView courseId={courseId} plan={data.plan} unitTitles={unitTitles} />
}
