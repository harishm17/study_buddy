import type { FullConfig } from '@playwright/test'
import { seedDemo } from './helpers/seed-demo'

/** Seeds the demo account and course once per run and hands the ids to the specs. */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL
  if (!baseURL) throw new Error('baseURL is not set')
  const ids = await seedDemo(baseURL)
  process.env.E2E_DEMO_IDS = JSON.stringify(ids)
}
