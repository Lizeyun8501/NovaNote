import { Mark, markInputRule, markPasteRule } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface WikilinkOptions {
  HTMLAttributes: Record<string, string>;
  onLinkClick: ((target: string) => void) | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikilink: {
      setWikilink: (target: string) => ReturnType;
      toggleWikilink: (target: string) => ReturnType;
      unsetWikilink: () => ReturnType;
    };
  }
}

export const Wikilink = Mark.create<WikilinkOptions>({
  name: "wikilink",

  addOptions() {
    return {
      HTMLAttributes: {
        class: "wikilink",
      },
      onLinkClick: null,
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="wikilink"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        ...this.options.HTMLAttributes,
        ...HTMLAttributes,
        "data-type": "wikilink",
        role: "button",
        tabindex: "0",
      },
      0,
    ];
  },

  addCommands() {
    return {
      setWikilink:
        (target: string) =>
        ({ commands }) => {
          return commands.setMark(this.name, { "data-target": target });
        },
      toggleWikilink:
        (target: string) =>
        ({ commands }) => {
          return commands.toggleMark(this.name, { "data-target": target });
        },
      unsetWikilink:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },

  addInputRules() {
    return [
      markInputRule({
        find: /\[\[([^\]]+)\]\]$/,
        type: this.type,
        getAttributes: (match) => {
          const target = match[1];
          return { "data-target": target };
        },
      }),
    ];
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: /\[\[([^\]]+)\]\]/g,
        type: this.type,
        getAttributes: (match) => {
          const target = match[1];
          return { "data-target": target };
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {};
  },

  addProseMirrorPlugins() {
    const onLinkClick = this.options.onLinkClick;

    return [
      new Plugin({
        key: new PluginKey("wikilinkClickHandler"),
        props: {
          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement;
            const wikilinkEl = target.closest('[data-type="wikilink"]');
            if (wikilinkEl && onLinkClick) {
              const linkTarget = wikilinkEl.getAttribute("data-target");
              if (linkTarget) {
                onLinkClick(linkTarget);
                return true;
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});
