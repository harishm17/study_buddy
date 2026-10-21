import { PrismaClient } from '@prisma/client'

/** The database the stack under test uses. DATABASE_URL must be set: no default, so a spec can never
 * write into somebody else's database by accident. */
export const e2eDatabaseUrl = () => {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Set DATABASE_URL to the database of the stack under test')
  return url
}

/** Runs `run` with a Prisma client on the stack's database, and disconnects afterwards. */
export async function withPrisma<T>(run: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const prisma = new PrismaClient({ datasourceUrl: e2eDatabaseUrl(), log: [] })
  try {
    return await run(prisma)
  } finally {
    await prisma.$disconnect()
  }
}
