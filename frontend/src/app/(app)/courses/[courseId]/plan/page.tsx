import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PlanView } from '@/features/plan/plan-view'
import { getPlanData } from '@/server/queries/plan'
import { requireUser } from '@/server/session'
import { getTimeZone } from '@/server/timezone'

export const metadata: Metadata = { title: 'Plan' }

export default async function PlanPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requireUser()
  const { courseId } = await params
  const data = await getPlanData(user.id, courseId, await getTimeZone())
  if (!data) notFound()
  return <PlanView courseId={courseId} plan={data.plan} />
}
