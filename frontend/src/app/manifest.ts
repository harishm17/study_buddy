import type { MetadataRoute } from 'next'
import { BRAND_COLORS } from '@/config/site'
import { BRAND_NAME } from '@/config/brand'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    start_url: '/home',
    display: 'standalone',
    background_color: BRAND_COLORS.canvas,
    theme_color: BRAND_COLORS.accent,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
