import type { Crumb } from '@/components/shell/slots'

/** Breadcrumbs for the exam pages, with the exam's real name (the URL alone cannot give it). */
export function examCrumbs(
  course: { id: string; name: string },
  exam: { id: string; name: string },
  tail?: string
): Crumb[] {
  const base = '/courses/' + course.id
  return [
    { label: course.name, href: base },
    { label: 'Mock exams', href: base + '/exams' },
    tail ? { label: exam.name, href: base + '/exams/' + exam.id } : { label: exam.name },
    ...(tail ? [{ label: tail }] : []),
  ]
}
