import type { Metadata } from 'next'
import { ComingSoon } from '@/features/courses/coming-soon'

export const metadata: Metadata = { title: 'Ask' }

export default function Page() {
  return <ComingSoon title="Ask your materials" description="Answers come only from your files, with sources." />
}
