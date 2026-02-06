import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { ArrowRight, AudioLines, BrainCircuit, FileCheck2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageShell } from '@/components/ui/page-shell'
import { authOptions } from '@/lib/auth'

const highlights = [
  {
    title: 'Structured Study Flow',
    description: 'Go from raw PDFs to topics, notes, practice, and exams in one guided workflow.',
    icon: FileCheck2,
  },
  {
    title: 'Concept-First Voice Practice',
    description: 'Train oral reasoning with live voice drills, hints, and interruption-safe controls.',
    icon: AudioLines,
  },
  {
    title: 'Learning Signals That Adapt',
    description: 'Quiz, voice, and exam outcomes combine into clear next actions and daily plans.',
    icon: BrainCircuit,
  },
]

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  if (session?.user?.id) {
    redirect('/dashboard')
  }

  return (
    <PageShell className="min-h-screen flex flex-col justify-center py-12">
      <section className="hero-panel">
        <div className="grid gap-8 lg:grid-cols-[1.25fr_0.95fr] lg:items-center">
          <div className="stagger-enter">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary/90">
              <Sparkles className="h-3.5 w-3.5" />
              StudyBuddy
            </div>
            <h1 className="section-title text-4xl md:text-5xl">
              Build exam confidence with a smarter daily study loop.
            </h1>
            <p className="section-subtitle max-w-2xl">
              Upload materials once. StudyBuddy extracts topics, generates focused content, and keeps momentum with next-best actions and voice practice.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/signup">
                  Start for Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/login">Sign In</Link>
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {highlights.map((item, index) => {
              const Icon = item.icon
              return (
                <Card key={item.title} className="stagger-enter" style={{ animationDelay: `${index * 70}ms` }}>
                  <CardContent className="flex items-start gap-3 p-4 md:p-5">
                    <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold">{item.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>
    </PageShell>
  )
}
