import { existsSync, readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// One account per run. The AI service behind the dev stack is a mock, so generating content is
// free and fast; the spec writes every kind of content through the page itself.
const stamp = Date.now()
const email = `topic-${stamp}@example.com`
const password = 'topic-test-password'
// Content is written from uploaded files, so the course needs one. Set E2E_PDF to use another.
const pdfPath = process.env.E2E_PDF ?? '/tmp/sb-e2e/files/algorithms.pdf'
const TOPICS = ['Graph traversal', 'Sorting algorithms']

async function createCourse(page: Page) {
  const course = await page.request.post('/api/projects', { data: { name: `Topic course ${stamp}` } })
  expect(course.ok()).toBeTruthy()
  const courseId = (await course.json()).project.id as string
  const upload = await page.request.post(
    `/api/projects/${courseId}/materials?category=lecture_notes&filename=algorithms.pdf`,
    { data: readFileSync(pdfPath), headers: { 'content-type': 'application/pdf' } }
  )
  expect(upload.ok()).toBeTruthy()
  await expect
    .poll(
      async () => {
        const body = await (await page.request.get(`/api/projects/${courseId}/materials`)).json()
        return body.materials.map((item: { validationStatus: string }) => item.validationStatus).join()
      },
      { timeout: 120_000 }
    )
    .toBe('valid')
  const ids: string[] = []
  for (const name of TOPICS) {
    const topic = await page.request.post(`/api/projects/${courseId}/topics`, {
      data: { name, description: `About ${name}.` },
    })
    expect(topic.ok()).toBeTruthy()
    ids.push((await topic.json()).topic.id as string)
  }
  await page.request.post(`/api/projects/${courseId}/topics/confirm`)
  return { courseId, ids }
}

test.describe.configure({ mode: 'serial' })

test('the study path: write, read, practise, take a quiz', async ({ page }) => {
  test.skip(!existsSync(pdfPath), `needs ${pdfPath}`)
  test.setTimeout(300_000)

  await page.request.post('/api/auth/signup', { data: { email, password, name: 'Topic Tester' } })
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/home')

  const { courseId, ids } = await createCourse(page)
  const base = `/courses/${courseId}/topics/${ids[0]}`

  // No view in the address: it goes to the first unfinished one.
  await page.goto(base)
  await expect(page).toHaveURL(/\?view=notes$/)
  await expect(page.getByRole('heading', { level: 1, name: TOPICS[0] })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No notes yet' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ask about this' })).toHaveAttribute('href', `/courses/${courseId}/ask?topic=${ids[0]}`)

  // Write the notes through the empty state; the view fills in when the job finishes.
  await page.getByRole('button', { name: 'Write notes' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' }).first()).toBeVisible({ timeout: 90_000 })
  await expect(page.getByRole('navigation', { name: 'Study path' }).getByRole('link', { name: /Notes/ })).toHaveAttribute('aria-current', 'page')

  // Mark as read, then the next view is offered.
  await page.getByRole('button', { name: 'Mark as read' }).click()
  await expect(page.getByText("You've read these notes.")).toBeVisible()
  await expect(page.getByRole('link', { name: /Next: Worked examples/ })).toBeVisible()

  // Number keys switch views; typing in a field does not.
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('2')
  await expect(page).toHaveURL(/view=examples/)
  await page.keyboard.press('3')
  await expect(page).toHaveURL(/view=practice/)

  // Practice: create, answer wrong, try again, answer right. Progress survives a reload.
  await page.getByRole('button', { name: 'Create practice' }).click()
  await expect(page.getByLabel('Your answer')).toBeVisible({ timeout: 90_000 })
  await page.getByLabel('Your answer').fill('5')
  await page.getByRole('button', { name: 'Check', exact: true }).click()
  await expect(page.getByText('Not quite')).toBeVisible()
  await page.getByRole('button', { name: 'Try again' }).click()
  await page.getByLabel('Your answer').fill('4')
  await page.getByRole('button', { name: 'Check', exact: true }).click()
  await expect(page.getByText('Correct', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Study path' }).getByRole('img', { name: 'Completed' })).toBeVisible()

  // Examples: create and mark as done.
  await page.goto(`${base}?view=examples`)
  await page.getByRole('button', { name: 'Create examples' }).click()
  await expect(page.getByRole('button', { name: /Worked example/ })).toBeVisible({ timeout: 90_000 })
  await page.getByRole('button', { name: 'Mark as done' }).click()
  await expect(page.getByText("You've worked through these examples.")).toBeVisible()

  // Quiz: create, answer with the keyboard, leave one blank, submit.
  await page.goto(`${base}?view=quiz`)
  await page.getByRole('button', { name: 'Create a quiz' }).click()
  await expect(page.getByRole('button', { name: 'Start quiz' })).toBeVisible({ timeout: 90_000 })
  await page.getByRole('button', { name: 'Start quiz' }).click()
  await expect(page.getByText('Question 1 of')).toBeVisible()
  await page.keyboard.press('b')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('Question 2 of')).toBeVisible()
  // A reload keeps the answers.
  await page.reload()
  await expect(page.getByText('Question 2 of')).toBeVisible()
  await page.getByRole('button', { name: 'Question 1, answered' }).click()
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(1)

  const total = Number((await page.getByText(/Question \d+ of \d+/).textContent())?.match(/of (\d+)/)?.[1])
  for (let index = 1; index < total; index += 1) await page.getByRole('button', { name: `Question ${index + 1}`, exact: false }).first().click()
  await page.getByRole('button', { name: 'Submit quiz' }).click()
  await expect(page.getByRole('dialog')).toContainText('unanswered')
  await page.getByRole('dialog').getByRole('button', { name: 'Submit quiz' }).click()

  await expect(page.getByRole('heading', { name: /points/ })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('button', { name: 'Retake' })).toBeVisible()
  await page.getByRole('radio', { name: /Missed/ }).click()
  await page.getByRole('button', { name: /4, Fairly sure/ }).click()
  await expect(page.getByRole('button', { name: /4, Fairly sure/ })).toHaveAttribute('aria-pressed', 'true')

  // The attempt is in the lobby's history, with a review.
  await page.getByRole('button', { name: 'Back to quiz' }).click()
  await expect(page.getByRole('heading', { name: 'Past attempts' })).toBeVisible()
  await page.getByRole('button', { name: 'Review' }).first().click()
  await expect(page.getByText('Your answer').first()).toBeVisible()

  // ] goes to the next topic and keeps the view. (Extraction may have added topics of its own,
  // so only the change is checked, not which topic it is.)
  const before = page.url()
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press(']')
  await expect(page).not.toHaveURL(before)
  await expect(page).toHaveURL(/view=quiz$/)
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(TOPICS[0])
})
