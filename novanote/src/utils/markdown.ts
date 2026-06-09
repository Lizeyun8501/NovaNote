import { marked } from "marked";
import TurndownService from "turndown";

const turndownService = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

export function htmlToMarkdown(html: string): string {
  return turndownService.turndown(html);
}