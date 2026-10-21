'use client'

import { ErrorPanel } from '@/components/shell/error-panel'

export default function TakeError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel {...props} />
}
