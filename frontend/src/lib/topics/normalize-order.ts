import type { Prisma } from '@prisma/client'
import { canonicalTopicOrder } from './units'

/**
 * Rewrites `Topic.orderIndex` (0, 1, 2, ...) into the canonical course order: units in their
 * order, each unit's topics, then the topics that have no unit. Call it inside the transaction of
 * any write that moves a topic between units or changes the order of topics or units. A course
 * with no units keeps the order it has (only gaps close). Returns the topic ids in order.
 */
export async function normalizeTopicOrder(tx: Prisma.TransactionClient, projectId: string): Promise<string[]> {
  const [topics, units] = await Promise.all([
    tx.topic.findMany({
      where: { projectId },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, unitId: true, orderIndex: true },
    }),
    tx.unit.findMany({ where: { projectId }, select: { id: true, orderIndex: true } }),
  ])
  const order = canonicalTopicOrder(topics, units)
  const current = new Map(topics.map((topic) => [topic.id, topic.orderIndex]))
  for (const [index, id] of order.entries()) {
    if (current.get(id) !== index) await tx.topic.update({ where: { id }, data: { orderIndex: index } })
  }
  return order
}

/** Closes gaps in `Unit.orderIndex` (0, 1, 2, ...), keeping the order. */
export async function compactUnitOrder(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  const units = await tx.unit.findMany({
    where: { projectId },
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, orderIndex: true },
  })
  for (const [index, unit] of units.entries()) {
    if (unit.orderIndex !== index) await tx.unit.update({ where: { id: unit.id }, data: { orderIndex: index } })
  }
}
