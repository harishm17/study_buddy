import type { Metadata } from 'next'
import { ComingSoon } from '@/features/courses/coming-soon'

export const metadata: Metadata = { title: 'New mock exam' }

export default function Page() {
  return <ComingSoon title="New mock exam" description="Pick topics, set a time limit, and create an exam." />
}
