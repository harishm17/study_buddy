'use client'

import { ErrorPanel } from '@/components/shell/error-panel'

export default function HomeError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel {...props} title="Home could not load" />
}
