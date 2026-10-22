// Capture the wayfinding screens. usage: node shots.mjs <before|after> [desktop|mobile] [light|dark] [scenario,scenario]
// Needs the stack on :3320 (see scenario.sh for the states). Writes PNGs to ../<label>/ and axe + layout
// shift numbers to ../<label>/data-<vp>-<theme>.json.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const require = createRequire('/home/harish/code/study_buddy-wt/wayfinding/frontend/package.json')
const { chromium } = require('@playwright/test')
const axeSource = fs.readFileSync('/tmp/margins-audit/tools/node_modules/axe-core/axe.min.js', 'utf8')

const BASE = 'http://localhost:3320'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const label = process.argv[2] ?? 'after'
const vps = process.argv[3] && process.argv[3] !== 'all' ? [process.argv[3]] : ['desktop', 'mobile']
const themes = process.argv[4] && process.argv[4] !== 'all' ? [process.argv[4]] : ['light', 'dark']
const only = process.argv[5] ? process.argv[5].split(',') : null
const OUT = path.join(HERE, '..', label)
fs.mkdirSync(OUT, { recursive: true })

const IDS = {
  course: 'cdaa7d44-2ae5-4bf9-b818-6b1ead099331',
  setup: '1be89dd1-5015-4aff-a865-a63c48bd621c',
  sort: '6645f6c4-6b81-435c-9cbc-a0d092406fd2',
  graph: '9ff48cec-3e29-4a9b-87fe-06c5080cafe2',
  math: '93817246-de0f-4e40-8320-3d124bc867cd',
}
const C = `/courses/${IDS.course}`
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }

const scenario = (name) => execFileSync(path.join(HERE, 'scenario.sh'), [name], { stdio: 'pipe' })

async function login(page) {
  await page.goto(BASE + '/login')
  await page.getByLabel(/email/i).fill('demo@studymargins.com')
  await page.locator('input[name=password]').fill('study-buddy-demo')
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL(/\/home|\/courses/, { timeout: 30000 })
}

const data = { axe: [], cls: [] }

async function run() {
  const browser = await chromium.launch()
  for (const vp of vps) {
    for (const theme of themes) {
      const ctx = await browser.newContext({
        viewport: VIEWPORTS[vp],
        colorScheme: theme,
        isMobile: vp === 'mobile',
        hasTouch: vp === 'mobile',
        deviceScaleFactor: vp === 'mobile' ? 2 : 1,
        timezoneId: 'America/Los_Angeles',
      })
      await ctx.addInitScript(() => {
        window.__cls = 0
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value
          }).observe({ type: 'layout-shift', buffered: true })
        } catch {}
      })
      const page = await ctx.newPage()
      await login(page)

      const snap = async (name, opts = {}) => {
        await page.waitForTimeout(opts.wait ?? 900)
        const cls = await page.evaluate(() => window.__cls || 0)
        data.cls.push({ name, vp, theme, cls: +cls.toFixed(3) })
        const file = `${name}__${vp}-${theme}.png`
        if (opts.full) {
          const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))
          const size = page.viewportSize()
          await page.setViewportSize({ width: size.width, height: Math.min(Math.max(h, size.height), 6000) })
          await page.waitForTimeout(300)
          await page.screenshot({ path: path.join(OUT, file) })
          await page.setViewportSize(size)
        } else {
          await page.screenshot({ path: path.join(OUT, file) })
        }
        try {
          await page.evaluate(axeSource)
          const violations = await page.evaluate(async () => {
            const res = await window.axe.run(document, {
              runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
            })
            return res.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              count: v.nodes.length,
              targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
            }))
          })
          data.axe.push({ name, vp, theme, url: page.url().replace(BASE, ''), violations })
        } catch (error) {
          data.axe.push({ name, vp, theme, error: String(error).slice(0, 160), violations: [] })
        }
        await page.evaluate(() => (window.__cls = 0))
      }

      const visit = async (url) => {
        await page.goto(BASE + url, { waitUntil: 'load' })
        await page.waitForLoadState('networkidle').catch(() => {})
      }
      const want = (name) => !only || only.includes(name)

      // Nothing due, no exam date, a plan of learning.
      if (want('base')) {
        scenario('base')
        await visit('/home')
        await snap('home-nothing-due')
        await visit(C)
        await snap('overview-no-exam-date', { full: true })
        await visit(C + '/plan')
        await snap('plan-rolling', { full: true })
        await visit(C + '/review')
        await snap('review-empty')
        await visit(C + `/topics/${IDS.math}`)
        await snap('topic-notes-nav')
        if (vp === 'mobile') {
          await page.getByRole('button', { name: 'Open menu' }).click()
          await snap('mobile-menu-open')
          await page.keyboard.press('Escape')
          await page.waitForTimeout(700)
          const more = page.getByRole('button', { name: 'More', exact: true })
          if (await more.count()) {
            await more.click()
            await snap('mobile-more-sheet')
          }
        }
      }

      // Reviews overdue and today's time used up: the case that used to contradict itself.
      if (want('due-spent')) {
        scenario('due-spent')
        await visit('/home')
        await snap('home-overdue', { full: true })
        await visit(C)
        await snap('overview-overdue-spent', { full: true })
        await visit(C + '/plan')
        await snap('plan-overdue', { full: true })
      }

      if (want('due')) {
        scenario('due')
        await visit(C + '/review')
        await snap('review-queue-due', { full: true })
        await visit(C)
        await snap('overview-overdue')
        // Voice: before it ran inline on the Review page; now it has its own screen.
        if (label === 'before') await visit(C + '/review')
        else await visit(C + '/review/voice')
        const start = page.getByRole('button', { name: /Start (voice (review|practice)|sprint)/ })
        await start.first().waitFor({ timeout: 20000 }).catch(() => {})
        await snap('voice-lobby', { full: label === 'before' })
        if (await start.count()) {
          await start.first().click()
          await page.waitForTimeout(2500)
          await snap('voice-session')
        }
      }

      if (want('exam3')) {
        scenario('exam3')
        await visit(C)
        await snap('overview-exam-3-days', { full: true })
        await visit(C + '/plan')
        await snap('plan-exam-3-days', { full: true })
      }
      if (want('exam21')) {
        scenario('exam21')
        await visit(C)
        await snap('overview-exam-21-days', { full: true })
        await visit(C + '/plan')
        await snap('plan-exam-21-days', { full: true })
      }
      if (want('exam-past')) {
        scenario('exam-past')
        await visit(C)
        await snap('overview-exam-past', { full: true })
        await visit(C + '/plan')
        await snap('plan-exam-past')
      }
      if (want('setup')) {
        await visit(`/courses/${IDS.setup}`)
        await snap('overview-setup-course')
      }
      await ctx.close()
    }
  }
  await browser.close()
  const file = path.join(OUT, `data-${vps.join('+')}-${themes.join('+')}.json`)
  fs.writeFileSync(file, JSON.stringify(data, null, 1))
  const serious = data.axe.flatMap((s) => s.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${s.name} ${s.vp}-${s.theme}: ${v.id} x${v.count}`))
  console.log('serious/critical axe:', serious.length ? '\n' + serious.join('\n') : 'none')
  console.log('cls:', data.cls.filter((c) => c.cls >= 0.02).map((c) => `${c.name} ${c.vp}-${c.theme} ${c.cls}`).join('\n') || 'all under 0.02')
}
await run()
