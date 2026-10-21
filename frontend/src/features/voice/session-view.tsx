'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Keyboard,
  Lightbulb,
  Microphone,
  MicrophoneSlash,
  PaperPlaneRight,
  SkipForward,
  SpeakerHigh,
  SpeakerSlash,
} from '@phosphor-icons/react/dist/ssr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { InlineAlert } from '@/components/ui/inline-alert'
import { Input } from '@/components/ui/input'
import type { VoiceAlert } from './errors'
import type { MicNotice, OrbState, SessionState } from './session-state'
import { Transcript } from './transcript'
import type { VoiceController } from './voice-controller'
import { VoiceOrb } from './voice-orb'

type SessionViewProps = {
  state: SessionState
  orb: OrbState
  controller: VoiceController
  /** The topic's name, or null for a sprint. */
  title: string
  /** Quiz style: Hint and Skip make sense. */
  hasQuestions: boolean
  recognitionSupported: boolean
}

const MIC_NOTICES: Record<MicNotice, { tone: 'neutral' | 'warning'; title?: string; text: string; retry: boolean }> = {
  unsupported: { tone: 'neutral', text: "Voice input isn't supported in this browser. You can type your answers.", retry: false },
  language: {
    tone: 'warning',
    text: "Voice input isn't available for this language in your browser. You can type your answers.",
    retry: false,
  },
  denied: {
    tone: 'warning',
    title: 'Microphone access is blocked',
    text: 'Allow the microphone in your browser settings, or keep typing your answers.',
    retry: true,
  },
  'no-mic': { tone: 'warning', title: "We couldn't find a microphone", text: 'Plug one in, or type your answers.', retry: true },
  network: { tone: 'warning', title: 'Voice input lost its connection', text: 'You can type your answers.', retry: true },
  unstable: { tone: 'warning', title: 'Voice input keeps stopping', text: 'You can type your answers.', retry: true },
}

export function SessionView({ state, orb, controller, title, hasQuestions, recognitionSupported }: SessionViewProps) {
  const { question, entries, interim, inputMode, micPaused, speech, turnActive, alert, micNotice } = state
  const [draft, setDraft] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const textMode = inputMode === 'text'

  React.useEffect(() => {
    if (textMode) inputRef.current?.focus()
  }, [textMode])

  const send = (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.trim() || turnActive) return
    controller.sendText(draft)
    setDraft('')
  }

  return (
    <section
      aria-label="Voice review session"
      data-testid="voice-session"
      className="max-md:fixed max-md:inset-0 max-md:z-modal max-md:overflow-y-auto max-md:bg-canvas"
    >
      <div className="flex w-full max-w-[720px] flex-col px-4 max-md:min-h-full md:px-0">
        <header className="flex items-center justify-between gap-4 border-b border-border max-md:h-14 max-md:shrink-0 md:border-b-0 md:pb-2">
          <p className="tabular min-w-0 truncate text-small text-fg-2" data-testid="voice-progress">
            {question ? `Question ${question.index} of ${question.total}` : title}
          </p>
          <Button variant="secondary" size="sm" onClick={() => controller.end()}>
            End
          </Button>
        </header>

        <div className="flex flex-1 flex-col gap-6 pb-6 pt-5">
          {question ? (
            <div data-testid="voice-question">
              <h2 className="text-heading text-fg">{question.text}</h2>
              {question.options && question.options.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {question.options.map((option) => (
                    <li key={option.id} className="flex items-baseline gap-2 text-body text-fg-2">
                      <Badge tone="neutral" className="shrink-0 justify-center">
                        {option.id}
                      </Badge>
                      <span>{option.text}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <VoiceOrb state={orb} meter={controller.meter} className="self-center py-2" size={textMode ? 'sm' : 'md'} />

          <div className="flex flex-col gap-3">
            {micNotice ? <MicNoticeView notice={micNotice} onRetry={() => void controller.enableMicrophone()} /> : null}
            {alert ? <TurnAlert alert={alert} onRetry={() => controller.retry()} onDismiss={() => controller.dismissAlert()} /> : null}
          </div>

          <Transcript entries={entries} interim={interim} />

          <div className="flex flex-col gap-3 max-md:sticky max-md:bottom-0 max-md:mt-auto max-md:bg-canvas max-md:pb-[max(1rem,env(safe-area-inset-bottom))] max-md:pt-3">
            {textMode ? (
              <form onSubmit={send} className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Type your answer"
                  aria-label="Your answer"
                  maxLength={2000}
                  autoComplete="off"
                  containerClassName="flex-1"
                />
                <Button type="submit" variant="primary" icon={<PaperPlaneRight />} disabled={!draft.trim() || turnActive}>
                  Send
                </Button>
              </form>
            ) : null}

            <div className="flex flex-wrap items-center justify-center gap-2" data-testid="voice-controls">
              {textMode ? (
                recognitionSupported ? (
                  <Button variant="secondary" icon={<Microphone />} onClick={() => controller.toggleMic()}>
                    Use microphone
                  </Button>
                ) : null
              ) : (
                <>
                  <Button
                    variant={micPaused ? 'primary' : 'secondary'}
                    icon={micPaused ? <MicrophoneSlash /> : <Microphone />}
                    aria-pressed={micPaused}
                    onClick={() => controller.toggleMic()}
                  >
                    {micPaused ? 'Resume mic' : 'Pause mic'}
                  </Button>
                  <Button variant="ghost" icon={<Keyboard />} onClick={() => controller.typeInstead()}>
                    Type instead
                  </Button>
                </>
              )}
              {hasQuestions ? (
                <>
                  <Button variant="ghost" icon={<Lightbulb />} disabled={turnActive} onClick={() => controller.hint()}>
                    Hint
                  </Button>
                  <Button variant="ghost" icon={<SkipForward />} disabled={turnActive} onClick={() => controller.skip()}>
                    Skip
                  </Button>
                </>
              ) : null}
              {speech !== 'unsupported' ? (
                <IconButton
                  variant="ghost"
                  label={speech === 'on' ? 'Mute coach voice' : 'Unmute coach voice'}
                  icon={speech === 'on' ? <SpeakerHigh /> : <SpeakerSlash />}
                  aria-pressed={speech === 'off'}
                  onClick={() => controller.toggleSpeech()}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function MicNoticeView({ notice, onRetry }: { notice: MicNotice; onRetry: () => void }) {
  const copy = MIC_NOTICES[notice]
  return (
    <InlineAlert
      tone={copy.tone}
      title={copy.title}
      data-testid="voice-mic-notice"
      action={
        copy.retry ? (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Try the mic again
          </Button>
        ) : null
      }
    >
      {copy.text}
    </InlineAlert>
  )
}

function TurnAlert({ alert, onRetry, onDismiss }: { alert: VoiceAlert; onRetry: () => void; onDismiss: () => void }) {
  const pathname = usePathname()
  return (
    <InlineAlert
      tone={alert.tone}
      title={alert.title}
      data-testid="voice-alert"
      action={
        alert.action === 'retry' ? (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        ) : alert.action === 'sign-in' ? (
          <Button asChild size="sm" variant="secondary">
            <Link href={`/login?next=${encodeURIComponent(pathname)}`}>Sign in</Link>
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        )
      }
    >
      {alert.text}
    </InlineAlert>
  )
}
