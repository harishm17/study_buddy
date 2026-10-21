'use client'

import * as React from 'react'
import Link from 'next/link'
import { getSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { BRAND_NAME } from '@/config/brand'

/**
 * Whether the visitor is signed in, read in the browser so public pages stay fully static.
 * Null until known; the pages render their signed-out buttons first.
 */
function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = React.useState<boolean | null>(null)
  React.useEffect(() => {
    let cancelled = false
    getSession()
      .then((session) => {
        if (!cancelled) setSignedIn(!!session?.user)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return signedIn
}

/** The nav buttons: Sign in and Get started, or Open Margins when signed in. */
export function NavActions() {
  const signedIn = useSignedIn()
  return signedIn ? (
    <Button asChild variant="primary">
      <Link href="/home">Open {BRAND_NAME}</Link>
    </Button>
  ) : (
    <>
      <Button asChild variant="ghost">
        <Link href="/login">Sign in</Link>
      </Button>
      <Button asChild variant="primary">
        <Link href="/signup">Get started</Link>
      </Button>
    </>
  )
}

/** The hero buttons (large). */
export function HeroActions() {
  const signedIn = useSignedIn()
  return (
    <div className="mt-8 flex gap-3">
      {signedIn ? (
        <Button asChild variant="primary" size="lg">
          <Link href="/home">Open {BRAND_NAME}</Link>
        </Button>
      ) : (
        <>
          <Button asChild variant="primary" size="lg">
            <Link href="/signup">Get started</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/login">Sign in</Link>
          </Button>
        </>
      )}
    </div>
  )
}
