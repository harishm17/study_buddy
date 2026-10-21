'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { DotsThree, Files, Gear, ListBullets, Sparkle } from '@phosphor-icons/react/dist/ssr'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IconButton } from '@/components/ui/icon-button'
import { PrepareAllDialog } from './prepare-all'

/**
 * The overflow menu on the course overview. "Prepare all topics now" is the only place that
 * writes content for the whole course; it is left out when every topic is already written.
 */
export function CourseMenu({ courseId, topicsToPrepare = 0 }: { courseId: string; topicsToPrepare?: number }) {
  const router = useRouter()
  const [preparing, setPreparing] = React.useState(false)
  const base = `/courses/${courseId}`
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton label="More course actions" icon={<DotsThree weight="bold" />} variant="secondary" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem icon={<Files />} onSelect={() => router.push(`${base}/materials`)}>
            Add materials
          </DropdownMenuItem>
          <DropdownMenuItem icon={<ListBullets />} onSelect={() => router.push(`${base}/topics?edit=1`)}>
            Edit topics
          </DropdownMenuItem>
          {topicsToPrepare > 0 ? (
            <DropdownMenuItem icon={<Sparkle />} onSelect={() => setPreparing(true)}>
              Prepare all topics now
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem icon={<Gear />} onSelect={() => router.push(`${base}/settings`)}>
            Course settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PrepareAllDialog
        courseId={courseId}
        topicCount={topicsToPrepare}
        open={preparing}
        onOpenChange={setPreparing}
      />
    </>
  )
}
