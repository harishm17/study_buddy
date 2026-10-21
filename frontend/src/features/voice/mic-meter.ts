/**
 * A mic level for the orb. `read()` is called from requestAnimationFrame and returns 0..1.
 *
 * With a real stream it is the RMS of the microphone signal. Where holding a second capture
 * would fight the recognizer (Android Chrome, iOS), or when getUserMedia is missing, the level
 * comes from `bump()` calls (each recognizer result nudges it) and decays on its own.
 */

export type MicMeter = {
  /** Open the microphone for the level meter. Throws the getUserMedia error on refusal. */
  start: () => Promise<void>
  stop: () => void
  read: () => number
  bump: (amount?: number) => void
}

const shouldShareCapture = () =>
  typeof navigator !== 'undefined' && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

export function createMicMeter(): MicMeter {
  let stream: MediaStream | null = null
  let context: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let samples: Uint8Array<ArrayBuffer> | null = null
  let level = 0
  let bumped = 0

  const stop = () => {
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    analyser = null
    samples = null
    if (context) void context.close().catch(() => undefined)
    context = null
  }

  return {
    async start() {
      if (stream || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return
      if (!shouldShareCapture()) return
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      stream = media
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      context = new Ctor()
      const source = context.createMediaStreamSource(media)
      analyser = context.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.6
      source.connect(analyser)
      samples = new Uint8Array(analyser.fftSize)
    },

    stop,

    bump(amount = 0.7) {
      bumped = Math.max(bumped, Math.min(1, amount))
    },

    read() {
      let target = 0
      if (analyser && samples) {
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (let i = 0; i < samples.length; i += 1) {
          const centred = (samples[i] - 128) / 128
          sum += centred * centred
        }
        target = Math.min(1, Math.sqrt(sum / samples.length) * 4)
      }
      bumped *= 0.9
      target = Math.max(target, bumped)
      // Rise quickly, fall slowly.
      level = target > level ? level + (target - level) * 0.5 : level * 0.88
      return level < 0.01 ? 0 : level
    },
  }
}
