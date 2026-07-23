import { formatCurrency, formatNumber, formatPercent, formatRoas, pctChange, truncate } from "@/lib/utils";

/** HTML-escape a string for safe interpolation into templates. */
export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type BadgeVariant = "default" | "secondary" | "muted" | "success" | "warning" | "destructive" | "outline";

export function badge(text: unknown, variant: BadgeVariant = "muted", cap = false): string {
  return `<span class="badge ${variant}${cap ? " cap" : ""}">${esc(text)}</span>`;
}

/** A signed delta pill from a fraction (0.12 → +12.0%). */
export function delta(fraction: number | null): string {
  if (fraction == null || !Number.isFinite(fraction)) return "";
  const up = fraction >= 0;
  const arrow = up ? "arrow-up" : "arrow-down";
  const sign = up ? "+" : "-";
  return `<span class="delta ${up ? "up" : "down"}">${icon(arrow)} ${sign}${Math.abs(fraction * 100).toFixed(1)}%</span>`;
}

/** Minimal, safe Markdown → HTML for AI reports (headings, bold, lists, tables, code). */
export function renderMarkdown(src: string): string {
  const lines = (src ?? "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let inList = false;
  let inQuote = false;

  const inline = (t: string) =>
    esc(t)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/`([^`]+?)`/g, "<code>$1</code>");

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  const closeQuote = () => {
    if (inQuote) {
      out.push("</div>");
      inQuote = false;
    }
  };

  const closeBlocks = () => {
    closeList();
    closeQuote();
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*---+\s*$/.test(line)) {
      closeBlocks();
      i++;
      continue;
    }

    // Table: header row followed by | --- | separator.
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      closeBlocks();
      const cells = (r: string) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const header = cells(line);
      out.push('<div class="table-wrap"><table><thead><tr>' + header.map((h) => `<th>${inline(h)}</th>`).join("") + "</tr></thead><tbody>");
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const row = cells(lines[i]);
        out.push("<tr>" + row.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
        i++;
      }
      out.push("</tbody></table></div>");
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closeBlocks();
      const level = h[1].length;
      const text = h[2].replace(/^\d+\.\s+/, "");
      out.push(`<h${level}>${inline(text)}</h${level}>`);
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeList();
      if (!inQuote) {
        out.push('<div class="report-callout">');
        inQuote = true;
      }
      out.push(`<p>${inline(line.replace(/^>\s?/, ""))}</p>`);
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      closeQuote();
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`);
      i++;
      continue;
    }

    if (line.trim() === "") {
      closeBlocks();
      i++;
      continue;
    }

    closeBlocks();
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  closeBlocks();
  return out.join("\n");
}

/** Slack mrkdwn (*bold*, newlines) → HTML for the Slack preview. */
export function slackToHtml(summary: string): string {
  return esc(summary)
    .replace(/\*(.+?)\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}

export function jsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Inline SVG icon set (Lucide-style). */
const ICONS: Record<string, string> = {
  chart: '<path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-6"/>',
  overview: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  trending: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  logs: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  sparkles: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2Z"/>',
  "arrow-up": '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  "arrow-down": '<path d="m19 12-7 7-7-7"/><path d="M12 5v14"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  meta: '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2Z"/><path d="M8 12c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4"/>',
};
export function icon(name: string, size = 16): string {
  const path = ICONS[name] ?? "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/** Map integration health keys to API test parameters. */
export const INTEGRATION_TEST: Record<string, { type: string; key?: string }> = {
  database: { type: "db" },
  slack: { type: "slack" },
  meta_nobl: { type: "meta", key: "nobl_meta" },
  meta_flo: { type: "meta", key: "flo_meta" },
  tw_nobl: { type: "tw", key: "nobl_main" },
  tw_flo: { type: "tw", key: "flo_main_us" },
  tw_nobl_eu: { type: "tw", key: "nobl_eu" },
  tw_nobl_uk: { type: "tw", key: "nobl_uk" },
};

export const NAV = [
  { href: "/overview", label: "Overview", icon: "overview" },
  { href: "/creative-analysis", label: "Creative Analysis", icon: "layers" },
  { href: "/winners", label: "Scale Signals", icon: "trending" },
  { href: "/reports", label: "Weekly Reports", icon: "file" },
  { href: "/settings", label: "Operations", icon: "settings" },
];

/** Bundle passed to every view as `h`. */
export const helpers = {
  esc,
  badge,
  delta,
  icon,
  renderMarkdown,
  slackToHtml,
  jsonForHtml,
  truncate,
  INTEGRATION_TEST,
  fmtCurrency: formatCurrency,
  fmtNumber: formatNumber,
  fmtPercent: formatPercent,
  fmtRoas: formatRoas,
  pctChange,
  NAV,
};

export type Helpers = typeof helpers;
