import type { Crumb } from './slots'

type NavLike = { id: string; name: string; topics: { id: string; name: string }[] }

/**
 * Breadcrumbs for a path, from the route table in the design (5.1). Names come from the nav
 * index the app layout already has, so they render on the server with no flash. A page can
 * replace them with <PageHeader crumbs>, for names the index does not know (an exam).
 */
export function buildCrumbs(pathname: string, nav: NavLike[]): Crumb[] {
  const parts = pathname.split('?')[0].split('/').filter(Boolean)
  if (parts.length === 0) return []

  if (parts[0] === 'home') return [{ label: 'Home' }]

  if (parts[0] !== 'courses') return []
  if (parts[1] === 'new') return [{ label: 'Home', href: '/home' }, { label: 'New course' }]

  const courseId = parts[1]
  if (!courseId) return [{ label: 'Home', href: '/home' }]
  const course = nav.find((item) => item.id === courseId)
  const base = `/courses/${courseId}`
  const courseCrumb = (current: boolean): Crumb => ({
    label: course?.name ?? 'Course',
    ...(current ? {} : { href: base }),
  })

  const section = parts[2]
  if (!section) return [courseCrumb(true)]

  switch (section) {
    case 'materials':
      return [courseCrumb(false), { label: 'Materials' }]
    case 'ask':
      return [courseCrumb(false), { label: 'Ask' }]
    case 'plan':
      return [courseCrumb(false), { label: 'Plan' }]
    case 'review':
      return [courseCrumb(false), { label: 'Review' }]
    case 'settings':
      return [courseCrumb(false), { label: 'Settings' }]
    case 'topics': {
      const topicId = parts[3]
      if (!topicId) return [courseCrumb(false), { label: 'Topics' }]
      const topic = course?.topics.find((item) => item.id === topicId)
      return [courseCrumb(false), { label: 'Topics', href: `${base}/topics` }, { label: topic?.name ?? 'Topic' }]
    }
    case 'exams': {
      const examsCrumb = (current: boolean): Crumb => ({ label: 'Mock exams', ...(current ? {} : { href: `${base}/exams` }) })
      const examId = parts[3]
      if (!examId) return [courseCrumb(false), examsCrumb(true)]
      if (examId === 'new') return [courseCrumb(false), examsCrumb(false), { label: 'New mock exam' }]
      const examCrumb = (current: boolean): Crumb => ({ label: 'Exam', ...(current ? {} : { href: `${base}/exams/${examId}` }) })
      if (!parts[4]) return [courseCrumb(false), examsCrumb(false), examCrumb(true)]
      if (parts[4] === 'take') return [courseCrumb(false), examsCrumb(false), examCrumb(false), { label: 'Taking' }]
      if (parts[4] === 'results') return [courseCrumb(false), examsCrumb(false), examCrumb(false), { label: 'Results' }]
      return [courseCrumb(false), examsCrumb(true)]
    }
    default:
      return [courseCrumb(true)]
  }
}
