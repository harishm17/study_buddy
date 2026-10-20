/**
 * Move one id to a new position in an ordered list of ids. The position is clamped to the
 * ends. Returns a new list; an unknown id leaves the order unchanged.
 */
export function moveInOrder(ids: string[], id: string, toIndex: number): string[] {
  const from = ids.indexOf(id)
  if (from === -1) return [...ids]
  const without = ids.filter((other) => other !== id)
  const target = Math.max(0, Math.min(Math.trunc(toIndex), without.length))
  return [...without.slice(0, target), id, ...without.slice(target)]
}

/** Union of two string lists, keeping first-seen order and dropping case-insensitive repeats. */
export function mergeKeywordLists(first: string[], second: string[]): string[] {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const keyword of [...first, ...second]) {
    const key = keyword.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(keyword.trim())
  }
  return merged
}
