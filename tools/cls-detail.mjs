// What moved on one page: node cls-detail.mjs <path-after-origin> [phone]
import { createRequire } from 'node:module'
const require = createRequire('/home/harish/code/study_buddy-wt/wayfinding/frontend/package.json')
const { chromium } = require('@playwright/test')
const BASE = 'http://localhost:3320'
const url = process.argv[2]
const phone = process.argv[3] === 'phone'
const browser = await chromium.launch()
const seed = await browser.newContext()
const sp = await seed.newPage()
await sp.goto(BASE + '/login')
await sp.getByLabel(/email/i).fill('demo@studymargins.com')
await sp.locator('input[name=password]').fill('study-buddy-demo')
await sp.getByRole('button', { name: /sign in|log in/i }).click()
await sp.waitForURL(/\/home|\/courses/)
const state = await seed.storageState()
if (process.env.NOCOOKIE) state.cookies = state.cookies.filter((c) => c.name !== 'margins_tz')
const ctx = await browser.newContext({
  storageState: state,
  viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1, timezoneId: 'America/Los_Angeles',
})
await ctx.addInitScript(() => {
  window.__ls = []
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue
      window.__ls.push({
        v: +e.value.toFixed(3), at: Math.round(e.startTime),
        src: (e.sources || []).map((s) => ({ n: `${s.node?.nodeName}.${String(s.node?.className || '').slice(0, 30)} ${(s.node?.textContent || '').trim().slice(0, 24)}`, from: [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height].map(Math.round), to: [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height].map(Math.round) })),
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
page.on('console', (m) => m.type() === 'error' && console.log('console.error', m.text().slice(0, 200)))
await page.goto(BASE + url, { waitUntil: 'load' })
await page.waitForTimeout(3500)
console.log(JSON.stringify(await page.evaluate(() => window.__ls), null, 1))
await browser.close()
