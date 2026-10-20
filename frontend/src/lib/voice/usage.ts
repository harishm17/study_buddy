// Voice minutes are metered on the server, from timestamps on VoiceDrillSession:
//   connectedAt  set when a realtime token is minted
//   lastSeenAt   refreshed by a heartbeat from the open call
//   endedAt      set when the client ends or aborts the session
// The browser can vanish without ending the session, so an unended session only counts up
// to its last heartbeat.

export const DEFAULT_DAILY_MINUTES = 30
export const USAGE_WINDOW_MS = 24 * 60 * 60 * 1000
/** A session with no heartbeat for this long is treated as gone. */
export const HEARTBEAT_STALE_MS = 90_000
/** Nothing legitimate runs longer than this; guards against bad timestamps. */
export const MAX_SESSION_SECONDS = 2 * 60 * 60

export type SessionTiming = {
  connectedAt: Date | null
  lastSeenAt: Date | null
  endedAt: Date | null
}

/** Reads VOICE_DAILY_MINUTES. A missing or invalid value falls back to the default. */
export function dailyVoiceMinutes(raw: string | undefined = process.env.VOICE_DAILY_MINUTES): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_DAILY_MINUTES
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return DEFAULT_DAILY_MINUTES
  return value
}

/**
 * True while the call is open: connected, heard from recently, and not ended since the last
 * heartbeat. A drill that finishes while the call stays open is marked ended, but heartbeats
 * keep arriving after that, so it still counts as live.
 */
export function isSessionLive(session: SessionTiming, now: Date): boolean {
  if (!session.connectedAt) return false
  const lastSignOfLife = session.lastSeenAt ?? session.connectedAt
  if (session.endedAt && lastSignOfLife.getTime() <= session.endedAt.getTime()) return false
  return now.getTime() - lastSignOfLife.getTime() <= HEARTBEAT_STALE_MS
}

/** Seconds of voice time one session used. */
export function sessionSeconds(session: SessionTiming, now: Date): number {
  if (!session.connectedAt) return 0
  const start = session.connectedAt.getTime()
  const lastSignOfLife = (session.lastSeenAt ?? session.connectedAt).getTime()
  let end: number
  if (isSessionLive(session, now)) {
    end = now.getTime()
  } else if (session.endedAt) {
    end = Math.max(session.endedAt.getTime(), lastSignOfLife)
  } else {
    end = lastSignOfLife
  }
  const seconds = Math.max(0, Math.floor((end - start) / 1000))
  return Math.min(seconds, MAX_SESSION_SECONDS)
}

/** Seconds used by sessions that connected inside the usage window ending now. */
export function usedSeconds(sessions: SessionTiming[], now: Date): number {
  const windowStart = now.getTime() - USAGE_WINDOW_MS
  return sessions
    .filter((session) => session.connectedAt && session.connectedAt.getTime() >= windowStart)
    .reduce((sum, session) => sum + sessionSeconds(session, now), 0)
}

export function remainingSeconds(sessions: SessionTiming[], capMinutes: number, now: Date): number {
  return Math.max(0, Math.round(capMinutes * 60) - usedSeconds(sessions, now))
}
