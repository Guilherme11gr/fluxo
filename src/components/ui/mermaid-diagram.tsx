"use client";

import { useEffect, useRef, useId } from "react";
import mermaid from "mermaid";
import { cn } from "@/lib/utils";

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  securityLevel: "strict",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  themeVariables: {
    fontSize: "14px",
    lineColor: "hsl(var(--border))",
    primaryColor: "hsl(var(--primary) / 0.15)",
    primaryTextColor: "hsl(var(--foreground))",
    primaryBorderColor: "hsl(var(--primary) / 0.4)",
    secondaryColor: "hsl(var(--muted))",
    tertiaryColor: "hsl(var(--muted))",
    noteBkgColor: "hsl(var(--muted))",
    noteTextColor: "hsl(var(--foreground))",
    textColor: "hsl(var(--foreground))",
  },
});

interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

export function MermaidDiagram({ chart, className }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uniqueId = useId().replace(/:/g, "m");
  const errorRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || errorRef.current) return;

    const render = async () => {
      try {
        const { svg } = await mermaid.render(`mermaid-${uniqueId}`, chart.trim());
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          // Remove max-width constraint that mermaid adds
          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) {
            svgEl.removeAttribute("height");
            svgEl.style.maxWidth = "100%";
            svgEl.style.height = "auto";
          }
        }
      } catch {
        errorRef.current = true;
        if (containerRef.current) {
          containerRef.current.innerHTML = `
            <div class="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>Erro ao renderizar diagrama Mermaid</span>
            </div>
          `;
        }
      }
    };

    render();
  }, [chart, uniqueId]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "my-4 flex justify-center overflow-x-auto rounded-lg border bg-background p-6",
        className
      )}
    />
  );
}
