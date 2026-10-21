/**
 * A `next` value from the query string is only followed when it is a path on this site:
 * it must start with one slash. "//evil.com", a slash followed by a backslash and absolute
 * URLs fall back.
 */
export function safeNextPath(value: unknown, fallback = '/home'): string {
  if (typeof value !== 'string') return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  if (/[\u0000-\u001f]/.test(value)) return fallback
  // Never bounce between the auth pages.
  if (/^\/(login|signup)(\/|\?|$)/.test(value)) return fallback
  return value
}

export function loginUrl(next?: string | null): string {
  return next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login'
}
