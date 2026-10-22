import { expect, test, type Page } from '@playwright/test'
import { DEMO_EMAIL, DEMO_PASSWORD, demoIds } from './helpers/seed-demo'

// The accessibility and polish fixes: real 404s, the theme control, the review of a graded exam
// (what a written answer was graded against, "Explain this mistake", one score everywhere).
// Runs on the demo account and its graded mock exam, which global-setup.ts seeds.

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(DEMO_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/home$/, { timeout: 60_000 })
}

/** The graded attempt of the demo exam: [exam id, submission id]. */
async function gradedAttempt(page: Page, course: string): Promise<[string, string]> {
  const { exams } = await (await page.request.get(`/api/projects/${course}/exams`)).json()
  for (const exam of exams as { id: string }[]) {
    const { submissions } = await (await page.request.get(`/api/exams/${exam.id}/submissions`)).json()
    const graded = (submissions as { id: string; score: number | null }[]).find((item) => item.score !== null)
    if (graded) return [exam.id, graded.id]
  }
  throw new Error('the demo account has no graded exam')
}

test('an address that names nothing answers 404, in the app and in the exam shell', async ({ page }) => {
  const { course } = demoIds()
  await signIn(page)
  for (const path of [
    '/courses/not-a-uuid',
    `/courses/${course}/exams/not-a-uuid`,
    `/courses/${course}/exams/not-a-uuid/take`,
    `/courses/${course}/topics/not-a-uuid`,
    // A NUL byte is not valid database input: it must be "not found", not a server error.
    '/courses/%00',
    `/courses/${course}/exams/%00`,
  ]) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: "We couldn't find that page" }), path).toBeVisible()
  }
  // Inside a course the way back leads to the course.
  await page.goto(`/courses/${course}/exams/not-a-uuid`)
  await expect(page.getByRole('link', { name: 'Back to the course' })).toHaveAttribute('href', `/courses/${course}`)
})

test('the theme is a visible choice in the account menu', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: /account menu/i }).click()
  // Not behind a submenu: the three choices are in the menu itself.
  for (const name of ['Light', 'Dark', 'System']) {
    await expect(page.getByRole('menuitemradio', { name })).toBeVisible()
  }
  await page.getByRole('menuitemradio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toBeChecked()
  await page.getByRole('menuitemradio', { name: 'Light' }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('a graded exam shows what was checked, and asks Ask to explain a miss', async ({ page }) => {
  const { course } = demoIds()
  await signIn(page)
  const [examId, submissionId] = await gradedAttempt(page, course)
  await page.goto(`/courses/${course}/exams/${examId}/results/${submissionId}`)
  await expect(page.getByRole('heading', { name: 'Questions' })).toBeVisible()

  // A written answer: the rubric, the model answer and a way to ask for another grading.
  const rubric = page.getByRole('group', { name: /was graded/ }).first()
  await expect(rubric).toBeVisible()
  await expect(rubric.getByText(/for the whole answer/)).toBeVisible()
  await expect(page.getByText('Model answer').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Disagree? Grade again' }).first()).toBeVisible()

  // The score reads the same in the ring, the lobby and everywhere else (one decimal at most).
  const ring = await page.getByRole('img', { name: /^Score / }).getAttribute('aria-label')
  await expect(page.getByRole('img', { name: /^Score / })).toContainText(ring!.replace('Score ', ''))

  // A missed question opens Ask with the question and the answer written, and nothing sent.
  await page.getByRole('link', { name: 'Explain this mistake' }).first().click()
  await expect(page).toHaveURL(/\/ask\?.*q=/)
  const box = page.locator('#ask-composer')
  await expect(box).toHaveValue(/Explain this mistake\.[\s\S]*Question: [\s\S]*My answer: /)
})

test('the lobby and the results give the same score for an attempt', async ({ page }) => {
  const { course } = demoIds()
  await signIn(page)
  const [examId, submissionId] = await gradedAttempt(page, course)
  await page.goto(`/courses/${course}/exams/${examId}/results/${submissionId}`)
  const resultScore = (await page.getByRole('img', { name: /^Score / }).getAttribute('aria-label'))!.replace('Score ', '')
  await page.goto(`/courses/${course}/exams/${examId}`)
  await expect(page.getByRole('list').getByText(resultScore, { exact: true })).toBeVisible()
})
