import { marked } from "marked";

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function markdownToMatrixHtml(markdown: string): string {
  const safeMarkdown = escapeHtml(markdown);
  return marked.parse(safeMarkdown, {
    gfm: true,
    breaks: true,
  }) as string;
}
