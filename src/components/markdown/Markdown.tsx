"use client";

import { useMemo } from "react";

/**
 * 依存を増やさない最小の Markdown レンダラ。
 *
 * セキュリティ: 生の HTML は一切通さない。すべてエスケープしてから
 * 限定的な記法だけを組み立てる（XSS 対策）。
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  // リンクは http(s) のみ許可
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label: string, url: string) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
  });
  return out;
}

function render(markdown: string): string {
  const lines = markdown.split("\n");
  const html: string[] = [];
  let inCode = false;
  let listType: "ul" | "ol" | null = null;
  let tableBuffer: string[] = [];

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    const rows = tableBuffer.map((r) =>
      r
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim()),
    );
    const [header, separator, ...body] = rows;
    const isTable = separator?.every((c) => /^:?-{2,}:?$/.test(c));
    if (header && isTable) {
      html.push("<table><thead><tr>");
      for (const cell of header) html.push(`<th>${inline(cell)}</th>`);
      html.push("</tr></thead><tbody>");
      for (const row of body) {
        html.push("<tr>");
        for (const cell of row) html.push(`<td>${inline(cell)}</td>`);
        html.push("</tr>");
      }
      html.push("</tbody></table>");
    } else {
      for (const line of tableBuffer) html.push(`<p>${inline(line)}</p>`);
    }
    tableBuffer = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");

    if (line.startsWith("```")) {
      flushTable();
      closeList();
      html.push(inCode ? "</code></pre>" : "<pre><code>");
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      html.push(`${escapeHtml(raw)}\n`);
      continue;
    }

    if (line.startsWith("|")) {
      closeList();
      tableBuffer.push(line);
      continue;
    }
    flushTable();

    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1]!.length;
      html.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeList();
      html.push(`<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      closeList();
      html.push("<hr />");
      continue;
    }

    const ordered = /^\d+\.\s+(.*)$/.exec(line);
    const unordered = /^[-*]\s+(.*)$/.exec(line);
    if (ordered || unordered) {
      const type = ordered ? "ol" : "ul";
      if (listType !== type) {
        closeList();
        html.push(`<${type}>`);
        listType = type;
      }
      html.push(`<li>${inline((ordered ?? unordered)![1]!)}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }

  flushTable();
  closeList();
  if (inCode) html.push("</code></pre>");
  return html.join("");
}

export function Markdown({ content }: { content: string }) {
  const html = useMemo(() => render(content), [content]);
  return <div className="ac-prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
