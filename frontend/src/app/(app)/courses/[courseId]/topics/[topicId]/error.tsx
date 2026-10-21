'use client'

import { ErrorPanel } from '@/components/shell/error-panel'

export default function TopicError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel {...props} title="This topic couldn't load" />
}
