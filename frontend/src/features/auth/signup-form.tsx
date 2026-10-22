'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Check, Circle } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { InlineAlert } from '@/components/ui/inline-alert'
import { Input } from '@/components/ui/input'
import { apiFetch, isApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { GoogleButton, OrDivider } from './google-button'
import { PasswordInput } from './password-input'

const MIN_PASSWORD = 8
const AFTER_SIGNUP = '/courses/new?welcome=1'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function SignupForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter()
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [fieldErrors, setFieldErrors] = React.useState<{ email?: string; password?: string }>({})
  const [error, setError] = React.useState<{ message: string; exists?: boolean } | null>(null)
  const emailRef = React.useRef<HTMLInputElement>(null)
  const passwordRef = React.useRef<HTMLInputElement>(null)

  const passwordOk = password.length >= MIN_PASSWORD

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors: typeof fieldErrors = {}
    if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address.'
    if (!passwordOk) errors.password = `Use at least ${MIN_PASSWORD} characters.`
    setFieldErrors(errors)
    setError(null)
    if (errors.email) return emailRef.current?.focus()
    if (errors.password) return passwordRef.current?.focus()

    setPending(true)
    try {
      await apiFetch('/api/auth/signup', {
        method: 'POST',
        json: { email: email.trim(), password, name: name.trim() || null },
      })
    } catch (caught) {
      setPending(false)
      if (isApiError(caught) && caught.status === 409) {
        setError({ message: 'An account with this email already exists.', exists: true })
      } else {
        setError({ message: isApiError(caught) ? caught.message : 'Something went wrong. Try again.' })
      }
      return
    }

    try {
      const result = await signIn('credentials', { email: email.trim(), password, redirect: false })
      if (!result || result.error) throw new Error('sign in failed')
      router.push(AFTER_SIGNUP)
      router.refresh()
    } catch {
      // The account exists; only the automatic sign in failed.
      router.push('/login')
    }
  }

  return (
    <div>
      <h1 className="text-title text-fg">Create your account</h1>
      <p className="mt-1.5 text-body text-fg-2">Free to use, with a daily AI allowance.</p>

      <div className="mt-8 flex flex-col gap-5">
        {googleEnabled ? (
          <>
            <GoogleButton callbackUrl={AFTER_SIGNUP} />
            <OrDivider />
          </>
        ) : null}

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Name" optional>
            <Input
              name="name"
              autoComplete="name"
              autoFocus
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Email" error={fieldErrors.email}>
            <Input
              ref={emailRef}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field
            label="Password"
            error={fieldErrors.password}
            hint={
              <span className={cn('flex items-center gap-1.5', passwordOk && 'text-accent-soft-fg')}>
                {passwordOk ? <Check weight="bold" className="size-3.5 text-accent" /> : <Circle className="size-3.5" />}
                At least {MIN_PASSWORD} characters
              </span>
            }
          >
            <PasswordInput
              ref={passwordRef}
              name="password"
              autoComplete="new-password"
              maxLength={72}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          {error ? (
            <InlineAlert tone="danger">
              {error.message}
              {error.exists ? (
                <>
                  {' '}
                  <Link href="/login" className="font-medium underline underline-offset-2">
                    Sign in instead?
                  </Link>
                </>
              ) : null}
            </InlineAlert>
          ) : null}

          <Button type="submit" variant="primary" size="lg" fullWidth loading={pending}>
            Create account
          </Button>
          <p className="text-caption font-normal text-fg-3">
            By creating an account you agree to the{' '}
            <Link href="/terms" className="underline underline-offset-2 hover:text-fg">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-fg">
              Privacy Policy
            </Link>
            .
          </p>
        </form>

        <p className="text-small text-fg-2">
          Already have an account?{' '}
          <Link href="/login" className="rounded-chip font-medium text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
