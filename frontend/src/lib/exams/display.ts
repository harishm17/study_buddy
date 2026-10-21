import { formatDate } from '@/lib/format'

const GENERATED_NAME = /^Sample Exam - \d{4}-\d{2}-\d{2}$/

/** "Sample exam, Oct 20" for generated names (dated by when the exam was made); a custom name is kept as it is. */
export function examTitle(name: string, createdAt: string | Date): string {
  return GENERATED_NAME.test(name) ? `Sample exam, ${formatDate(createdAt)}` : name
}
