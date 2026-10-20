/** The browser's IANA time zone, for example "America/Chicago". Falls back to UTC. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** URL of the study plan for a project, planned on the student's own clock. */
export function studyPlanUrl(projectId: string, date?: string): string {
  const params = new URLSearchParams({ tz: browserTimeZone() })
  if (date) params.set('date', date)
  return `/api/projects/${projectId}/study-plan?${params.toString()}`
}
