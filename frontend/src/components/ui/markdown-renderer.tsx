'use client'

// The heavy part of markdown rendering: react-markdown, the remark and rehype plugins,
// KaTeX and Prism. Nothing imports this file directly. components/ui/markdown.tsx loads it
// with next/dynamic so these libraries stay out of each page's first load.

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light'
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c'
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp'
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'

// Code blocks in other languages are shown without highlighting.
SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('c', c)
SyntaxHighlighter.registerLanguage('cpp', cpp)
SyntaxHighlighter.registerLanguage('java', java)
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('sql', sql)
SyntaxHighlighter.registerLanguage('typescript', typescript)

const LANGUAGE_ALIASES: Record<string, string> = {
  'c++': 'cpp',
  cc: 'cpp',
  h: 'c',
  hpp: 'cpp',
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  python3: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  mysql: 'sql',
  postgres: 'sql',
  postgresql: 'sql',
  sqlite: 'sql',
}

const normalizeLanguage = (language: string) => {
  const lower = language.toLowerCase()
  return LANGUAGE_ALIASES[lower] ?? lower
}

const REMARK_PLUGINS = [remarkGfm, remarkMath]
const REHYPE_PLUGINS = [rehypeKatex]

const INLINE_DISALLOWED_ELEMENTS = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'img',
]

const BLOCK_COMPONENTS = {
  code({ className, children, ...props }: any) {
    const match = /language-([\w+#-]+)/.exec(className || '')
    return match ? (
      <SyntaxHighlighter
        style={vscDarkPlus}
        language={normalizeLanguage(match[1])}
        PreTag="div"
        {...props}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
}

const INLINE_COMPONENTS = {
  code({ children, ...props }: any) {
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono" {...props}>
        {children}
      </code>
    )
  },
  a({ children, ...props }: any) {
    return (
      <a className="underline underline-offset-4 hover:text-primary" {...props}>
        {children}
      </a>
    )
  },
}

export default function MarkdownRenderer({
  content,
  inline = false,
}: {
  content: string
  inline?: boolean
}) {
  if (inline) {
    return (
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        disallowedElements={INLINE_DISALLOWED_ELEMENTS}
        unwrapDisallowed
        components={INLINE_COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    )
  }

  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={BLOCK_COMPONENTS}
    >
      {content}
    </ReactMarkdown>
  )
}
