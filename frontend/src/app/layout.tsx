import type { Metadata, Viewport } from 'next'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import { Providers } from '@/components/shell/providers'
import { BRAND_NAME } from '@/config/brand'
import { SIDEBAR_INIT_SCRIPT } from '@/config/sidebar'
import { BRAND_COLORS, DEFAULT_DESCRIPTION, DEFAULT_TITLE, SITE_URL } from '@/config/site'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: DEFAULT_TITLE, template: `%s - ${BRAND_NAME}` },
  description: DEFAULT_DESCRIPTION,
  openGraph: { type: 'website', siteName: BRAND_NAME, title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
  twitter: { card: 'summary_large_image', title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: BRAND_COLORS.canvas },
    { media: '(prefers-color-scheme: dark)', color: BRAND_COLORS.canvasDark },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
