import type { Page } from '@playwright/test'

/**
 * Stubs for the browser speech APIs, so the voice-mode state machine can run in headless
 * Chromium (which has no microphone, no voices and a recognizer that cannot reach a service).
 *
 * `installVoiceStubs(page, options)` must run before the page loads. It defines, as options say:
 *   - window.webkitSpeechRecognition: a fake that never listens by itself; the test drives it
 *   - window.speechSynthesis: a fake that "speaks" for `speechMs` per sentence
 *   - navigator.mediaDevices.getUserMedia: an oscillator stream, so the mic meter has a signal
 * and always exposes `window.__voice`, the control surface used from the tests:
 *   __voice.interim(text)   the recognizer reports words it is still working on
 *   __voice.final(text)     the recognizer finalises one more segment of the utterance
 *   __voice.end()           the recognizer stops (Chrome does this after silence)
 *   __voice.fail(code)      the recognizer raises an error ('not-allowed', 'network', ...)
 *   __voice.spoken          every sentence the coach "said", in order
 *   __voice.hold = true     keep the current sentence "playing" until __voice.release()
 *   __voice.cancelled       how many times speechSynthesis.cancel() ran
 *   __voice.starts          how many times the recognizer was started
 */
export type VoiceStubOptions = {
  /** Define SpeechRecognition (default true). With false the page sees an unsupported browser. */
  recognition?: boolean
  /** Define speechSynthesis (default true). */
  synthesis?: boolean
  /** getUserMedia rejects with NotAllowedError. */
  micDenied?: boolean
  /** How long one sentence "plays", in ms (default 400). */
  speechMs?: number
}

const script = (options: Required<VoiceStubOptions>) => `
(() => {
  const options = ${JSON.stringify(options)}
  const voice = {
    spoken: [], cancelled: 0, starts: 0, hold: false, speakingNow: false,
    recognizers: [], segments: [], pendingEnd: null,
    pushResult(text, isFinal) {
      const rec = this.recognizers[this.recognizers.length - 1]
      if (!rec || !rec.active) return false
      if (isFinal) {
        const last = this.segments[this.segments.length - 1]
        if (last && !last.isFinal) this.segments.pop()
        this.segments.push({ 0: { transcript: text, confidence: 0.9 }, length: 1, isFinal: true })
      } else {
        const last = this.segments[this.segments.length - 1]
        if (last && !last.isFinal) this.segments.pop()
        this.segments.push({ 0: { transcript: text, confidence: 0.5 }, length: 1, isFinal: false })
      }
      const results = Object.assign([...this.segments], { length: this.segments.length })
      rec.onresult && rec.onresult({ resultIndex: 0, results })
      return true
    },
    interim(text) { return this.pushResult(text, false) },
    final(text) { return this.pushResult(text, true) },
    end() { const rec = this.recognizers[this.recognizers.length - 1]; if (rec) rec.fireEnd() },
    fail(code) { const rec = this.recognizers[this.recognizers.length - 1]; if (rec && rec.onerror) rec.onerror({ error: code }) },
    release() { if (this.pendingEnd) { const end = this.pendingEnd; this.pendingEnd = null; end() } },
    level: 0.5,
  }
  window.__voice = voice

  if (options.recognition) {
    class FakeRecognition {
      constructor() { this.continuous = false; this.interimResults = false; this.lang = ''; this.maxAlternatives = 1; this.active = false; voice.recognizers.push(this) }
      start() {
        if (this.active) throw new DOMException('already started', 'InvalidStateError')
        this.active = true; voice.starts += 1; voice.segments = []
        setTimeout(() => this.onstart && this.onstart(), 0)
      }
      fireEnd() { if (!this.active) return; this.active = false; voice.segments = []; this.onend && this.onend() }
      stop() { setTimeout(() => this.fireEnd(), 0) }
      abort() { this.active = false; voice.segments = [] }
    }
    window.SpeechRecognition = FakeRecognition
    window.webkitSpeechRecognition = FakeRecognition
  } else {
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true })
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true })
  }

  if (options.synthesis) {
    class FakeUtterance {
      constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.voice = null; this.onstart = null; this.onend = null; this.onerror = null }
    }
    window.SpeechSynthesisUtterance = FakeUtterance
    let current = null
    const finish = (utterance, error) => {
      if (current !== utterance) return
      current = null
      voice.speakingNow = false
      if (error) utterance.onerror && utterance.onerror({ error })
      else utterance.onend && utterance.onend({})
    }
    const synth = {
      speaking: false, pending: false, paused: false,
      getVoices() { return [{ name: 'Test voice', lang: 'en-US', localService: true, default: true }] },
      speak(utterance) {
        voice.spoken.push(utterance.text)
        current = utterance
        voice.speakingNow = true
        setTimeout(() => {
          if (current !== utterance) return
          utterance.onstart && utterance.onstart({})
          const done = () => finish(utterance, null)
          if (voice.hold) voice.pendingEnd = done
          else setTimeout(done, options.speechMs)
        }, 20)
      },
      cancel() {
        voice.cancelled += 1
        const utterance = current
        if (utterance) setTimeout(() => { utterance.onerror && utterance.onerror({ error: 'canceled' }) }, 0)
        current = null
        voice.speakingNow = false
        voice.pendingEnd = null
      },
      pause() {}, resume() {}, addEventListener() {}, removeEventListener() {},
    }
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
  } else {
    Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true })
  }

  const media = navigator.mediaDevices || {}
  const getUserMedia = async () => {
    if (options.micDenied) throw new DOMException('Permission denied', 'NotAllowedError')
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const destination = context.createMediaStreamDestination()
    oscillator.frequency.value = 220
    oscillator.connect(gain)
    gain.connect(destination)
    oscillator.start()
    // A slow wobble, so the level visibly moves while listening.
    setInterval(() => { gain.gain.value = voice.level * (0.5 + 0.5 * Math.sin(Date.now() / 250)) }, 40)
    return destination.stream
  }
  Object.defineProperty(navigator, 'mediaDevices', { value: { ...media, getUserMedia }, configurable: true })
})()
`

export async function installVoiceStubs(page: Page, options: VoiceStubOptions = {}): Promise<void> {
  const resolved: Required<VoiceStubOptions> = {
    recognition: options.recognition ?? true,
    synthesis: options.synthesis ?? true,
    micDenied: options.micDenied ?? false,
    speechMs: options.speechMs ?? 400,
  }
  await page.addInitScript({ content: script(resolved) })
}
