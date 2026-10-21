export type CourseActivity = { courseId: string; at: Date | null | undefined }

/**
 * The course with the most recent study activity: the latest of the times given (topic last
 * opened, quiz taken, learning signal). Null when there is none, so the caller can fall back
 * to the most recently updated course.
 */
export function mostRecentActivity(activity: CourseActivity[]): string | null {
  let best: { courseId: string; time: number } | null = null
  for (const item of activity) {
    if (!item.at) continue
    const time = item.at.getTime()
    if (Number.isNaN(time)) continue
    if (!best || time > best.time) best = { courseId: item.courseId, time }
  }
  return best?.courseId ?? null
}
