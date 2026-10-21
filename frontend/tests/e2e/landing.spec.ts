import { expect, test } from '@playwright/test'

test('the landing page tells the story with real screenshots', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'Turn your course files into a study plan.' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Account' }).getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/signup')
  await expect(page.getByRole('navigation', { name: 'Account' }).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')

  // Sections in order, each with its heading.
  for (const name of ['How it works', 'What you get', 'Explain it out loud', 'Start with one course.']) {
    await page.getByRole('heading', { level: 2, name }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
  }
  await expect(page.getByText('Your files stay in your account. Delete a course and its files go with it.')).toBeVisible()

  // The five bento cells and the three steps.
  for (const name of [
    'Notes with sources',
    'Practice that checks each step',
    'Quizzes graded with feedback',
    'Ask your materials, with citations',
    'Mock exams with a real timer',
  ]) {
    await expect(page.getByRole('heading', { level: 3, name })).toBeVisible()
  }
  await expect(page.getByRole('listitem').filter({ hasText: 'Upload your materials' })).toBeVisible()

  // Every visible screenshot has loaded, has alt text, and none overflows the page sideways.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y)
      await new Promise((resolve) => setTimeout(resolve, 80))
    }
  })
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.images)
          .filter((image) => image.offsetParent !== null)
          .every((image) => image.complete && image.naturalWidth > 0 && image.alt.length > 10)
      )
    )
    .toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  expect(errors).toEqual([])

  // Structured data and the canonical link are present.
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://studymargins.com/')
  expect(await page.locator('script[type="application/ld+json"]').count()).toBe(1)
})

test('a signed-in visitor sees Open Margins instead of sign in', async ({ page }) => {
  const stamp = Date.now()
  const email = `landing-${stamp}@example.com`
  const password = 'landing-test-password'
  const signup = await page.request.post('/api/auth/signup', { data: { email, password, name: 'Landing Tester' } })
  expect(signup.ok()).toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/home$/)

  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  const nav = page.getByRole('navigation', { name: 'Account' })
  await expect(nav.getByRole('link', { name: 'Open Margins' })).toHaveAttribute('href', '/home')
  await expect(nav.getByRole('link', { name: 'Sign in' })).toHaveCount(0)
})

test('the auth pages show the real notes screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/login')
  const image = page.locator('img[src*="notes-light"]')
  await expect(image).toHaveCount(1)
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true)
})
