import type { Metadata } from 'next'
import { ComingSoon } from '@/features/courses/coming-soon'

export const metadata: Metadata = { title: 'Mock exams' }

export default function Page() {
  return <ComingSoon title="Mock exams" description="Timed practice exams built from your topics." />
}
