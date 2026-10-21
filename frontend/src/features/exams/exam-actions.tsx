'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowClockwise } from '@phosphor-icons/react/dist/ssr'
import { Button, type ButtonProps } from '@/components/ui/button'
import { toast } from '@/components/ui/toaster'
import { apiFetch, isApiError } from '@/lib/api/client'
import { formatClock } from '@/lib/format'

/** Whole seconds left, counted down in the browser from the server's figure. */
function useCountdown(initialSeconds: number | null): number | null {
  const [elapsed, setElapsed] = React.useState(0)
  React.useEffect(() => {
    if (initialSeconds === null) return
    const startedAt = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [initialSeconds])
  return initialSeconds === null ? null : Math.max(0, initialSeconds - elapsed)
}

type StartProps = Pick<ButtonProps, 'variant' | 'size'> & {
  courseId: string
  examId: string
  /** Seconds left on an attempt in progress: the button resumes it and counts down. */
  resumeSeconds?: number | null
  label?: string
}

/** Starts the attempt (or finds the one in progress) and opens the exam. */
export function StartExamButton({ courseId, examId, resumeSeconds = null, label, variant = 'primary', size = 'lg' }: StartProps) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const left = useCountdown(resumeSeconds)

  async function start() {
    setBusy(true)
    try {
      await apiFetch(`/api/exams/${examId}/attempt`, { method: 'POST' })
      router.push(`/courses/${courseId}/exams/${examId}/take`)
    } catch (error) {
      toast.error(isApiError(error) ? error.message : "Couldn't start the exam. Try again.")
      setBusy(false)
    }
  }

  const resuming = left !== null
  const text = resuming
    ? left > 0
      ? `Resume, ${formatClock(left)} left`
      : 'Resume'
    : (label ?? 'Start exam')

  return (
    <Button variant={variant} size={size} loading={busy} onClick={start} className="tabular">
      {text}
    </Button>
  )
}

/** Grading did not finish: start it again and watch it on the results page. */
export function GradeAgainButton({
  courseId,
  examId,
  submissionId,
  size = 'sm',
  navigate = true,
}: {
  courseId: string
  examId: string
  submissionId: string
  size?: ButtonProps['size']
  /** Go to the results page afterwards. The results page itself stays put and refreshes. */
  navigate?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)

  async function regrade() {
    setBusy(true)
    try {
      await apiFetch(`/api/exams/${examId}/submissions/${submissionId}/regrade`, { method: 'POST' })
      if (navigate) router.push(`/courses/${courseId}/exams/${examId}/results/${submissionId}`)
      else router.refresh()
    } catch (error) {
      toast.error(isApiError(error) ? error.message : "Couldn't start grading. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="secondary" size={size} icon={<ArrowClockwise />} loading={busy} onClick={regrade}>
      Grade again
    </Button>
  )
}
