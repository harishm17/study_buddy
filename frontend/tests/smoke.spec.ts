import { test, expect } from '@playwright/test'

test('landing page shows auth actions', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Build exam confidence with a smarter daily study loop.' })
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Start for Free' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible()
})

test('login page renders form controls', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})
