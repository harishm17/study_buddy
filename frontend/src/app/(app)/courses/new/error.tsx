'use client'

import { ErrorPanel } from '@/components/shell/error-panel'

export default function NewCourseError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel {...props} />
}
