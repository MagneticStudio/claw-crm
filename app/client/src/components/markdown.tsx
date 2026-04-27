// Shared compact markdown renderer used by the briefing + journal pages.
// Replaces Tailwind's `prose` typography (which is too large and serif-ish
// for this app's aesthetic) with components sized to match the rest of the
// UI: Montserrat, 11–14px, teal accents, tight line-heights.
//
// Also strips HTML comments before render so skeleton placeholders like
// `<!-- Roster of stakeholders... -->` don't leak into the read view.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useColors } from "@/App";

interface MarkdownProps {
  children: string;
}

// Strip HTML comments. Markdown skeletons use them as inline placeholders
// (e.g. the briefing template's `<!-- 2-3 sentences... -->`) and they should
// never appear in the rendered output.
function stripComments(src: string): string {
  return src.replace(/<!--[\s\S]*?-->/g, "");
}

export function Markdown({ children }: MarkdownProps) {
  const C = useColors();
  const cleaned = stripComments(children);

  return (
    <div className="text-[13px] leading-[1.5]" style={{ color: C.text, fontFamily: "Montserrat, sans-serif" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Document title — small + bold. The page header already shows the
          // contact name prominently, so the body's `# Name` doesn't need to
          // be huge.
          h1: ({ children }) => (
            <h1 className="text-[15px] font-semibold mt-0 mb-3" style={{ color: C.text }}>
              {children}
            </h1>
          ),
          // Section labels — uppercase tracked label, matches the visual
          // language of the rest of the app's section headers.
          h2: ({ children }) => (
            <h2
              className="text-[11px] font-semibold uppercase tracking-[0.12em] mt-4 mb-1.5"
              style={{ color: C.muted }}
            >
              {children}
            </h2>
          ),
          // Dated entries (`### YYYY-MM-DD: title`) and other subsections.
          h3: ({ children }) => (
            <h3 className="text-[12px] font-semibold mt-3 mb-1" style={{ color: C.accentDark }}>
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-[12px] font-semibold mt-2 mb-1" style={{ color: C.text }}>
              {children}
            </h4>
          ),
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-2 pl-4 list-disc space-y-0.5 marker:text-[10px]">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 pl-4 list-decimal space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="leading-[1.5]">{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:opacity-70"
              style={{ color: C.accentDark }}
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold" style={{ color: C.text }}>
              {children}
            </strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 pl-3 italic" style={{ borderLeft: `2px solid ${C.border}`, color: C.muted }}>
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const isBlock = (className || "").startsWith("language-");
            if (isBlock) {
              return (
                <code
                  className="block p-2 my-2 rounded text-[11px] leading-snug whitespace-pre-wrap font-mono overflow-x-auto"
                  style={{ backgroundColor: C.accentLight, color: C.text }}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className="px-1 py-px rounded text-[12px] font-mono"
                style={{ backgroundColor: C.accentLight, color: C.text }}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="my-2">{children}</pre>,
          hr: () => <hr className="my-3" style={{ borderColor: C.border }} />,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="text-[12px] border-collapse" style={{ borderColor: C.border }}>
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              className="text-left font-semibold px-2 py-1 border"
              style={{ borderColor: C.border, backgroundColor: C.accentLight }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-2 py-1 border" style={{ borderColor: C.border }}>
              {children}
            </td>
          ),
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}
