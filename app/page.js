"use client";

import { useEffect, useRef, useState } from "react";
import { connectWS } from "../lib/ws";
import { History, Play, Square, Download, Loader2, X } from "lucide-react";
import Image from "next/image";

/** Sandboxed HTML renderer using Shadow DOM to prevent style bleed */
function ShadowHTML({ html }) {
  const hostRef = useRef(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!host.shadowRoot) {
      host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      const base = `
        :host { all: initial; display: block; }
        .doc-root { font: 10.5pt/1.45 system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif; color:#111; }
        .doc-root h1,.doc-root h2,.doc-root h3 { margin: 1.2em 0 .5em; }
        .doc-root ol { margin: 0 0 0 1.2em; }
        .doc-root .page-break { page-break-after: always; }
        @page { margin: 1in; }
        @media screen { .doc-root .page-break { border-top: 1px dashed #e5e7eb; margin: 28px 0; } }
      `;
      style.textContent = base;
      const container = document.createElement("div");
      container.className = "doc-root";
      host.shadowRoot.appendChild(style);
      host.shadowRoot.appendChild(container);
      host._container = container;
    }
    if (host._container) host._container.innerHTML = html || "";
  }, [html]);
  return <div ref={hostRef} style={{ contain: "content" }} />;
}

/* ---------- helpers ---------- */
function stripTags(s = "") {
  return s.replace(/<[^>]+>/g, "");
}
function extractTitleFromHtml(html = "") {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripTags(h1[1]).trim().replace(/\s+/g, " ").slice(0, 90);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) return stripTags(title[1]).trim().replace(/\s+/g, " ").slice(0, 90);
  const firstStrong = html.match(/<(h2|h3|strong)[^>]*>([\s\S]*?)<\/\1>/i);
  if (firstStrong) return stripTags(firstStrong[2]).trim().replace(/\s+/g, " ").slice(0, 90);
  return "";
}
function summarizePrompt(p = "") {
  const words = p.trim().split(/\s+/);
  return (words.slice(0, 10).join(" ") + (words.length > 10 ? "…" : "")).trim();
}

/** Lightweight skeleton doc (headline bar + multiple lines) */
function PreStreamSkeleton() {
  return (
    <div className="animate-pulse">
      {/* fake title */}
      <div className="h-5 w-2/3 rounded bg-slate-200/90 mb-4" />
      {/* fake paragraphs */}
      {Array.from({ length: 22 }).map((_, i) => (
        <div
          key={i}
          className="h-3 rounded bg-slate-200/80 mb-2"
          style={{ width: `${90 - (i % 6) * 8}%` }}
        />
      ))}
      {/* fake page-break indicator */}
      <div className="page-break my-6" />
      {Array.from({ length: 16 }).map((_, i) => (
        <div
          key={`b-${i}`}
          className="h-3 rounded bg-slate-200/80 mb-2"
          style={{ width: `${92 - (i % 7) * 7}%` }}
        />
      ))}
    </div>
  );
}

export default function Home() {
  const [prompt, setPrompt] = useState(
    "Draft Terms of Service for a cloud cyber SaaS company based in New York."
  );
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState("idle"); // idle | connected | starting | generating | complete | stopped | error | disconnected
  const [downloadUrl, setDownloadUrl] = useState(null);

  const [history, setHistory] = useState([]); // [{ key, s3Url, prompt, name, ts }]
  const [selected, setSelected] = useState(null);
  const [docTitle, setDocTitle] = useState("Document");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [paneClosed, setPaneClosed] = useState(false);

  const [leftOpen, setLeftOpen] = useState(false);

  const [pages, setPages] = useState(0);
  let pageBreaksRef = useRef(0);
  let lastPageEstRef = useRef(0);

  const [targetPages, setTargetPages] = useState(10);
  const MIN_ALLOWED_PAGES = 3;
  const MAX_ALLOWED_PAGES = 40;

  const WORDS_PER_PAGE = 350;

  const [stalled, setStalled] = useState(false);
  const lastDeltaAtRef = useRef(0);
  const STALL_MS = 1500;

  const suggestions = [
    "Draft an NDA between SaaS firms",
    "Consulting agreement (hourly)",
    "Mutual non-disparagement clause",
    "Termination & liability cap"
  ];

  const socketRef = useRef(null);
  const textareaRef = useRef(null);
  const docScrollRef = useRef(null);

  const blockedTagRef = useRef(null);

  const shouldAutoScrollRef = useRef(true);
  const rafScrollScheduled = useRef(false);

  // streaming + skeleton state
  const isStreaming = status === "starting" || status === "generating";
  const noTokensYet = html.trim().length === 0;
  const showPreStreamSkeleton = isStreaming && noTokensYet;

  // pane visibility
  const paneHasContent = isStreaming || html.trim().length > 0 || !!selected;
  const paneVisible = !paneClosed && paneHasContent;

  // widths
  const RIGHT_W = 840;
  const LEFT_OPEN_W = 256;
  const LEFT_CLOSED_W = 48;

  // --- small utils
  function countWords(s) {
    return (s.match(/\b[\w’'-]+\b/g) || []).length;
  }
  function renameHistoryItem(key, name) {
    if (!key || !name) return;
    setHistory((h) => {
      const next = h.map((it) => (it.key === key ? { ...it, name } : it));
      localStorage.setItem("fr_history", JSON.stringify(next));
      return next;
    });
  }

  /** Remove any tags that could affect the host app (stream-safe, handles split chunks). */
  function streamSanitize(chunk) {
    if (!chunk) return "";
    chunk = chunk
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

    if (blockedTagRef.current) {
      const closeRe = openMatchers.find((m) => m.tag === blockedTagRef.current).close;
      const closeMatch = chunk.match(closeRe);
      if (!closeMatch) return "";
      const idx = chunk.search(closeRe);
      const closeLen = closeMatch[0].length;
      pos = idx + closeLen;
      blockedTagRef.current = null;
    }

    while (pos < chunk.length) {
      let nextIdx = -1;
      let which = null;
      for (const m of openMatchers) {
        const idx = chunk.slice(pos).search(m.re);
        if (idx !== -1) {
          const abs = pos + idx;
          if (nextIdx === -1 || abs < nextIdx) {
            nextIdx = abs;
            which = m;
          }
        }
      }
      if (nextIdx === -1 || !which) {
        out += chunk.slice(pos);
        break;
      }

      out += chunk.slice(pos, nextIdx);
      const rest = chunk.slice(nextIdx);
      const closeMatch = rest.match(which.close);
      if (closeMatch) {
        const closeIdx = rest.search(which.close);
        const skipLen = closeIdx + closeMatch[0].length;
        pos = nextIdx + skipLen; // drop
      } else {
        blockedTagRef.current = which.tag;
        pos = chunk.length; // drop tail
      }
    }
    out = out.replace(/<\/(head|style|script)>/gi, "");
    return out;
  }

  /** Convert model markers and enforce a hard display cap at targetPages. */
  function transformChunkRespectingLimit(chunk) {
    const sanitized = streamSanitize(chunk);
    const parts = sanitized.split("<!--PAGE_BREAK-->");
    const breaksInChunk = parts.length - 1;
    theAllowed: {
      const allowedBreaksRemaining = Math.max(0, targetPages - 1 - pageBreaksRef.current);
      if (allowedBreaksRemaining <= 0) return "";
      const usedBreaks = Math.min(breaksInChunk, allowedBreaksRemaining);
      let rebuilt = parts[0];
      for (let i = 1; i <= usedBreaks; i++) {
        rebuilt += '<div class="page-break"></div>' + parts[i];
      }
      if (breaksInChunk <= allowedBreaksRemaining) {
        rebuilt += parts.slice(usedBreaks + 1).join("");
      }
      pageBreaksRef.current += usedBreaks;
      setPages((p) => Math.max(p, pageBreaksRef.current + 1));
      return rebuilt;
    }
  }

  /** Sanitize full saved HTML doc (history) */
  function sanitizeSavedHtmlDoc(text) {
    return text
      .replace(/<!doctype[^>]*>/gi, "")
      .replace(/<\/?(html|head|body)[^>]*>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<link[^>]*>/gi, "")
      .replace(/<!--PAGE_BREAK-->/g, '<div class="page-break"></div>');
  }

  // Ask backend to presign a fresh URL for a history key
  function requestPresign(key) {
    const ws = socketRef.current;
    const msg = { action: "presign", key };
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else initSocket(msg);
  }

  function initSocket(sendOnOpen) {
    socketRef.current = connectWS(
      async (msg) => {
        if (msg.type === "delta") {
          const add = transformChunkRespectingLimit(msg.htmlChunk);
          if (add) {
            setHtml((prev) => {
              const next = prev + add;
              const maybe = extractTitleFromHtml(next);
              if (maybe && maybe !== docTitle) setDocTitle(maybe);
              const approx = Math.max(1, Math.floor(countWords(next) / WORDS_PER_PAGE) + 1);
              if (approx > lastPageEstRef.current) {
                lastPageEstRef.current = approx;
                setPages((p) => Math.max(p, approx));
              }
              return next;
            });
          }
          lastDeltaAtRef.current = Date.now();
          setStalled(false);
          if (pageBreaksRef.current >= targetPages - 1) {
            try {
              socketRef.current?.close(4001, "target-pages-reached");
            } catch {}
          }
        } else if (msg.type === "page") {
          const val = Math.min(Number(msg.value || 0), Math.max(1, targetPages));
          if (val > 0) {
            lastPageEstRef.current = Math.max(lastPageEstRef.current, val);
            setPages(val);
          }
        } else if (msg.type === "status") {
          setStatus(msg.value);
          if (msg.value === "generating") {
            lastDeltaAtRef.current = Date.now();
            setStalled(false);
          }
        } else if (msg.type === "complete") {
          setStatus("complete");
          setStalled(false);
          setDownloadUrl(msg.s3Url || null);
          const derivedName = extractTitleFromHtml(html) || summarizePrompt(prompt) || "Contract";
          if (msg.key) {
            const item = {
              key: msg.key,
              s3Url: msg.s3Url,
              prompt,
              name: derivedName,
              ts: Date.now()
            };
            setHistory((h) => {
              const next = [item, ...h].slice(0, 50);
              localStorage.setItem("fr_history", JSON.stringify(next));
              return next;
            });
            setSelected(item);
            setPreviewLoading(false);
            setLeftOpen(true);
            if (derivedName) setDocTitle(derivedName);
          }
        } else if (msg.type === "presigned") {
          setHistory((h) => {
            const next = h.map((it) => (it.key === msg.key ? { ...it, s3Url: msg.s3Url } : it));
            localStorage.setItem("fr_history", JSON.stringify(next));
            if (selected?.key === msg.key) setSelected((s) => ({ ...s, s3Url: msg.s3Url }));
            return next;
          });
          setPreviewLoading(false);
          if (msg.s3Url && selected?.key === msg.key) {
            try {
              const res = await fetch(msg.s3Url, { cache: "no-store" });
              if (!res.ok) throw new Error("fetch failed");
              const text = await res.text();
              const clean = sanitizeSavedHtmlDoc(text);
              setHtml(clean);
              const title = extractTitleFromHtml(text) || extractTitleFromHtml(clean);
              if (title) {
                setDocTitle(title);
                renameHistoryItem(selected.key, title);
              }
            } catch {
              setHtml(`
                <div>
                  <p><strong>We couldn’t open this saved contract right now.</strong></p>
                  <p>Please try again in a moment, or download it using the button below.</p>
                </div>
              `);
            }
          }
        } else if (msg.type === "error") {
          setStatus("error");
          setStalled(false);
          alert(msg.message || "Generation failed");
          setPreviewLoading(false);
        }
      },
      () => {
        setStatus("connected");
        if (sendOnOpen) {
          try {
            socketRef.current?.send(JSON.stringify(sendOnOpen));
          } catch {}
        }
      },
      () => setStatus("disconnected")
    );
  }

  // initial load
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("fr_history") || "[]");
    setHistory(saved);
    initSocket(null);
    return () => {
      try {
        const ws = socketRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) ws.close(1000, "unmount");
      } catch {}
    };
  }, []);

  // auto-size composer
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [prompt]);

  // stall detector (drafting)
  useEffect(() => {
    const id = setInterval(() => {
      if (isStreaming && html.trim().length > 0) {
        const idle = Date.now() - lastDeltaAtRef.current;
        setStalled(idle > STALL_MS);
      } else {
        setStalled(false);
      }
    }, 500);
    return () => clearInterval(id);
  }, [isStreaming, html]);

  // auto-scroll during draft stream
  useEffect(() => {
    if (!docScrollRef.current || !isStreaming) return;
    if (!shouldAutoScrollRef.current) return;
    if (rafScrollScheduled.current) return;
    rafScrollScheduled.current = true;
    requestAnimationFrame(() => {
      rafScrollScheduled.current = false;
      const c = docScrollRef.current;
      if (!c) return;
      try {
        c.scrollTop = c.scrollHeight;
      } catch {}
    });
  }, [html, isStreaming]);

  // derive doc title when html changes (in case first h1 arrives late)
  useEffect(() => {
    if (!html) return;
    const maybe = extractTitleFromHtml(html);
    if (maybe && maybe !== docTitle) setDocTitle(maybe);
  }, [html]); // eslint-disable-line

  function onRightPaneScroll() {
    const c = docScrollRef.current;
    if (!c) return;
    const atBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 80;
    shouldAutoScrollRef.current = atBottom;
  }

  function start() {
    // reset drafting stream
    setHtml("");
    setStatus("starting"); // ensures showPreStreamSkeleton === true immediately
    setDownloadUrl(null);
    setSelected(null);
    setPaneClosed(false); // open pane so skeleton is visible
    setDocTitle("Document");
    shouldAutoScrollRef.current = true;

    setPages(0);
    pageBreaksRef.current = 0;
    lastPageEstRef.current = 0;
    blockedTagRef.current = null;
    lastDeltaAtRef.current = Date.now();
    setStalled(false);

    const ws = socketRef.current;
    const isOpen = ws && ws.readyState === WebSocket.OPEN;
    const payload = { action: "start", prompt, targetPages };
    if (isOpen) ws.send(JSON.stringify(payload));
    else initSocket(payload);
  }

  function stop() {
    const ws = socketRef.current;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try {
        ws.close(4000, "user-stop");
      } catch {}
    }
    setStatus("stopped");
    setStalled(false);
  }

  function closePane() {
    if (isStreaming) stop();
    setPaneClosed(true);
    setSelected(null);
  }

  async function openFromHistory(it) {
    setSelected(it);
    setPaneClosed(false);
    setHtml("");
    setStatus("idle");
    setPreviewLoading(true);
    shouldAutoScrollRef.current = true;

    setPages(0);
    pageBreaksRef.current = 0;
    lastPageEstRef = { current: 0 };
    blockedTagRef.current = null;
    setStalled(false);
    setDocTitle(it.name || "Document");

    const hydrate = async (url) => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const txt = await res.text();
        if (!res.ok || /<Error>|AccessDenied|Request has expired/i.test(txt)) {
          throw new Error("expired");
        }
        const clean = sanitizeSavedHtmlDoc(txt);
        setHtml(clean);
        const title = extractTitleFromHtml(txt) || extractTitleFromHtml(clean) || it.name;
        if (title) {
          setDocTitle(title);
          renameHistoryItem(it.key, title);
        }
      } catch {
        setHtml(`
          <div>
            <p><strong>This saved contract link expired.</strong></p>
            <p>Refreshing the link… If it doesn’t open, try again shortly.</p>
          </div>
        `);
        requestPresign(it.key);
      } finally {
        setPreviewLoading(false);
      }
    };

    if (it.s3Url) {
      await hydrate(it.s3Url);
    } else {
      requestPresign(it.key);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      start();
    }
  }

  function useSuggestion(text) {
    setPrompt(text);
    textareaRef.current?.focus();
  }

  // Build full HTML (Word-friendly) for export when S3 HTML isn't available
  function buildWordHtmlFromFragment(fragment) {
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

  // Export to MS Word (.doc)
  async function exportWord() {
    try {
      let htmlToSave = "";
      if (downloadUrl) {
        const res = await fetch(downloadUrl, { cache: "no-store" });
        htmlToSave = await res.text();
      } else if (selected?.s3Url) {
        const res = await fetch(selected.s3Url, { cache: "no-store" });
        htmlToSave = await res.text();
      } else if (html.trim().length) {
        htmlToSave = buildWordHtmlFromFragment(html);
      } else {
        return;
      }

      const isFull = /<html[\s>]/i.test(htmlToSave);
      if (!isFull) htmlToSave = buildWordHtmlFromFragment(htmlToSave);

      const blob = new Blob([htmlToSave], {
        type: "application/msword;charset=utf-8"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (extractTitleFromHtml(htmlToSave) || "contract") + ".doc";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export Word failed", e);
      alert("Could not export to Word. Please try again.");
    }
  }

  const progressPct = Math.max(0, Math.min(100, (pages / Math.max(targetPages, 1)) * 100));

  return (
    <div className="h-screen bg-white text-slate-900">
      {/* globals */}
      <style jsx global>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .page-break { border-top: 1px dashed #e5e7eb; margin: 28px 0; }
        @media print { .page-break { page-break-after: always; } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>

      {/* LEFT rail */}
      <aside
        className="fixed left-0 top-0 bottom-0 border-r border-slate-200 bg-white transition-[width] duration-300 ease-in-out overflow-hidden"
        style={{ width: leftOpen ? 256 : 48 }}
        aria-label="History"
      >
        <div className="flex items-center justify-between px-2 py-3">
          <button
            onClick={() => setLeftOpen((o) => !o)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100"
            title={leftOpen ? "Collapse history" : "Open history"}
            aria-label={leftOpen ? "Collapse history" : "Open history"}
            type="button"
          >
            <History size={18} />
          </button>
          {leftOpen && <div className="pr-3 font-semibold text-slate-700">History</div>}
        </div>

        {leftOpen && (
          <div className="mt-1 h-[calc(100%-48px)] overflow-y-auto px-2 hide-scrollbar">
            {history.length === 0 && (
              <div className="text-sm text-slate-500 px-2">No contracts yet.</div>
            )}
            <div className="mt-2 flex flex-col gap-1.5">
              {history.map((it) => (
                <button
                  key={it.key}
                  title={it.name || it.prompt}
                  onClick={() => openFromHistory(it)}
                  className={[
                    "w-full text-left rounded-md px-3 py-2 hover:bg-slate-50 overflow-hidden min-w-0",
                    selected?.key === it.key ? "bg-blue-50/60 ring-1 ring-blue-200" : "bg-white"
                  ].join(" ")}
                  type="button"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                      {it.name || summarizePrompt(it.prompt) || "Contract"}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 whitespace-nowrap">
                      {new Date(it.ts).toLocaleString()}
                    </div>
                  </div>
                </button>
              ))}
              <div className="h-8" />
            </div>
          </div>
        )}
      </aside>

      {/* MAIN (center) */}
      <div
        className="h-full transition-[padding] duration-300 ease-in-out"
        style={{
          paddingLeft: leftOpen ? LEFT_OPEN_W : LEFT_CLOSED_W,
          paddingRight: paneVisible ? RIGHT_W : 0
        }}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="px-4 h-14 flex items-center justify-between">
            <Image src={"/logo.svg"} alt="FirstRead" width={100} height={28} />
            <div className="flex items-center gap-3">
              <div className="text-sm font-medium text-slate-700 max-w-[40vw] truncate">
                {docTitle}
              </div>
              <div
                className={`text-xs px-2 py-1 rounded-full border ${
                  isStreaming
                    ? "bg-amber-50 border-amber-200 text-amber-700"
                    : status === "connected"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : status === "error"
                    ? "bg-rose-50 border-rose-200 text-rose-700"
                    : "bg-slate-50 border-slate-200 text-slate-600"
                }`}
              >
                {status}
              </div>
              <div
                className={`text-xs px-2 py-1 rounded-full border ${
                  pages >= targetPages
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-slate-50 border-slate-200 text-slate-600"
                }`}
                title="Approximate pages generated so far"
              >
                {pages} / {targetPages} pages
              </div>
            </div>
          </div>
        </header>

        {/* Hero (kept minimal) */}
        <main className="mx-auto max-w-3xl px-5">
          <div className="w-full flex items-start justify-center mt-16 mb-24">
            <div className="text-center text-slate-500 mt-[20vh]">
              <Image src={"/logo.svg"} alt="FirstRead" width={250} height={80} />
            </div>
          </div>
        </main>

        {/* Composer (fixed) */}
        <div
          className="fixed bottom-0 left-0 right-0 z-10 pointer-events-none transition-[padding] duration-300 ease-in-out"
          style={{
            paddingLeft: leftOpen ? LEFT_OPEN_W : LEFT_CLOSED_W,
            paddingRight: paneVisible ? RIGHT_W : 0
          }}
        >
          <div className="pointer-events-none bg-gradient-to-t from-white via-white/95 to-transparent h-20" />
          {/* badges */}
          <div className="mx-auto max-w-3xl px-5 pb-6 pointer-events-auto">
            <div className="flex items-center justify-between gap-2">
              <div className="grid grid-cols-2 gap-2 flex-1">
                {suggestions.slice(0, 9).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => useSuggestion(s)}
                    className="inline-flex items-center justify-center text-center rounded-full border border-slate-200 px-3 py-2 text-[12px] text-slate-600 hover:bg-slate-50"
                    title="Use this suggestion"
                    type="button"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Composer box */}
          <div className="mx-auto max-w-3xl px-5 pb-8 pointer-events-auto">
            <div className="rounded-[16px] border border-slate-200 shadow-lg bg-white px-2 py-2 flex items-end gap-2 focus-within:ring-2 focus-within:ring-blue-300">
              <textarea
                ref={textareaRef}
                rows={1}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Describe the contract you need…"
                className="min-h-[40px] max-h-[180px] flex-1 resize-none rounded-[16px] px-3 py-2 outline-none placeholder:text-slate-400 overflow-y-auto hide-scrollbar"
              />
              <div className="flex items-center gap-1 pb-1 pr-1">
                {/* Pages selector */}
                <div className="hidden sm:flex items-center gap-2 mr-1">
                  <span className="text-[12px] text-slate-600">Pages</span>
                  <div className="inline-flex items-center rounded-full border border-slate-200 overflow-hidden">
                    <button
                      onClick={() => setTargetPages((p) => Math.max(MIN_ALLOWED_PAGES, p - 1))}
                      className="px-2 py-1 text-slate-700 hover:bg-slate-50"
                      title="Decrease pages"
                      aria-label="Decrease pages"
                      type="button"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={MIN_ALLOWED_PAGES}
                      max={MAX_ALLOWED_PAGES}
                      value={targetPages}
                      onChange={(e) => {
                        const n = parseInt(e.target.value || "0", 10);
                        if (!Number.isNaN(n)) {
                          setTargetPages(
                            Math.min(MAX_ALLOWED_PAGES, Math.max(MIN_ALLOWED_PAGES, n))
                          );
                        }
                      }}
                      className="w-12 text-center text-[12px] outline-none py-1"
                      aria-label="Target pages"
                    />
                    <button
                      onClick={() => setTargetPages((p) => Math.min(MAX_ALLOWED_PAGES, p + 1))}
                      className="px-2 py-1 text-slate-700 hover:bg-slate-50"
                      title="Increase pages"
                      aria-label="Increase pages"
                      type="button"
                    >
                      +
                    </button>
                  </div>
                </div>

                <button
                  onClick={start}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 transition"
                  title="Generate"
                  type="button"
                >
                  <Play size={16} />
                </button>
                {isStreaming && (
                  <button
                    onClick={stop}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 hover:bg-slate-50 transition"
                    title="Stop"
                    type="button"
                  >
                    <Square size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2 text-center text-[11px] text-slate-500">
              WS: <code className="font-mono">{process.env.NEXT_PUBLIC_WS_URL || "MISSING_WS_URL"}</code>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: editor (drafting/history) */}
      <section
        className="hidden md:flex fixed right-0 top-0 bottom-0 border-l border-slate-200 bg-white overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          width: paneVisible ? RIGHT_W : 0,
          opacity: paneVisible ? 1 : 0,
          pointerEvents: paneVisible ? "auto" : "none"
        }}
        aria-hidden={!paneVisible}
      >
        <div className="flex h-full w-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 h-12 px-5">
            <span className="font-medium truncate max-w-[60%]">{docTitle}</span>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 text-xs text-slate-600">
                {(status === "starting" || status === "generating") && (
                  <Loader2 size={14} className="animate-spin" />
                )}
                {status}
              </span>
              <span
                className="text-xs px-2 py-1 rounded-full border bg-slate-50 border-slate-200 text-slate-600"
                title="Approximate pages"
              >
                {pages} / {targetPages} pages
              </span>
              <button
                onClick={closePane}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-slate-100"
                title="Close"
                type="button"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* progress rail */}
          <div className="px-5 pt-2">
            <div className="h-1 w-full rounded bg-slate-100 overflow-hidden">
              <div
                className={`h-full transition-[width] duration-300 ${
                  showPreStreamSkeleton ? "bg-slate-200 animate-pulse" : "bg-blue-500"
                }`}
                style={{ width: showPreStreamSkeleton ? "35%" : `${progressPct}%` }}
              />
            </div>
          </div>

          <div
            ref={docScrollRef}
            onScroll={onRightPaneScroll}
            className={`relative flex-1 overflow-auto p-6 pb-24 hide-scrollbar ${
              showPreStreamSkeleton
                ? "bg-gradient-to-r from-white via-[#f7f9ff] to-white bg-[length:200%_100%] animate-[shimmer_1.6s_linear_infinite]"
                : "bg-white"
            }`}
            style={{ scrollbarGutter: "stable", contain: "layout paint size" }}
            aria-live="polite"
          >
            {showPreStreamSkeleton ? (
              <PreStreamSkeleton />
            ) : (selected && previewLoading) ? (
              <PreStreamSkeleton />
            ) : (
              <>
                {html.trim().length > 0 && <ShadowHTML html={html} />}

                {isStreaming && html.trim().length > 0 && stalled && (
                  <div className="mt-6 flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 size={14} className="animate-spin" />
                    Waiting for more…
                  </div>
                )}

                {isStreaming && html.trim().length > 0 && (
                  <div className="absolute right-6 bottom-6 h-5 w-[2px] bg-slate-800/70 animate-[blink_1s_steps(2,start)_infinite] pointer-events-none" />
                )}

                {!isStreaming && !html && selected?.s3Url && (
                  <div className="text-sm text-slate-500">
                    We couldn’t show a preview here.{" "}
                    <a className="underline" href={selected.s3Url} target="_blank" rel="noreferrer">
                      Open the original
                    </a>
                    .
                  </div>
                )}

                {!isStreaming && !html && !selected?.s3Url && (
                  <div className="text-sm text-slate-500">
                    Select a contract from history or start a new generation.
                  </div>
                )}
              </>
            )}
          </div>

          {/* footer actions */}
          <div className="relative z-30 border-t border-slate-200 bg-white/90 backdrop-blur px-6 py-3 pointer-events-auto">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px] text-slate-600">
                ~{pages} page{pages === 1 ? "" : "s"} generated
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={exportWord}
                  disabled={!html.trim().length && !downloadUrl && !selected?.s3Url}
                  className={`inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 ${
                    !html.trim().length && !downloadUrl && !selected?.s3Url
                      ? "opacity-50 cursor-not-allowed"
                      : "cursor-pointer"
                  }`}
                  title="Download (.doc)"
                  type="button"
                >
                  <Download size={16} /> Download
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}