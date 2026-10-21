import type { Metadata } from 'next'
import { BRAND_NAME } from '@/config/brand'
import { DEFAULT_DESCRIPTION, SITE_URL } from '@/config/site'
import { FinalCta, HeroActions } from '@/features/marketing/auth-actions'
import { LazyMount } from '@/features/marketing/lazy-mount'
import { ThemedImage } from '@/features/marketing/themed-image'
import '@/features/marketing/landing.css'

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

const sectionPad = 'mx-auto w-full max-w-[1120px] px-4 md:px-8'

function Hero() {
  return (
    <section className="overflow-hidden">
      <div className="pb-14 pt-8 md:pb-16 md:pt-14 lg:flex lg:items-center lg:gap-10 lg:pb-16 lg:pl-8 min-[1280px]:gap-12 min-[1440px]:gap-14 min-[1440px]:pl-[max(32px,calc((100vw-1280px)/2+32px))]">
        <div className="px-4 md:px-8 lg:w-[400px] lg:shrink-0 lg:p-0 min-[1280px]:w-[440px] min-[1440px]:w-[460px]">
          <h1 className="text-balance text-[38px] font-semibold leading-[44px] tracking-[-0.025em] text-fg md:text-display-xl">
            Turn your course files into a study plan.
          </h1>
          <p className="mt-5 max-w-[34ch] text-[17px] leading-[27px] text-fg-2">
            Upload lecture notes and past exams. {BRAND_NAME} builds notes, practice, quizzes and mock exams from them.
          </p>
          <HeroActions />
        </div>
        <div className="mt-12 px-4 md:px-8 lg:mt-0 lg:min-w-0 lg:flex-1 lg:p-0">
          <div className="overflow-hidden rounded-card border border-border bg-surface shadow-float lg:w-[700px] lg:max-w-none min-[1280px]:w-[820px] min-[1440px]:w-[960px]">
            <ThemedImage
              name="notes"
              width={1600}
              height={1000}
              priority
              fetchPriority="high"
              alt="Margins notes page showing Graph traversal notes with sources"
              sizes="(min-width: 1440px) 960px, (min-width: 1280px) 820px, (min-width: 1024px) 700px, 100vw"
              className="h-auto w-full"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

const STEPS = [
  { title: 'Upload your materials', text: 'Add lecture notes, past exams and book chapters as PDF, Word or PowerPoint files.' },
  {
    title: 'Check the topics',
    text: `${BRAND_NAME} finds the topics in your files. Rename, merge or remove any before you confirm.`,
  },
  { title: 'Study, practise, test', text: 'Read the notes, work through examples, take quizzes, then sit a timed mock exam.' },
]

function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className={`${sectionPad} py-16 md:py-20`}>
      <h2 id="how-heading" className="text-[30px] font-semibold leading-9 tracking-[-0.02em] text-fg md:text-display">
        How it works
      </h2>
      <ol className="mt-10 border-t border-border">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="grid gap-x-12 gap-y-8 border-b border-border py-10 md:grid-cols-12 md:items-center md:py-12"
          >
            <div className={index === 1 ? 'md:order-2 md:col-span-5' : 'md:col-span-6'}>
              <span className="tabular grid size-7 place-items-center rounded-full border border-border-strong text-small text-fg-2">
                {index + 1}
              </span>
              <h3 className="mt-4 text-title text-fg">{step.title}</h3>
              <p className="mt-2 max-w-[44ch] text-[17px] leading-[27px] text-fg-2">{step.text}</p>
            </div>
            {index === 1 ? (
              <div className="md:order-1 md:col-span-7">
                <LazyMount className="aspect-[1100/557] overflow-hidden rounded-card border border-border bg-surface">
                  <ThemedImage
                    name="topics-edit"
                    width={1100}
                    height={557}
                    alt="Margins topic editor listing seven topics found in a course, each with keywords"
                    sizes="(min-width: 1152px) 640px, (min-width: 768px) 55vw, calc(100vw - 34px)"
                    className="h-auto w-full"
                  />
                </LazyMount>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  )
}

const cell = 'flex flex-col overflow-hidden rounded-card border border-border bg-surface'

function CellText({ title, text }: { title: string; text: string }) {
  return (
    <div className="p-6 pb-5">
      <h3 className="text-heading text-fg">{title}</h3>
      <p className="mt-1.5 max-w-[46ch] text-small text-fg-2">{text}</p>
    </div>
  )
}

/** A screenshot peeking out of the bottom of a cell: framed on top and the sides, cut by the cell edge. */
function CellShot({
  name,
  width,
  height,
  alt,
  sizes,
  heightClass,
}: {
  name: string
  width: number
  height: number
  alt: string
  sizes: string
  heightClass: string
}) {
  return (
    <div className="mt-auto px-6">
      <LazyMount className={`overflow-hidden rounded-t-control border border-b-0 border-border ${heightClass}`}>
        <ThemedImage name={name} width={width} height={height} alt={alt} sizes={sizes} className="h-auto w-full" />
      </LazyMount>
    </div>
  )
}

function Bento() {
  return (
    <section aria-labelledby="bento-heading" className={`${sectionPad} py-16 md:py-20`}>
      <h2 id="bento-heading" className="text-[30px] font-semibold leading-9 tracking-[-0.02em] text-fg md:text-display">
        What you get
      </h2>
      <div className="mt-10 grid gap-4 md:grid-cols-12">
        <div className={`${cell} md:col-span-7`}>
          <CellText
            title="Notes with sources"
            text="Written from your own files, with code, maths and the pages they came from."
          />
          <CellShot
            name="notes-detail"
            width={1200}
            height={842}
            alt="Margins notes with a Python code block, an outline of the page and a list of source files"
            sizes="(min-width: 1152px) 560px, (min-width: 768px) 55vw, calc(100vw - 82px)"
            heightClass="h-[260px] md:h-[330px]"
          />
        </div>
        <div className={`${cell} md:col-span-5`}>
          <CellText title="Practice that checks each step" text="Work a problem one step at a time, with hints and feedback on every answer." />
          <CellShot
            name="practice"
            width={1000}
            height={878}
            alt="Margins practice problem with two solved steps, a hint and an answer box"
            sizes="(min-width: 1152px) 400px, (min-width: 768px) 40vw, calc(100vw - 82px)"
            heightClass="h-[260px] md:h-[330px]"
          />
        </div>
        <div className={`${cell} md:col-span-5`}>
          <CellText title="Quizzes graded with feedback" text="Short answers are graded too, with a note on what was missing." />
          <CellShot
            name="quiz-results"
            width={1000}
            height={885}
            alt="Margins quiz results showing 75 percent, 9 of 12 points, with the answer and explanation for a missed question"
            sizes="(min-width: 1152px) 400px, (min-width: 768px) 40vw, calc(100vw - 82px)"
            heightClass="h-[260px] md:h-[360px]"
          />
        </div>
        <div className={`${cell} md:col-span-7`}>
          <CellText title="Ask your materials, with citations" text="Answers come only from your files. Hover a number to see the passage it came from." />
          <CellShot
            name="ask"
            width={1000}
            height={988}
            alt="Margins answer about BFS and DFS with a citation card showing the quoted passage and its page"
            sizes="(min-width: 1152px) 560px, (min-width: 768px) 55vw, calc(100vw - 82px)"
            heightClass="h-[260px] md:h-[360px]"
          />
        </div>
        <div className="flex flex-col justify-between gap-8 overflow-hidden rounded-card bg-accent-soft p-6 md:col-span-12 md:flex-row md:items-center md:gap-12 md:p-10">
          <div className="max-w-[40ch]">
            <h3 className="text-heading text-accent-soft-fg">Mock exams with a real timer</h3>
            <p className="mt-1.5 text-small text-accent-soft-fg">
              Pick your topics and a time limit, then sit the exam under real conditions. Answers save as you go.
            </p>
          </div>
          <LazyMount className="h-[72px] shrink-0 md:h-[112px] md:w-[400px]">
            <p
              aria-hidden="true"
              className="tabular font-mono text-[72px] font-medium leading-none tracking-[-0.04em] text-accent-soft-fg md:text-right md:text-[112px]"
            >
              41:07
            </p>
          </LazyMount>
        </div>
      </div>
    </section>
  )
}

function VoiceBand() {
  return (
    <section aria-labelledby="voice-heading" className="bg-surface-2">
      <div className={`${sectionPad} flex flex-col items-start gap-10 py-16 md:flex-row md:items-center md:gap-16 md:py-24`}>
        <div aria-hidden="true" className="relative grid size-32 shrink-0 place-items-center">
          <span className="voice-orb-ring absolute inset-0 rounded-full border border-accent" />
          <span className="absolute inset-0 rounded-full border border-border bg-accent-soft" />
          <span className="voice-orb-core relative size-14 rounded-full bg-accent" />
        </div>
        <div className="max-w-[56ch]">
          <h2 id="voice-heading" className="text-[30px] font-semibold leading-9 tracking-[-0.02em] text-fg md:text-display">
            Explain it out loud
          </h2>
          <p className="mt-3 text-[17px] leading-[27px] text-fg-2">
            Voice review asks you questions about a topic and listens to your spoken answers. You hear what you got
            right and what to go back to, like practising with a study partner.
          </p>
        </div>
      </div>
    </section>
  )
}

/** The landing page: static, with the signed-in state read in the browser by small client islands. */
export default function LandingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Hero />
      <HowItWorks />
      <Bento />
      <VoiceBand />
      <p className="mx-auto max-w-[1120px] px-4 py-12 text-center text-small text-fg-2 md:px-8">
        Your files stay in your account. Delete a course and its files go with it.
      </p>
      <section aria-labelledby="cta-heading" className="border-t border-border px-4 py-20 text-center md:py-28">
        <h2 id="cta-heading" className="text-[30px] font-semibold leading-9 tracking-[-0.02em] text-fg md:text-display">
          Start with one course.
        </h2>
        <div className="mt-8 flex justify-center">
          <FinalCta />
        </div>
      </section>
    </>
  )
}
