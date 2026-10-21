import Image from 'next/image'
import { cn } from '@/lib/utils'

type ThemedImageProps = {
  /** File stem in public/screens: `notes` serves notes-light.webp and notes-dark.webp. */
  name: string
  width: number
  height: number
  alt: string
  sizes: string
  /** Preloads the light image (the dark one loads when it is first shown). */
  priority?: boolean
  className?: string
}

/** A product screenshot in the light or dark version, switched with the theme class on <html>. */
export function ThemedImage({ name, width, height, alt, sizes, priority, className }: ThemedImageProps) {
  return (
    <>
      <Image
        src={`/screens/${name}-light.webp`}
        width={width}
        height={height}
        alt={alt}
        sizes={sizes}
        priority={priority}
        className={cn('dark:hidden', className)}
      />
      <Image
        src={`/screens/${name}-dark.webp`}
        width={width}
        height={height}
        alt={alt}
        sizes={sizes}
        loading="lazy"
        className={cn('hidden dark:block', className)}
      />
    </>
  )
}
