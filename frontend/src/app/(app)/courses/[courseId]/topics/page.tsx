import type { Metadata } from 'next'
import { ComingSoon } from '@/features/courses/coming-soon'

export const metadata: Metadata = { title: 'Topics' }

export default function Page() {
  return <ComingSoon title="Topics" description="Everything this course covers." />
}
