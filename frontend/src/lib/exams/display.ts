import { formatDate } from '@/lib/format'

/** The AI service names an exam "Sample Exam - 2026-10-20" (older exams) or "Mock exam - 2026-10-20". */
const GENERATED_NAME = /^(?:Sample|Mock) [Ee]xam - \d{4}-\d{2}-\d{2}$/

/** "Mock exam, Oct 20" for generated names (dated by when the exam was made); a custom name is kept as it is. */
export function examTitle(name: string, createdAt: string | Date): string {
  return GENERATED_NAME.test(name) ? `Mock exam, ${formatDate(createdAt)}` : name
}

type TitledExam = { id: string; name: string; createdAt: string | Date }

/**
 * Titles for all the exams of one course, with no two alike. Generated names carry only a date, so
 * two exams made on the same day would both read "Mock exam, Oct 21": the second and later ones
 * (by creation time) get " (2)", " (3)". A custom name is kept as the student wrote it.
 */
export function examTitles(exams: readonly TitledExam[]): Map<string, string> {
  const ordered = [...exams].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  const seen = new Map<string, number>()
  const titles = new Map<string, string>()
  for (const exam of ordered) {
    const base = examTitle(exam.name, exam.createdAt)
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    titles.set(exam.id, count === 1 ? base : `${base} (${count})`)
  }
  return titles
}
