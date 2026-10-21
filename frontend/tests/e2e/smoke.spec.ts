import { expect, test } from '@playwright/test'

// One account per run, so the spec can run again against the same database.
const stamp = Date.now()
const email = `smoke-${stamp}@example.com`
const password = 'smoke-test-password'
const courseName = `Smoke course ${stamp}`

test('sign up, create a course, sign out, sign in, find it from home and the palette', async ({ page }) => {
  // Sign up lands on the first-course setup.
  await page.goto('/signup')
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible()
  await page.getByLabel('Name').fill('Smoke Tester')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/courses\/new\?welcome=1$/)
  await expect(page.getByRole('heading', { level: 1, name: "Let's set up your first course" })).toBeVisible()

  // Creating a course lands on its overview inside the shell.
  await page.getByLabel('Course name').fill(courseName)
  await page.getByRole('button', { name: 'Create course' }).click()
  await expect(page).toHaveURL(/\/courses\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { level: 1, name: courseName })).toBeVisible()
  // A new course opens on the setup guide.
  await expect(page.getByRole('heading', { level: 2, name: 'Add your materials' })).toBeVisible()
  const courseUrl = page.url()

  // Sign out through the account menu.
  await page.getByRole('button', { name: /Account menu for/ }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)

  // A signed-out visit to an app page goes to sign in and comes back afterwards.
  await page.goto(courseUrl)
  await expect(page).toHaveURL(/\/login\?next=/)

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(courseUrl)

  // Home lists the course.
  await page.goto('/home')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: courseName })).toBeVisible()

  // The command palette finds the course and opens it.
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog')
  await expect(palette).toBeVisible()
  await page.keyboard.type(courseName.slice(0, 12))
  await expect(palette.getByRole('option', { name: new RegExp(courseName) })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(courseUrl)
})

test('signed-out pages render the sign in and sign up forms', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible()
  await page.getByRole('link', { name: 'Create an account' }).click()
  await expect(page).toHaveURL(/\/signup$/)
  await expect(page.getByText('At least 8 characters')).toBeVisible()
})
