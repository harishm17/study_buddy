// Layout shift per page, desktop and a throttled phone (1.6 Mbit, 150 ms RTT, 4x CPU), cold context each time.
// usage: node cls.mjs <label> [scenario]   -> prints a table and writes ../<label>/cls.json
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const require = createRequire('/home/harish/code/study_buddy-wt/wayfinding/frontend/package.json')
const { chromium } = require('@playwright/test')
const HERE = path.dirname(new URL(import.meta.url).pathname)
const label = process.argv[2] ?? 'after'
const scen = process.argv[3] ?? 'due'
const keepCookie = process.argv[4] !== 'nocookie'
const BASE = 'http://localhost:3320'
const C = '/courses/cdaa7d44-2ae5-4bf9-b818-6b1ead099331'
const pages = ['/home', C, C + '/plan', C + '/review']

execFileSync(path.join(HERE, 'scenario.sh'), [scen])
const browser = await chromium.launch()

async function login(ctx) {
  const page = await ctx.newPage()
  await page.goto(BASE + '/login')
  await page.getByLabel(/email/i).fill('demo@studymargins.com')
  await page.locator('input[name=password]').fill('study-buddy-demo')
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL(/\/home|\/courses/, { timeout: 30000 })
  await page.waitForTimeout(2500)
  const state = await ctx.storageState()
  await page.close()
  return state
}
const seedCtx = await browser.newContext({ timezoneId: 'America/Los_Angeles' })
const state = await login(seedCtx)
if (!keepCookie) state.cookies = state.cookies.filter((c) => c.name !== 'sb_tz' && !/tz|time/i.test(c.name))
await seedCtx.close()

const results = []
for (const profile of ['desktop', 'phone-throttled']) {
  for (const url of pages) {
    const phone = profile !== 'desktop'
    const ctx = await browser.newContext({
      storageState: state,
      viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      isMobile: phone,
      hasTouch: phone,
      deviceScaleFactor: phone ? 2 : 1,
      timezoneId: 'America/Los_Angeles',
    })
    await ctx.addInitScript(() => {
      window.__ls = []
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.hadRecentInput) continue
          window.__ls.push({
            v: +e.value.toFixed(3),
            at: Math.round(e.startTime),
            src: (e.sources || []).slice(0, 2).map((s) => `${s.node?.nodeName}.${String(s.node?.className || '').slice(0, 40)}`),
          })
        }
      }).observe({ type: 'layout-shift', buffered: true })
    })
    const page = await ctx.newPage()
    if (phone) {
      const cdp = await ctx.newCDPSession(page)
      await cdp.send('Network.enable')
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 })
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    }
    await page.goto(BASE + url, { waitUntil: 'load' })
    await page.waitForTimeout(3500)
    const shifts = await page.evaluate(() => window.__ls)
    const total = +shifts.reduce((sum, s) => sum + s.v, 0).toFixed(3)
    results.push({ profile, url: url.replace(C, 'C'), total, shifts })
    console.log(profile.padEnd(16), url.replace(C, 'C').padEnd(10), String(total).padEnd(7), JSON.stringify(shifts.slice(0, 3)))
    await ctx.close()
  }
}
await browser.close()
fs.writeFileSync(path.join(HERE, '..', label, `cls-${scen}.json`), JSON.stringify(results, null, 1))
