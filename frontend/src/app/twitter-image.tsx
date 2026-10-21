import OpengraphImage, { alt as ogAlt, size as ogSize, contentType as ogContentType } from './opengraph-image'

// Next reads these exports statically, so they are declared here rather than re-exported.
export const alt = ogAlt
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default OpengraphImage
