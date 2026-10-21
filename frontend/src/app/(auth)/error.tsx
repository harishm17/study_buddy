'use client'

import { ErrorPanel } from '@/components/shell/error-panel'

export default function AuthError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel {...props} className="px-0" />
}
