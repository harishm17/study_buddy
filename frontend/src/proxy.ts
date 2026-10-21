import { NextResponse, type NextRequest } from 'next/server'

/**
 * Passes the requested path to server components in a header, so a layout can send a signed-out
 * visitor to /login?next=<where they were going>. Layouts cannot read the URL themselves.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set('x-pathname', request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|screens|.*\\.[a-zA-Z0-9]+$).*)'],
}
