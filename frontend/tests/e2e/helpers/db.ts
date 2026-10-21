import { PrismaClient } from '@prisma/client'

/** The database the dev stack under test uses; set DATABASE_URL to the stack's database. */
export const e2eDatabaseUrl = () => process.env.DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:5544/sb_design'

/** Runs `run` with a Prisma client on the stack's database, and disconnects afterwards. */
export async function withPrisma<T>(run: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const prisma = new PrismaClient({ datasourceUrl: e2eDatabaseUrl(), log: [] })
  try {
    return await run(prisma)
  } finally {
    await prisma.$disconnect()
  }
}
