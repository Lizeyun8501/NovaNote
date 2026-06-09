import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TagHighlight } from "./TagHighlightExtension";
import { htmlToMarkdown } from "../../utils/markdown";
import { Wikilink } from "./WikilinkExtension";
import WikilinkSuggestion from "./WikilinkSuggestion";
import { useEffect } from "react";
import "./Editor.css";

interface EditorProps {
  content: string;
  onChange: (html: string, markdown: string) => void;
  placeholder?: string;
  onLinkClick?: (target: string) => void;
  onSelectionChange?: (selectedText: string) => void;
}

export default function Editor({
  content,
  onChange,
  placeholder,
  onLinkClick,
  onSelectionChange,
}: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: placeholder || "Start writing...",
      }),
      Wikilink.configure({
        onLinkClick: onLinkClick ?? null,
      }),
      TagHighlight,
    ],
    content,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const markdown = htmlToMarkdown(html);
      onChange(html, markdown);
    },
    editorProps: {
      attributes: {
        class: "prose-editor",
      },
    },
  });

  if (!editor) {
    return null;
  }

  // Notify parent about text selection changes
  useEffect(() => {
    if (!editor || !onSelectionChange) return;
    const handleSelectionUpdate = () => {
      const { from, to, empty } = editor.state.selection;
      if (!empty && onSelectionChange) {
        const selectedText = editor.state.doc.textBetween(from, to);
        onSelectionChange(selectedText);
      }
    };
    editor.on("selectionUpdate", handleSelectionUpdate);
    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate);
    };
  }, [editor, onSelectionChange]);

  const runAction = (action: string, level?: number) => {
    switch (action) {
      case "undo":
        editor.chain().focus().undo().run();
        break;
      case "redo":
        editor.chain().focus().redo().run();
        break;
      case "heading":
        editor
          .chain()
          .focus()
          .toggleHeading({ level: (level || 1) as 1 | 2 | 3 })
          .run();
        break;
      case "bold":
      case "italic":
      case "strike":
      case "bulletList":
      case "orderedList":
      case "blockquote":
      case "codeBlock": {
        const method =
          action === "codeBlock"
            ? "toggleCodeBlock"
            : `toggle${action.charAt(0).toUpperCase() + action.slice(1)}`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain = editor.chain().focus() as unknown as Record<
          string,
          () => { run: () => void }
        >;
        chain[method]?.()?.run?.();
        break;
      }
    }
  };

  const isButtonActive = (action: string, level?: number) => {
    if (action === "undo" || action === "redo") return "";
    if (action === "heading") {
      return editor.isActive("heading", { level: level || 1 }) ? "is-active" : "";
    }
    return editor.isActive(action) ? "is-active" : "";
  };

  interface ToolbarButton {
    label: string;
    action: string;
    icon: string;
    level?: number;
  }

  const buttons: ToolbarButton[] = [
    { label: "Bold", action: "bold", icon: "B" },
    { label: "Italic", action: "italic", icon: "I" },
    { label: "H1", action: "heading", icon: "H1", level: 1 },
    { label: "H2", action: "heading", icon: "H2", level: 2 },
    { label: "H3", action: "heading", icon: "H3", level: 3 },
    { label: "Bullet List", action: "bulletList", icon: "•" },
    { label: "Ordered List", action: "orderedList", icon: "1." },
    { label: "Blockquote", action: "blockquote", icon: "❝" },
    { label: "Code Block", action: "codeBlock", icon: "</>" },
    { label: "Undo", action: "undo", icon: "↩" },
    { label: "Redo", action: "redo", icon: "↪" },
  ];

  return (
    <div className="editor-container">
      <div className="editor-toolbar">
        {buttons.map((btn) => (
          <button
            key={btn.action + (btn.level ?? "")}
            type="button"
            className={`toolbar-btn ${isButtonActive(btn.action, btn.level)}`}
            onClick={() => runAction(btn.action, btn.level)}
            title={btn.label}
          >
            {btn.icon}
          </button>
        ))}
      </div>
      <EditorContent editor={editor} className="editor-content" />
      <WikilinkSuggestion editor={editor} />
    </div>
  );
}
