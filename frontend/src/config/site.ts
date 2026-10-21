import { BRAND_NAME } from './brand'

/** The canonical origin: the apex domain. www redirects here (next.config.js). */
export const SITE_URL = 'https://studymargins.com'
export const SITE_HOST = 'studymargins.com'
export const GITHUB_URL = 'https://github.com/harishm17/margins'
export const CONTACT_EMAIL = 'hello@studymargins.com'

export const DEFAULT_TITLE = `${BRAND_NAME}: study from your own course files`
export const DEFAULT_DESCRIPTION =
  'Upload lecture notes and past exams. Margins builds notes, practice, quizzes and timed mock exams from them, with sources for every answer.'

/** Brand colours as hex, for places that cannot read CSS variables (manifest, icons, theme-color). */
export const BRAND_COLORS = {
  canvas: '#f9fafb',
  canvasDark: '#0d0e11',
  accent: '#007d5d',
  accentFg: '#f6fefa',
} as const
