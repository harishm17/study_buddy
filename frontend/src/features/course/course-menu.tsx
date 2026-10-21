'use client'

import { useRouter } from 'next/navigation'
import { DotsThree, Files, Gear, ListBullets } from '@phosphor-icons/react/dist/ssr'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IconButton } from '@/components/ui/icon-button'

/** The overflow menu on the course overview. */
export function CourseMenu({ courseId }: { courseId: string }) {
  const router = useRouter()
  const base = `/courses/${courseId}`
  return (
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
        <DropdownMenuItem icon={<Gear />} onSelect={() => router.push(`${base}/settings`)}>
          Course settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
