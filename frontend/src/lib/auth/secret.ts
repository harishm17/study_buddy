const DEV_FALLBACK_SECRET = 'margins-dev-insecure-secret'

/**
 * The secret that signs session cookies.
 *
 * In production it must come from NEXTAUTH_SECRET (or AUTH_SECRET); there is no fallback,
 * because a secret that is in the source code lets anyone forge a session. Development
 * and tests get a fixed one. `next build` also gets it: the build only compiles pages and
 * never signs anything, and the real check runs when the server starts.
 */
export function resolveAuthSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.NEXTAUTH_SECRET || env.AUTH_SECRET
  if (secret) return secret

  const building = env.NEXT_PHASE === 'phase-production-build'
  if (env.NODE_ENV === 'production' && !building) {
    throw new Error(
      'NEXTAUTH_SECRET is not set. Set it to a long random string (for example `openssl rand -base64 32`) before starting in production.'
    )
  }
  return DEV_FALLBACK_SECRET
}
