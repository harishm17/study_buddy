import { prisma } from '@/lib/db/prisma'
import {
  USAGE_WINDOW_MS,
  dailyVoiceMinutes,
  isSessionLive,
  remainingSeconds,
  usedSeconds,
} from './usage'

/** Sessions that connected inside the usage window. */
export async function loadRecentSessions(userId: string, now: Date) {
  return prisma.voiceDrillSession.findMany({
    where: {
      userId,
      connectedAt: { gte: new Date(now.getTime() - USAGE_WINDOW_MS) },
    },
    select: { id: true, connectedAt: true, lastSeenAt: true, endedAt: true },
  })
}

export async function getVoiceUsage(userId: string, now = new Date()) {
  const capMinutes = dailyVoiceMinutes()
  const sessions = await loadRecentSessions(userId, now)
  return {
    dailyMinutes: capMinutes,
    usedSeconds: usedSeconds(sessions, now),
    remainingSeconds: remainingSeconds(sessions, capMinutes, now),
    hasLiveSession: sessions.some((session) => isSessionLive(session, now)),
  }
}
