'use client'

import dynamic from 'next/dynamic'
import type { MaterialsChatProps } from './materials-chat-panel'

// The chat panel pulls in the markdown pipeline and the stream handling. It loads only when
// the "Ask" tab opens, so the rest of the project page stays as light as it was.
const MaterialsChatPanel = dynamic(() => import('./materials-chat-panel'), {
  ssr: false,
  loading: () => (
    <div
      className="h-80 animate-pulse rounded-2xl bg-muted/60"
      role="status"
      aria-label="Loading the chat"
    />
  ),
})

export default function MaterialsChat(props: MaterialsChatProps) {
  return <MaterialsChatPanel {...props} />
}
