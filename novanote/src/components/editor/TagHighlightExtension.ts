import { Mark, markInputRule, markPasteRule } from "@tiptap/core";

export interface TagHighlightOptions {
  HTMLAttributes: Record<string, string>;
}

const inputRegex = /(?:^|\s)(#([a-zA-Z][\w-]*))$/;
const pasteRegex = /(?:^|\s)(#([a-zA-Z][\w-]*))/g;

export const TagHighlight = Mark.create<TagHighlightOptions>({
  name: "tagHighlight",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="tag"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        "data-type": "tag",
        class: "novanote-tag",
        style:
          "color: var(--accent-color, #3b82f6); background: var(--tag-bg, rgba(59,130,246,0.1)); border-radius: 3px; padding: 0 2px; font-weight: 500;",
      },
      ...Object.entries(HTMLAttributes).map(([key, value]) => [key, value]),
      0,
    ];
  },

  addInputRules() {
    return [
      markInputRule({
        find: inputRegex,
        type: this.type,
      }),
    ];
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: pasteRegex,
        type: this.type,
      }),
    ];
  },
});
