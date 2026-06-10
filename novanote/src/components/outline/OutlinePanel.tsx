import { useMemo, useState, useEffect, useCallback, useRef } from "react";

interface Heading {
  id: string;
  level: number;
  text: string;
  lineIndex: number;
}

interface OutlinePanelProps {
  content: string;
  onHeadingClick: (headingId: string) => void;
}

function parseHeadings(content: string): Heading[] {
  const lines = content.split("\n");
  const headings: Heading[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = `heading-${i}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      headings.push({ id, level, text, lineIndex: i });
    }
  }

  return headings;
}

export default function OutlinePanel({ content, onHeadingClick }: OutlinePanelProps) {
  const headings = useMemo(() => parseHeadings(content), [content]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const scrollObserverRef = useRef<MutationObserver | null>(null);

  // Determine which heading is currently visible based on editor scroll
  const updateActiveHeading = useCallback(() => {
    const editorEl = document.querySelector(".editor-content .ProseMirror");
    if (!editorEl) return;

    const headingEls = editorEl.querySelectorAll("h1, h2, h3, h4, h5, h6");
    if (headingEls.length === 0) return;

    const editorRect = editorEl.getBoundingClientRect();
    const midline = editorRect.top + editorRect.height * 0.3;

    let closestId: string | null = null;
    let closestDist = Infinity;

    headingEls.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.top - midline);
      if (dist < closestDist && rect.top <= midline + rect.height) {
        closestDist = dist;
        closestId = el.id || null;
      }
    });

    // Fallback: find the last heading that is above the midline
    if (!closestId) {
      const headingArray = Array.from(headingEls);
      const aboveHeadings = headingArray.filter(
        (el) => el.getBoundingClientRect().top <= midline
      );
      if (aboveHeadings.length > 0) {
        closestId = aboveHeadings[aboveHeadings.length - 1].id || null;
      }
    }

    if (closestId) {
      setActiveHeadingId(closestId);
    }
  }, []);

  // Set up scroll listener on the editor container
  useEffect(() => {
    const editorContainer = document.querySelector(".editor-content");
    if (!editorContainer) return;

    editorContainer.addEventListener("scroll", updateActiveHeading);
    // Also observe DOM mutations (content changes)
    scrollObserverRef.current = new MutationObserver(() => {
      // Re-assign IDs to heading elements after content changes
      const editorEl = editorContainer.querySelector(".ProseMirror");
      if (editorEl) {
        const headingEls = editorEl.querySelectorAll("h1, h2, h3, h4, h5, h6");
        headingEls.forEach((el) => {
          if (!el.id) {
            const text = el.textContent || "";
            const id = `heading-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            el.id = id;
          }
        });
      }
    });
    scrollObserverRef.current.observe(editorContainer, {
      childList: true,
      subtree: true,
    });

    return () => {
      editorContainer.removeEventListener("scroll", updateActiveHeading);
      scrollObserverRef.current?.disconnect();
    };
  }, [updateActiveHeading, content]);

  // Assign IDs to heading elements when content changes
  useEffect(() => {
    const timer = setTimeout(() => {
      const editorEl = document.querySelector(".editor-content .ProseMirror");
      if (!editorEl) return;
      const headingEls = editorEl.querySelectorAll("h1, h2, h3, h4, h5, h6");
      const parsedHeadings = parseHeadings(content);

      headingEls.forEach((el, idx) => {
        if (idx < parsedHeadings.length) {
          el.id = parsedHeadings[idx].id;
        }
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [content]);

  const handleClick = (heading: Heading) => {
    setActiveHeadingId(heading.id);
    onHeadingClick(heading.id);
  };

  const levelLabels = ["H1", "H2", "H3", "H4", "H5", "H6"];

  if (headings.length === 0) {
    return (
      <div
        className="flex flex-col h-full"
        style={{
          width: "220px",
          minWidth: "180px",
          backgroundColor: "var(--bg-sidebar)",
          borderLeft: "1px solid var(--border-color)",
        }}
      >
        <div
          className="px-3 py-2 border-b text-xs font-semibold uppercase tracking-wider"
          style={{
            borderColor: "var(--border-color)",
            color: "var(--text-muted)",
          }}
        >
          Outline
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
            No headings found
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{
        width: "220px",
        minWidth: "180px",
        backgroundColor: "var(--bg-sidebar)",
        borderLeft: "1px solid var(--border-color)",
      }}
    >
      <div
        className="px-3 py-2 border-b text-xs font-semibold uppercase tracking-wider"
        style={{
          borderColor: "var(--border-color)",
          color: "var(--text-muted)",
        }}
      >
        Outline
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {headings.map((heading) => (
          <button
            key={heading.id}
            onClick={() => handleClick(heading)}
            className="w-full text-left border-none cursor-pointer transition-colors"
            style={{
              backgroundColor:
                activeHeadingId === heading.id
                  ? "var(--bg-hover)"
                  : "transparent",
              color:
                activeHeadingId === heading.id
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              paddingLeft: `${8 + (heading.level - 1) * 12}px`,
              paddingRight: "8px",
              paddingTop: "4px",
              paddingBottom: "4px",
              fontSize: heading.level === 1 ? "13px" : "12px",
              fontWeight: heading.level <= 2 ? 600 : 400,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            onMouseEnter={(e) => {
              if (activeHeadingId !== heading.id) {
                e.currentTarget.style.backgroundColor = "var(--bg-hover)";
              }
            }}
            onMouseLeave={(e) => {
              if (activeHeadingId !== heading.id) {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          >
            <span
              className="shrink-0 rounded text-center"
              style={{
                fontSize: "9px",
                fontWeight: 700,
                width: "20px",
                padding: "1px 2px",
                backgroundColor:
                  activeHeadingId === heading.id
                    ? "var(--text-primary)"
                    : "var(--bg-hover)",
                color:
                  activeHeadingId === heading.id
                    ? "var(--bg-primary)"
                    : "var(--text-muted)",
                lineHeight: "1.2",
              }}
            >
              {levelLabels[heading.level - 1]}
            </span>
            <span
              className="truncate"
              style={{ lineHeight: "1.4" }}
            >
              {heading.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
