'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { InlineAlert } from '@/components/ui/inline-alert'
import { Input } from '@/components/ui/input'
import { GoogleButton, OrDivider } from './google-button'
import { PasswordInput } from './password-input'

type LoginFormProps = {
  googleEnabled: boolean
  /** Where to go after signing in: already checked by safeNextPath. */
  next: string
  /** A message resolved from ?error= on the server. */
  initialError?: string | null
}

export function LoginForm({ googleEnabled, next, initialError }: LoginFormProps) {
  const router = useRouter()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(initialError ?? null)
  const [fieldErrors, setFieldErrors] = React.useState<{ email?: string; password?: string }>({})
  const [pending, setPending] = React.useState(false)
  const emailRef = React.useRef<HTMLInputElement>(null)
  const passwordRef = React.useRef<HTMLInputElement>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors: typeof fieldErrors = {}
    if (!email.trim()) errors.email = 'Enter your email.'
    if (!password) errors.password = 'Enter your password.'
    setFieldErrors(errors)
    setError(null)
    if (errors.email) return emailRef.current?.focus()
    if (errors.password) return passwordRef.current?.focus()

    setPending(true)
    try {
      const result = await signIn('credentials', { email: email.trim(), password, redirect: false })
      if (!result || result.error) {
        setError("That email and password don't match.")
        setPending(false)
        return
      }
      router.push(next)
      router.refresh()
    } catch {
      setError('Something went wrong signing in. Try again.')
      setPending(false)
    }
  }

  return (
    <div>
      <h1 className="text-title text-fg">Welcome back</h1>
      <p className="mt-1.5 text-body text-fg-2">Sign in to continue studying.</p>

      <div className="mt-8 flex flex-col gap-5">
        {googleEnabled ? (
          <>
            <GoogleButton callbackUrl={next} />
            <OrDivider />
          </>
        ) : null}

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Email" error={fieldErrors.email}>
            <Input
              ref={emailRef}
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Password" error={fieldErrors.password}>
            <PasswordInput
              ref={passwordRef}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

          <Button type="submit" variant="primary" size="lg" fullWidth loading={pending}>
            Sign in
          </Button>
        </form>

        <p className="text-small text-fg-2">
          New here?{' '}
          <Link href="/signup" className="rounded-chip font-medium text-accent hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}
