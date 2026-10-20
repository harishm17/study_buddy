/**
 * Heading ids for rendered markdown, and the outline built from the same text. The Markdown
 * component gives every heading an id from `createSlugger`; a page that wants an "On this
 * page" list calls `extractOutline` on the same source and gets matching ids.
 */

export function slugifyHeading(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-') || 'section'
  )
}

/** Hands out unique ids: "overview", then "overview-1" for a repeat. */
export function createSlugger() {
  const used = new Map<string, number>()
  return (text: string): string => {
    const base = slugifyHeading(text)
    const count = used.get(base) ?? 0
    used.set(base, count + 1)
    return count === 0 ? base : `${base}-${count}`
  }
}

export type OutlineItem = { id: string; text: string; level: number }

/** Drop the markdown that does not survive rendering, so the text matches the heading's text. */
const plainHeadingText = (raw: string): string =>
  raw
    .replace(/\s+#+\s*$/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\\(.)/g, '$1')
    .trim()

/** Headings of level 1 to `maxLevel` outside code fences, with the ids the renderer will use. */
export function extractOutline(markdown: string, maxLevel = 2): OutlineItem[] {
  const slug = createSlugger()
  const items: OutlineItem[] = []
  let fence: string | null = null

  for (const line of markdown.split('\n')) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line)
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0]
      else if (fenceMatch[1][0] === fence) fence = null
      continue
    }
    if (fence) continue
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (!heading) continue
    const text = plainHeadingText(heading[2])
    const id = slug(text)
    if (heading[1].length <= maxLevel) items.push({ id, text, level: heading[1].length })
  }
  return items
}
