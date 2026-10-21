import { expect, test, type Page } from '@playwright/test'
import { DEMO_EMAIL, DEMO_PASSWORD, demoIds } from './helpers/seed-demo'

// No page may scroll sideways on a phone. Every main page is loaded at 390 x 844 (the mock LLM's
// demo course, seeded by global-setup.ts) and the document must be no wider than the window.
// Desktop-only layouts count: they are still opened on a phone sometimes.
test.use({ viewport: { width: 390, height: 844 } })

const signIn = async (page: Page) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(DEMO_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/home$/, { timeout: 60_000 })
}

/** The elements that stick out past the right edge, for the failure message. */
const overflowing = (page: Page) =>
  page.evaluate(() => {
    const width = window.innerWidth
    // Something inside a box that scrolls or clips on its own does not widen the page.
    const clipped = (element: Element) => {
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (getComputedStyle(parent).overflowX !== 'visible') return true
      }
      return false
    }
    return [...document.querySelectorAll('body *')]
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ element, box }) => box.width > 0 && box.right > width + 0.5 && !clipped(element))
      .slice(0, 8)
      .map(({ element, box }) => {
        const classes = typeof element.className === 'string' ? element.className.split(/\s+/).slice(0, 4).join('.') : ''
        return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''} right=${Math.round(box.right)}`
      })
  })

async function expectNoSidewaysScroll(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, `${url} is ${scrollWidth}px wide in a ${innerWidth}px window; sticking out: ${(await overflowing(page)).join(', ')}`).toBeLessThanOrEqual(
    innerWidth
  )
}

const { course, setupCourse, topics, mathTopic } = demoIds()
const topic = `/courses/${course}/topics/${topics[0]}`
const math = `/courses/${course}/topics/${mathTopic}`
const PAGES: [string, string][] = [
  ['home', '/home'],
  ['course overview', `/courses/${course}`],
  ['course setup guide', `/courses/${setupCourse}`],
  ['topics list with units', `/courses/${course}/topics`],
  ['topic editor with units', `/courses/${course}/topics?edit=1`],
  ['topic notes with objectives and sources', `${topic}?view=notes`],
  ['topic examples', `${topic}?view=examples`],
  ['topic practice', `${topic}?view=practice`],
  ['topic quiz', `${topic}?view=quiz`],
  ['topic voice', `${topic}?view=voice`],
  ['math topic notes', `${math}?view=notes`],
  ['math topic examples', `${math}?view=examples`],
  ['math topic practice', `${math}?view=practice`],
  ['math topic quiz', `${math}?view=quiz`],
  ['materials with role badges', `/courses/${course}/materials`],
  ['ask', `/courses/${course}/ask`],
  ['mock exams', `/courses/${course}/exams`],
  ['new mock exam', `/courses/${course}/exams/new`],
  ['review', `/courses/${course}/review`],
  ['settings', `/courses/${course}/settings`],
]

test.describe('signed in', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page)
  })

  for (const [name, url] of PAGES) {
    test(`${name} fits the window`, async ({ page }) => {
      await expectNoSidewaysScroll(page, url)
    })
  }

  test('the objectives open on a phone without widening the page', async ({ page }) => {
    await page.goto(topic + '?view=notes', { waitUntil: 'networkidle' })
    const toggle = page.getByRole('button', { name: /By the end you can/ })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(page.getByText('trace merge sort and quicksort on a small array')).toBeVisible()
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth)
  })

  test('graded exam results fit the window', async ({ page }) => {
    const { exams } = await (await page.request.get(`/api/projects/${course}/exams`)).json()
    const { submissions } = await (await page.request.get(`/api/exams/${exams[0].id}/submissions`)).json()
    await expectNoSidewaysScroll(page, `/courses/${course}/exams/${exams[0].id}/results/${submissions[0].id}`)
  })
})

test.describe('signed out', () => {
  for (const url of ['/', '/login', '/signup', '/privacy', '/terms']) {
    test(`${url} fits the window`, async ({ page }) => {
      await expectNoSidewaysScroll(page, url)
    })
  }
})
