import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Editor } from "@tiptap/react";
import type { NoteMeta } from "../../types";

interface WikilinkSuggestionProps {
  editor: Editor | null;
}

export default function WikilinkSuggestion({ editor }: WikilinkSuggestionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const allNotesRef = useRef<NoteMeta[]>([]);
  const triggerPosRef = useRef<number | null>(null);

  const loadNotes = useCallback(async () => {
    try {
      const noteList: NoteMeta[] = await invoke("vault_list_notes");
      allNotesRef.current = noteList;
      setNotes(noteList);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      const { from } = editor.state.selection;
      const textBefore = editor.state.doc.textBetween(
        Math.max(0, from - 50),
        from,
        "\n"
      );

      const match = textBefore.match(/\[\[([^\]]*?)$/);
      if (match) {
        const searchQuery = match[1];
        setIsOpen(true);
        setSelectedIndex(0);
        triggerPosRef.current = from - match[0].length;

        const filtered = allNotesRef.current.filter((note) =>
          note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          note.relative_path.toLowerCase().includes(searchQuery.toLowerCase())
        );
        setNotes(filtered);

        const coords = editor.view.coordsAtPos(from);
        setPosition({
          top: coords.bottom + 4,
          left: coords.left,
        });
      } else {
        setIsOpen(false);
        triggerPosRef.current = null;
      }
    };

    editor.on("update", handleUpdate);
    editor.on("selectionUpdate", handleUpdate);

    return () => {
      editor.off("update", handleUpdate);
      editor.off("selectionUpdate", handleUpdate);
    };
  }, [editor]);

  const insertWikilink = useCallback(
    (noteTitle: string) => {
      if (!editor || triggerPosRef.current === null) return;

      const { from } = editor.state.selection;
      const triggerPos = triggerPosRef.current;

      editor
        .chain()
        .focus()
        .deleteRange({ from: triggerPos, to: from })
        .insertContent(`[[${noteTitle}]]`)
        .run();

      setIsOpen(false);
      triggerPosRef.current = null;
    },
    [editor]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return false;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, notes.length - 1));
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return true;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (notes[selectedIndex]) {
          insertWikilink(notes[selectedIndex].title);
        }
        return true;
      }
      if (e.key === "Escape") {
        setIsOpen(false);
        return true;
      }
      return false;
    },
    [isOpen, notes, selectedIndex, insertWikilink]
  );

  useEffect(() => {
    if (!editor || !isOpen) return;

    const handleEditorKeyDown = (_view: unknown, event: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key) && isOpen) {
        return handleKeyDown(event as unknown as React.KeyboardEvent);
      }
      return false;
    };

    // Register a ProseMirror plugin-like keydown handler
    const originalKeyDown = editor.view.props.handleKeyDown;
    editor.view.setProps({
      handleKeyDown: (view, event) => {
        if (handleEditorKeyDown(view, event)) return true;
        return originalKeyDown?.(view, event) ?? false;
      },
    });

    return () => {
      editor.view.setProps({
        handleKeyDown: originalKeyDown,
      });
    };
  }, [editor, isOpen, handleKeyDown]);

  if (!isOpen || notes.length === 0) return null;

  return (
    <div
      className="wikilink-suggestion"
      style={{
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 1000,
        backgroundColor: "var(--bg-secondary, #fff)",
        border: "1px solid var(--border-color, #d1d5db)",
        borderRadius: "6px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        maxHeight: "200px",
        overflowY: "auto",
        minWidth: "200px",
      }}
    >
      {notes.map((note, index) => (
        <div
          key={note.id}
          className={`wikilink-suggestion-item ${
            index === selectedIndex ? "is-selected" : ""
          }`}
          style={{
            padding: "6px 12px",
            cursor: "pointer",
            backgroundColor:
              index === selectedIndex
                ? "var(--bg-hover, #e5e7eb)"
                : "transparent",
            color: "var(--text-primary, #1f2937)",
            fontSize: "14px",
          }}
          onClick={() => insertWikilink(note.title)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <span style={{ fontWeight: 500 }}>{note.title}</span>
          <span
            style={{
              fontSize: "12px",
              color: "var(--text-muted, #9ca3af)",
              marginLeft: "8px",
            }}
          >
            {note.relative_path}
          </span>
        </div>
      ))}
    </div>
  );
}
