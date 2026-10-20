/**
 * Decides what a Google sign-in may do, given what Google reports and what we have stored.
 *
 * Google must say the address is verified (`email_verified === true`) before the login can
 * create an account or attach to an existing one by email. Without that, anyone who can
 * register a Google account under someone else's address could take over their StudyBuddy
 * account.
 */
export type GoogleSignInDecision =
  | { action: 'refuse'; error: 'GoogleEmailNotVerified' | 'GoogleAccountMismatch' }
  | { action: 'create' }
  | { action: 'link' }
  | { action: 'allow' }

export function decideGoogleSignIn(input: {
  emailVerified: unknown
  providerAccountId: string
  existing: { oauthProvider: string | null; oauthId: string | null } | null
}): GoogleSignInDecision {
  if (input.emailVerified !== true) {
    return { action: 'refuse', error: 'GoogleEmailNotVerified' }
  }
  const { existing } = input
  if (!existing) return { action: 'create' }
  // A password account that has never been linked to an OAuth login.
  if (!existing.oauthProvider) return { action: 'link' }
  // Already linked: only the same Google account may sign in to it.
  if (existing.oauthProvider === 'google' && existing.oauthId === input.providerAccountId) {
    return { action: 'allow' }
  }
  return { action: 'refuse', error: 'GoogleAccountMismatch' }
}

export const GOOGLE_SIGN_IN_ERRORS: Record<string, string> = {
  GoogleEmailNotVerified:
    'Google has not verified this email address, so it cannot be used to sign in. Verify it in your Google account, or sign in with your password.',
  GoogleAccountMismatch:
    'This email is already connected to a different Google account. Sign in with the account you used before, or with your password.',
}
