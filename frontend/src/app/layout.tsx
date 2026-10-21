import type { Metadata, Viewport } from 'next'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import { Providers } from '@/components/shell/providers'
import { BRAND_DESCRIPTION, BRAND_NAME } from '@/config/brand'
import { SIDEBAR_INIT_SCRIPT } from '@/config/sidebar'
import './globals.css'

export const metadata: Metadata = {
  title: { default: BRAND_NAME, template: `%s - ${BRAND_NAME}` },
  description: BRAND_DESCRIPTION,
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafbfc' },
    { media: '(prefers-color-scheme: dark)', color: '#101215' },
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
