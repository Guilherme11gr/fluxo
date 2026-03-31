"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { MermaidDiagram } from "./mermaid-diagram";

interface MarkdownViewerProps {
  value: string;
  className?: string;
}

export function MarkdownViewer({ value, className }: MarkdownViewerProps) {
  if (!value) return null;

  return (
    <div className={cn("text-sm text-foreground overflow-auto max-h-[60vh]", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => <h1 className="text-xl font-bold mt-4 mb-3 pb-1 border-b tracking-tight" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-lg font-semibold mt-4 mb-2 tracking-tight" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-base font-semibold mt-3 mb-2" {...props} />,
          p: ({ node, ...props }) => <p className="leading-relaxed mb-3 [&:not(:first-child)]:mt-3" {...props} />,
          ul: ({ node, ...props }) => <ul className="my-3 ml-6 list-disc [&>li]:mt-1" {...props} />,
          ol: ({ node, ...props }) => <ol className="my-3 ml-6 list-decimal [&>li]:mt-1" {...props} />,
          li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
          blockquote: ({ node, ...props }) => <blockquote className="mt-3 border-l-4 border-primary/30 pl-4 py-1 italic bg-muted/30 rounded-r text-muted-foreground" {...props} />,
          pre: ({ node, ref, ...props }: any) => (
            <div className="relative my-4 overflow-hidden rounded-lg bg-zinc-950 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800" {...props} />
          ),
          code: (props: any) => {
            const { children, className, node, ...rest } = props
            const match = /language-(\w+)/.exec(className || '')
            const isInline = !match && !props.className?.includes('language-') && !String(children).includes('\n');

            // Mermaid diagram blocks
            if (match?.[1] === "mermaid") {
              return <MermaidDiagram chart={String(children)} />;
            }

            return isInline ? (
              <code className="relative rounded bg-muted px-[0.4rem] py-[0.2rem] font-mono text-sm font-semibold text-foreground border border-border/50" {...rest}>
                {children}
              </code>
            ) : (
              <div className="overflow-x-auto p-6 w-full">
                <code className={cn("relative font-mono text-sm leading-relaxed text-zinc-50 dark:text-zinc-200 block min-w-full", className)} {...rest}>
                  {children}
                </code>
              </div>
            )
          },
          a: ({ node, ...props }) => <a className="font-medium text-primary underline underline-offset-4 hover:no-underline" {...props} />,
          hr: ({ node, ...props }) => <hr className="my-4 border-border" {...props} />,
          table: ({ node, ...props }) => <div className="my-4 w-full overflow-x-auto"><table className="w-full text-sm" {...props} /></div>,
          th: ({ node, ...props }) => <th className="border px-3 py-2 text-left font-bold [&[align=center]]:text-center [&[align=right]]:text-right bg-muted/50" {...props} />,
          td: ({ node, ...props }) => <td className="border px-3 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right" {...props} />,
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}
