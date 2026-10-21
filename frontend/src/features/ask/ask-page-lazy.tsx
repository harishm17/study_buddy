'use client'

import dynamic from 'next/dynamic'
import { AskPageSkeleton } from './ask-skeleton'

/** The chat client is its own chunk; the page shell and the thread list data arrive first. */
export const AskPageLazy = dynamic(() => import('./ask-page'), {
  loading: () => <AskPageSkeleton />,
})
