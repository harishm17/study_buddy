import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getSessionUser } from '@/server/session'

/** A placeholder landing page. The full page is built later. */
export default async function LandingPage() {
  const user = await getSessionUser()
  return (
    <div className="mx-auto flex max-w-[720px] flex-col items-start px-4 py-24 md:px-8 md:py-32">
      <h1 className="text-display-xl text-fg max-md:text-display">Turn your course files into a study plan.</h1>
      <p className="mt-5 max-w-[48ch] text-subheading font-normal text-fg-2">
        Upload lecture notes and past exams. Margins builds notes, practice, quizzes and mock exams from them.
      </p>
      <div className="mt-8 flex gap-3">
        {user ? (
          <Button asChild variant="primary" size="lg">
            <Link href="/home">Open Margins</Link>
          </Button>
        ) : (
          <>
            <Button asChild variant="primary" size="lg">
              <Link href="/signup">Get started</Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/login">Sign in</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
