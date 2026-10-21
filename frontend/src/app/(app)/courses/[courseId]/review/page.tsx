import type { Metadata } from 'next'
import { ComingSoon } from '@/features/courses/coming-soon'

export const metadata: Metadata = { title: 'Voice review' }

export default function Page() {
  return <ComingSoon title="Voice review" description="Answer questions out loud and get feedback." />
}
