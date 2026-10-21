import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The design's own type sizes, colours and layers have to be known to tailwind-merge,
// otherwise `text-small text-fg` would be read as two conflicting text sizes.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'display-xl',
        'display',
        'title',
        'heading',
        'subheading',
        'body',
        'body-strong',
        'small',
        'caption',
        'reading',
        'reading-h2',
        'reading-h3',
        'code',
      ],
      radius: ['chip', 'control', 'card'],
      shadow: ['float', 'tiny'],
      ease: ['enter', 'leave'],
      animate: [
        'fade-in',
        'fade-out',
        'pop-in',
        'pop-out',
        'dialog-in',
        'dialog-out',
        'sheet-in-right',
        'sheet-out-right',
        'sheet-in-left',
        'sheet-out-left',
        'sheet-in-bottom',
        'sheet-out-bottom',
        'slide-in',
        'shimmer',
        'indeterminate',
        'caret',
      ],
    },
    classGroups: {
      z: [{ z: ['sticky', 'sidebar', 'topbar', 'dropdown', 'overlay', 'modal', 'popper', 'toast'] }],
    },
  },
})

/** Merge class names; later Tailwind utilities win over earlier conflicting ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const SUPPORTED_MATERIAL_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.doc']

/** Validate file type for supported study materials. */
export function isValidStudyMaterial(file: { name: string }): boolean {
  const filename = file.name.toLowerCase()
  return SUPPORTED_MATERIAL_EXTENSIONS.some((ext) => filename.endsWith(ext))
}

/** Validate file size against a limit in MB. */
export function isValidFileSize(file: { size: number }, maxSizeMB = 25): boolean {
  return file.size <= maxSizeMB * 1024 * 1024
}
