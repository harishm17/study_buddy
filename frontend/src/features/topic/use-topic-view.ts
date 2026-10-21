'use client'

import { useSearchParams } from 'next/navigation'
import { isViewId, type ViewId } from './types'

/** The view named by ?view=. The page redirects to a valid one, so the fallback is rarely seen. */
export function useTopicView(): ViewId {
  const value = useSearchParams().get('view')
  return isViewId(value) ? value : 'notes'
}
