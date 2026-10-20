/**
 * Runs once when the server starts. Fails fast in production if NEXTAUTH_SECRET is missing,
 * instead of waiting for the first request that touches auth.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { resolveAuthSecret } = await import('./lib/auth/secret')
    resolveAuthSecret()
  }
}
