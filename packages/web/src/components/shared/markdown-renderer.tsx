/** Markdown renderer for public share views with GFM support and syntax highlighting */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface MarkdownRendererProps {
  content: string
  className?: string
}

/** Renders markdown content with GFM tables, code highlighting, and Tailwind prose styling */
export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`prose prose-invert prose-sm max-w-none
      prose-headings:text-neutral-100 prose-headings:font-semibold
      prose-h1:text-2xl prose-h1:mb-4 prose-h1:mt-8
      prose-h2:text-xl prose-h2:mb-3 prose-h2:mt-6
      prose-h3:text-lg prose-h3:mb-2 prose-h3:mt-4
      prose-p:text-neutral-300 prose-p:leading-relaxed
      prose-a:text-brand-400 prose-a:no-underline hover:prose-a:underline
      prose-strong:text-neutral-200
      prose-code:text-brand-300 prose-code:bg-surface-3 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
      prose-pre:bg-surface-2 prose-pre:border prose-pre:border-white/[0.06] prose-pre:rounded-lg
      prose-blockquote:border-brand-500/40 prose-blockquote:text-neutral-400
      prose-li:text-neutral-300 prose-li:marker:text-neutral-600
      prose-img:rounded-lg prose-img:border prose-img:border-white/[0.06]
      prose-table:border-collapse
      prose-th:bg-surface-3 prose-th:text-neutral-200 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-xs prose-th:font-medium prose-th:border prose-th:border-white/[0.06]
      prose-td:px-3 prose-td:py-2 prose-td:text-xs prose-td:text-neutral-400 prose-td:border prose-td:border-white/[0.06]
      prose-hr:border-white/[0.06]
      ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Lazy load images with error fallback
          img: ({ src, alt, ...props }) => (
            <img
              src={src}
              alt={alt || ''}
              loading="lazy"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
              }}
              {...props}
            />
          ),
          // Open external links in new tab
          a: ({ href, children, ...props }) => {
            const isExternal = href?.startsWith('http')
            return (
              <a
                href={href}
                {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                {...props}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
