// lib/streaming.js
import { streamSanitize } from "./html";

/**
 * Creates a streaming transformer that:
 *  - Sanitizes chunks safely (across split style/script/head)
 *  - Enforces a hard display cap at targetPages
 *  - Tracks page breaks and updates page count reactively
 */
export function createChunkTransformer({
  getTargetPages,      // () => number (always read latest state)
  pageBreaksRef,       // React ref<number>
  setPages,            // React setState
  blockedTagRef        // React ref<null|"style"|"script"|"head">
}) {
  return function transformChunkRespectingLimit(chunk) {
    const sanitized = streamSanitize(chunk, blockedTagRef);
    const parts = sanitized.split("<!--PAGE_BREAK-->");
    const breaksInChunk = parts.length - 1;

    const targetPages = Math.max(1, Number(getTargetPages?.() ?? 1));
    const allowedBreaksRemaining = Math.max(0, targetPages - 1 - (pageBreaksRef.current || 0));
    if (allowedBreaksRemaining <= 0) return "";

    const usedBreaks = Math.min(breaksInChunk, allowedBreaksRemaining);
    let rebuilt = parts[0];
    for (let i = 1; i <= usedBreaks; i++) {
      rebuilt += '<div class="page-break"></div>' + parts[i];
    }
    if (breaksInChunk <= allowedBreaksRemaining) {
      rebuilt += parts.slice(usedBreaks + 1).join("");
    }

    pageBreaksRef.current = (pageBreaksRef.current || 0) + usedBreaks;
    setPages((p) => Math.max(p, (pageBreaksRef.current || 0) + 1));
    return rebuilt;
  };
}