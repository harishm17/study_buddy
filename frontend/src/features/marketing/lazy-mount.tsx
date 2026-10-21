'use client'

import * as React from 'react'

/**
 * Renders its children once the box is within `rootMargin` of the viewport. Used for screenshots
 * and fonts far below the fold so that they do not compete with the first paint. The box keeps
 * the size you give it through `className`, so nothing shifts when the children arrive.
 */
export function LazyMount({
  children,
  className,
  rootMargin = '300px',
}: {
  children: React.ReactNode
  className?: string
  rootMargin?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [shown, setShown] = React.useState(false)

  React.useEffect(() => {
    const element = ref.current
    if (!element || shown) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true)
          observer.disconnect()
        }
      },
      { rootMargin }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [shown, rootMargin])

  return (
    <div ref={ref} className={className}>
      {shown ? children : null}
    </div>
  )
}
