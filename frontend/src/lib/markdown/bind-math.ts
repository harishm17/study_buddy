/** The part of a hast tree (the HTML tree rehype plugins work on) this plugin looks at. */
export type HastNode = {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

const isElement = (node: HastNode, className: string) =>
  node.type === 'element' && Array.isArray(node.properties?.className) && (node.properties.className as string[]).includes(className)

/**
 * Keeps inline math and the characters stuck to it on one line: "$x$." or "($P(A)$)" or "$n$-th".
 * A formula is an atomic box, so the browser may break the line right after it and strand a full
 * stop or a comma on a line of its own. The formula and the unbroken text beside it go into one
 * no-wrap span; the space around it stays a normal break.
 */
export function rehypeBindMathPunctuation() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (!node.children || isElement(node, 'katex-display')) return
      const kids = node.children
      for (let i = 0; i < kids.length; i += 1) {
        const child = kids[i]
        if (isElement(child, 'katex')) {
          const wrapped: HastNode[] = [child]
          const before = kids[i - 1]
          const after = kids[i + 1]
          if (before?.type === 'text' && before.value) {
            const tail = /\S+$/.exec(before.value)
            if (tail) {
              before.value = before.value.slice(0, tail.index)
              wrapped.unshift({ type: 'text', value: tail[0] })
            }
          }
          if (after?.type === 'text' && after.value) {
            const head = /^\S+/.exec(after.value)
            if (head) {
              after.value = after.value.slice(head[0].length)
              wrapped.push({ type: 'text', value: head[0] })
            }
          }
          // The text that stays around the formula keeps its place; only the formula's slot is swapped.
          if (wrapped.length > 1) kids[i] = { type: 'element', tagName: 'span', properties: { className: ['math-bind'] }, children: wrapped }
        } else {
          walk(child)
        }
      }
    }
    walk(tree)
  }
}
