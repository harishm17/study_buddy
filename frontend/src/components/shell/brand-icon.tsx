import { BookOpenText } from '@phosphor-icons/react/dist/ssr'
import { BRAND_COLORS } from '@/config/site'

/** The brand tile at any size, for next/og images (icons, social cards). Inline styles only. */
export function BrandIcon({ size, radius }: { size: number; radius?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? Math.round(size * 0.29),
        background: BRAND_COLORS.accent,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <BookOpenText weight="fill" size={Math.round(size * 0.58)} color={BRAND_COLORS.accentFg} />
    </div>
  )
}
