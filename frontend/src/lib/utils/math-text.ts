/**
 * Keeps money and prose out of math mode, before remark-math reads the text.
 *
 * Models write `\$100` for money and sometimes `$-\$100$` or `$500 if i + j = 7 and -$100 otherwise`;
 * remark-math then pairs the wrong dollar signs and prints `-\100$`. They also wrap a phrase in
 * `$...$` (`$Game Y$`), which KaTeX sets as `GameY`. This rewrites each line so that:
 *
 *  - a `$` followed by a digit that cannot open real math (no closing `$` on the line, a closing `$`
 *    that is followed by a digit or preceded by a space, or a span that reads as prose) is currency
 *    and becomes `\$`;
 *  - a `\$` inside a `$...$` span stays a dollar sign in KaTeX, without ending the span early;
 *  - a `$...$` span holding only words is written as plain text.
 *
 * Code (fenced or inline) and display math (`$$...$$`) are left alone.
 */

// Code fences, display math and inline code, kept as they are.
const PROTECTED = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|\$\$[\s\S]*?\$\$|`[^`\n]*`)/g

// KaTeX sets a bare `\$` fine, but the `$` would end a markdown math span, so spell it by code.
const DOLLAR_IN_MATH = '\\char"24 '

// Words that are math on their own, so `$sin x$` is not mistaken for prose.
const MATH_WORDS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'exp', 'max', 'min', 'lim', 'sup', 'inf',
  'det', 'dim', 'ker', 'mod', 'gcd', 'lcm', 'arg', 'var', 'cov', 'sgn', 'tr',
])

const isDigit = (char: string | undefined) => char !== undefined && char >= '0' && char <= '9'
const isSpace = (char: string | undefined) => char !== undefined && /\s/.test(char)

/** The index of the next `$` that is not escaped and not part of `$$`, or -1. */
function findCloser(line: string, from: number): number {
  for (let i = from; i < line.length; i++) {
    if (line[i] === '\\') {
      i++
    } else if (line[i] === '$') {
      return line[i + 1] === '$' ? -1 : i
    }
  }
  return -1
}

/** Two or more words of three letters or more, and none of the characters math is made of. */
function readsAsProse(content: string): boolean {
  if (/[\\^_=]/.test(content)) return false
  return (content.match(/[A-Za-z]{3,}/g) ?? []).filter((word) => !MATH_WORDS.has(word.toLowerCase())).length >= 2
}

/** Words and spaces only, with at least one real word: `Game Y`, not `x y`, `HHH THH` or `\alpha`. */
function isPhrase(content: string): boolean {
  if (!/^[A-Za-z' ]+$/.test(content) || !/\S\s+\S/.test(content)) return false
  return (content.match(/[A-Za-z]{3,}/g) ?? []).some(
    (word) => /[a-z]/.test(word) && !MATH_WORDS.has(word.toLowerCase())
  )
}

function protectLine(line: string): string {
  if (!line.includes('$')) return line
  let out = ''
  let i = 0
  while (i < line.length) {
    const char = line[i]
    if (char === '\\') {
      out += line.slice(i, i + 2)
      i += 2
      continue
    }
    if (char !== '$') {
      out += char
      i++
      continue
    }
    if (line[i + 1] === '$') {
      out += '$$'
      i += 2
      continue
    }
    if (i + 1 >= line.length || isSpace(line[i + 1])) {
      out += char
      i++
      continue
    }

    const close = findCloser(line, i + 1)
    const digitFirst = isDigit(line[i + 1])
    if (close === -1) {
      out += digitFirst ? '\\$' : char
      i++
      continue
    }

    const content = line.slice(i + 1, close)
    const badCloser = isDigit(line[close + 1]) || isSpace(line[close - 1])
    if (digitFirst && (badCloser || readsAsProse(content))) {
      out += '\\$'
      i++
      continue
    }
    if (!digitFirst && isPhrase(content)) {
      out += content
      i = close + 1
      continue
    }
    out += `$${content.replace(/\\\$/g, DOLLAR_IN_MATH)}$`
    i = close + 1
  }
  return out
}

/** The text with currency and prose protected from math mode, as described above. */
export function protectMathText(text: string): string {
  if (!text.includes('$')) return text
  return text
    .split(PROTECTED)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part
            .split('\n')
            .map(protectLine)
            .join('\n')
    )
    .join('')
}
