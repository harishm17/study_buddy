import type { Metadata } from 'next'
import { ComingSoon } from '@/features/courses/coming-soon'

export const metadata: Metadata = { title: 'Materials' }

export default function Page() {
  return <ComingSoon title="Materials" description="Lecture notes, past exams and book chapters for this course." />
}
