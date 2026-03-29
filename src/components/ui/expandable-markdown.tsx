"use client";

import { useState, useRef, useEffect } from "react";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ExpandableMarkdownProps {
    value: string;
    className?: string;
    maxLines?: number; // Approximate, managed via max-height
}

export function ExpandableMarkdown({ value, className, maxLines = 4 }: ExpandableMarkdownProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showToggle, setShowToggle] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    // Approximate line height ~ 1.5rem (24px). 4 lines ~ 6rem (96px).
    // We can use -webkit-line-clamp for Webkit browsers, but measuring is safer for the toggle.
    // Let's rely on a max-height check first.
    const collapsedMaxHeight = "6rem"; // 4 lines * 1.5rem

    useEffect(() => {
        if (contentRef.current) {
            // Check if content exceeds the collapsed height
            // We momentarily unset max-height to measure full height? 
            // Or we just check if scrollHeight > clientHeight when collapsed.
            // But if it's already expanded, we don't know if it *would* be truncated.
            // Best approach: Measure full height always.

            const fullHeight = contentRef.current.scrollHeight;
            // 96px is approx 6rem.
            if (fullHeight > 100) {
                setShowToggle(true);
            } else {
                setShowToggle(false);
            }
        }
    }, [value]);

    if (!value) return null;

    return (
        <div className={cn("relative", className)}>
            <div
                ref={contentRef}
                className={cn(
                    "overflow-hidden transition-all duration-300 ease-in-out",
                    !isExpanded && "max-h-[6rem] mask-image-b"
                )}
                style={{
                    // Optional: smoother transition if max-height is animated, but auto is tricky.
                    // For now, just toggling class.
                }}
            >
                <MarkdownViewer value={value} className="!max-h-none" />
            </div>

            {showToggle && (
                <Button
                    variant="link"
                    size="sm"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="px-0 h-auto mt-1 font-medium text-primary hover:no-underline"
                >
                    {isExpanded ? (
                        <span className="flex items-center gap-1">
                            Ver menos <ChevronUp className="w-3 h-3" />
                        </span>
                    ) : (
                        <span className="flex items-center gap-1">
                            Ver mais <ChevronDown className="w-3 h-3" />
                        </span>
                    )}
                </Button>
            )}
        </div>
    );
}
