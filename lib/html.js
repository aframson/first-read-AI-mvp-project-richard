// lib/html.js

/** Basic helpers */
export function stripTags(s = "") {
  return s.replace(/<[^>]+>/g, "");
}

export function extractTitleFromHtml(html = "") {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripTags(h1[1]).trim().replace(/\s+/g, " ").slice(0, 90);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) return stripTags(title[1]).trim().replace(/\s+/g, " ").slice(0, 90);
  const firstStrong = html.match(/<(h2|h3|strong)[^>]*>([\s\S]*?)<\/\1>/i);
  if (firstStrong) return stripTags(firstStrong[2]).trim().replace(/\s+/g, " ").slice(0, 90);
  return "";
}

export function summarizePrompt(p = "") {
  const words = p.trim().split(/\s+/);
  return (words.slice(0, 10).join(" ") + (words.length > 10 ? "…" : "")).trim();
}

export function countWords(s = "") {
  return (s.match(/\b[\w’'-]+\b/g) || []).length;
}

/** Streaming-safe sanitizer (works across split chunks) */
export function streamSanitize(chunk, blockedTagRef) {
  if (!chunk) return "";
  let outChunk = chunk
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<\/?(html|body)[^>]*>/gi, "")
    .replace(/<link[^>]*>/gi, "");

  const openMatchers = [
    { tag: "style", re: /<style\b[^>]*>/i, close: /<\/style>/i },
    { tag: "script", re: /<script\b[^>]*>/i, close: /<\/script>/i },
    { tag: "head", re: /<head\b[^>]*>/i, close: /<\/head>/i }
  ];

  let out = "";
  let pos = 0;

  if (blockedTagRef?.current) {
    const closeRe = openMatchers.find((m) => m.tag === blockedTagRef.current).close;
    const closeMatch = outChunk.match(closeRe);
    if (!closeMatch) return "";
    const idx = outChunk.search(closeRe);
    const closeLen = closeMatch[0].length;
    pos = idx + closeLen;
    blockedTagRef.current = null;
  }

  while (pos < outChunk.length) {
    let nextIdx = -1;
    let which = null;
    for (const m of openMatchers) {
      const idx = outChunk.slice(pos).search(m.re);
      if (idx !== -1) {
        const abs = pos + idx;
        if (nextIdx === -1 || abs < nextIdx) {
          nextIdx = abs;
          which = m;
        }
      }
    }
    if (nextIdx === -1 || !which) {
      out += outChunk.slice(pos);
      break;
    }

    out += outChunk.slice(pos, nextIdx);
    const rest = outChunk.slice(nextIdx);
    const closeMatch = rest.match(which.close);
    if (closeMatch) {
      const closeIdx = rest.search(which.close);
      const skipLen = closeIdx + closeMatch[0].length;
      pos = nextIdx + skipLen; // drop
    } else {
      if (blockedTagRef) blockedTagRef.current = which.tag;
      pos = outChunk.length; // drop tail
    }
  }
  out = out.replace(/<\/(head|style|script)>/gi, "");
  return out;
}

/** Clean a full saved HTML doc for safe embedding */
export function sanitizeSavedHtmlDoc(text) {
  return text
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<\/?(html|head|body)[^>]*>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<link[^>]*>/gi, "")
    .replace(/<!--PAGE_BREAK-->/g, '<div class="page-break"></div>');
}

/** Pagination helpers (robust split) */
export const PAGE_SPLIT_RE =
  /(?:<!--\s*PAGE_BREAK\s*-->|<div\s+class=(?:"|')page-break(?:"|')\s*[^>]*>\s*<\/div>)/gi;

export function splitPages(html = "") {
  if (!html) return [];
  const parts = html.split(PAGE_SPLIT_RE);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Build a full Word-friendly HTML from a fragment */
export function buildWordHtmlFromFragment(fragment) {
  return [
    '<html xmlns:o="urn:schemas-microsoft-com:office:office"',
    '      xmlns:w="urn:schemas-microsoft-com:office:word"',
    '      xmlns="http://www.w3.org/TR/REC-html40">',
    '<head><meta charset="utf-8"><title>Contract</title>',
    "<xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml>",
    "<style>",
    '  body { font: 10.5pt/1.45 system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif; color:#111; }',
    "  h1,h2,h3 { margin: 1.2em 0 .5em; }",
    "  ol { margin: 0 0 0 1.2em; }",
    "  .page-break { page-break-after: always; }",
    "  @page { margin: 1in; }",
    "</style></head><body>",
    fragment,
    "</body></html>"
  ].join("");
}