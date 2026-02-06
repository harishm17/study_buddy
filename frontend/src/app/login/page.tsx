'use client'

import { useEffect, useState } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Sparkles, ShieldCheck, Speech } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const { status } = useSession()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard')
    }
  }, [status, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      })

      if (result?.error) {
        setError('Invalid email or password')
        return
      }

      // Redirect to dashboard on success
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-shell min-h-screen flex items-center justify-center py-10">
      <div className="grid w-full max-w-5xl gap-5 lg:grid-cols-[1.05fr_1fr]">
        <Card className="hidden overflow-hidden lg:block">
          <CardContent className="relative h-full p-8">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Welcome Back
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Pick up exactly where you left off.</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              StudyBuddy keeps your projects, attempts, and next actions organized so every study session starts with clear momentum.
            </p>
            <div className="mt-8 space-y-3">
              <div className="rounded-xl border border-border/70 bg-white/70 p-3 text-sm">
                <div className="mb-1 flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-primary" /> Secure account access</div>
                <p className="text-muted-foreground">Credential login with protected sessions.</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-white/70 p-3 text-sm">
                <div className="mb-1 flex items-center gap-2 font-medium"><Speech className="h-4 w-4 text-primary" /> Voice drills ready</div>
                <p className="text-muted-foreground">Resume conceptual speaking practice instantly.</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="w-full">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">Sign in</CardTitle>
            <CardDescription>
              Access your StudyBuddy workspace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required
                  disabled={loading}
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading} size="lg">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-sm text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="font-semibold text-primary hover:underline">
                Sign up
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
