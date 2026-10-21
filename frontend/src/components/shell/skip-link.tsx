/** First tab stop on every page: jumps over the sidebar to the main content. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-toast focus:rounded-control focus:bg-accent focus:px-3.5 focus:py-2 focus:text-body-strong focus:text-accent-fg focus:shadow-float"
    >
      Skip to content
    </a>
  )
}
