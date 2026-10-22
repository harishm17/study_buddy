import { formatDate } from '@/lib/format'

/** The AI service names an exam "Sample Exam - 2026-10-20" (older exams) or "Mock exam - 2026-10-20". */
const GENERATED_NAME = /^(?:Sample|Mock) [Ee]xam - \d{4}-\d{2}-\d{2}$/

/** "Mock exam, Oct 20" for generated names (dated by when the exam was made); a custom name is kept as it is. */
export function examTitle(name: string, createdAt: string | Date): string {
  return GENERATED_NAME.test(name) ? `Mock exam, ${formatDate(createdAt)}` : name
}
