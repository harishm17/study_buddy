
/**
 * A place in the student's files: a file and, for formats with pages, a page range. Topic
 * sources ("From lecture3.pdf, pp. 4-9") and the sources of a worked example, practice problem,
 * quiz question or exam question all have this shape. `materialId` links to the file viewer
 * (`viewerUrl` in `src/lib/chat/citations.ts` takes `{ materialId, filename, pageStart }`).
 */
export type SourceRef = {
  materialId: string | null
  filename: string
  pageStart: number | null
  pageEnd: number | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/**
 * `sources` of a generated item as stored (snake_case): [{ material_id, filename, page_start,
 * page_end }]. Entries without a file name are dropped; anything that is not a list gives [].
 */
export function parseSources(value: unknown): SourceRef[] {
  const sources: SourceRef[] = []
  for (const item of Array.isArray(value) ? value : []) {
    if (!isRecord(item)) continue
    const filename = typeof item.filename === 'string' ? item.filename.trim() : ''
    if (!filename) continue
    const page = (raw: unknown) => (typeof raw === 'number' && Number.isFinite(raw) ? raw : null)
    sources.push({
      materialId: typeof item.material_id === 'string' && item.material_id ? item.material_id : null,
      filename,
      pageStart: page(item.page_start),
      pageEnd: page(item.page_end) ?? page(item.page_start),
    })
  }
  return sources
}

/**
 * Wording and merging for source references: "From lecture3.pdf, p. 4" under a worked example,
 * "lecture3.pdf, pp. 4-9" in a topic header. Plain functions, usable on the server and in the
 * browser.
 */

/** "p. 4", "pp. 4-9", or "" for a file without pages. */
export function formatPages(pageStart: number | null, pageEnd: number | null): string {
  if (pageStart === null) return ''
  if (pageEnd === null || pageEnd === pageStart) return `p. ${pageStart}`
  return `pp. ${pageStart}-${pageEnd}`
}

/** "lecture3.pdf, pp. 4-9" (just the file name when it has no pages). */
export function sourceText(source: Pick<SourceRef, 'filename' | 'pageStart' | 'pageEnd'>): string {
  const pages = formatPages(source.pageStart, source.pageEnd)
  return pages ? `${source.filename}, ${pages}` : source.filename
}

/** "From lecture3.pdf, p. 4": the line under a worked example, practice problem or review item. */
export const fromLabel = (source: Pick<SourceRef, 'filename' | 'pageStart' | 'pageEnd'>): string => `From ${sourceText(source)}`

/** "From lecture3.pdf, p. 4 and notes.pdf, p. 2" for an item with several sources. */
export function fromLine(sources: readonly SourceRef[]): string {
  const texts = sources.map(sourceText)
  return texts.length === 0 ? '' : `From ${texts.join(' and ')}`
}

/**
 * One entry per file with its pages merged: ranges that touch or overlap become one, the rest
 * stay apart, in page order. Files keep the order they first appear in.
 */
export function mergeSources(sources: readonly SourceRef[]): SourceRef[] {
  const files = new Map<string, SourceRef[]>()
  for (const source of sources) {
    const key = source.materialId ?? source.filename
    const group = files.get(key)
    if (group) group.push(source)
    else files.set(key, [source])
  }
  const merged: SourceRef[] = []
  for (const group of files.values()) {
    const paged = group
      .filter((source) => source.pageStart !== null)
      .sort((a, b) => (a.pageStart as number) - (b.pageStart as number))
    const ranges: SourceRef[] = []
    for (const source of paged) {
      const last = ranges[ranges.length - 1]
      const end = source.pageEnd ?? (source.pageStart as number)
      if (last && (source.pageStart as number) <= (last.pageEnd ?? (last.pageStart as number)) + 1) {
        last.pageEnd = Math.max(last.pageEnd ?? (last.pageStart as number), end)
      } else {
        ranges.push({ ...source, pageEnd: end })
      }
    }
    merged.push(...(ranges.length > 0 ? ranges : [{ ...group[0], pageStart: null, pageEnd: null }]))
  }
  return merged
}
