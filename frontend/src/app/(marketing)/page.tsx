import type { Metadata } from 'next'
import { BRAND_NAME } from '@/config/brand'
import { DEFAULT_DESCRIPTION, SITE_URL } from '@/config/site'
import { HeroActions } from '@/features/marketing/auth-actions'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: BRAND_NAME,
    url: SITE_URL,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
    description: DEFAULT_DESCRIPTION,
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
  },
]

/** A placeholder landing page. The full page is built later. */
export default function LandingPage() {
  return (
    <div className="mx-auto flex max-w-[720px] flex-col items-start px-4 py-24 md:px-8 md:py-32">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="text-display text-fg md:text-display-xl">Turn your course files into a study plan.</h1>
      <p className="mt-5 max-w-[48ch] text-subheading font-normal text-fg-2">
        Upload lecture notes and past exams. {BRAND_NAME} builds notes, practice, quizzes and mock exams from them.
      </p>
      <HeroActions />
    </div>
  )
}
