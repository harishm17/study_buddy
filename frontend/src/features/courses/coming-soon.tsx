import * as React from 'react'
import { Hammer } from '@phosphor-icons/react/dist/ssr'
import { Page, PageIntro } from '@/components/shell/page'
import { EmptyState } from '@/components/ui/empty-state'

/** Stands in for a page that is built in the next phase. It sits inside the real shell. */
export function ComingSoon({
  title,
  description,
  icon,
}: {
  title: string
  description?: string
  icon?: React.ReactNode
}) {
  return (
    <Page>
      <PageIntro title={title} description={description} />
      <EmptyState icon={icon ?? <Hammer />} title="Coming in the next build">
        This page is being rebuilt. The rest of the app already works.
      </EmptyState>
    </Page>
  )
}
