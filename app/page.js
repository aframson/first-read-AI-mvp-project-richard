"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { connectWS } from "../lib/ws";

/* NEW lib imports */
import {
  extractTitleFromHtml,
  summarizePrompt,
  sanitizeSavedHtmlDoc,
  countWords,
  splitPages
} from "../lib/html";
import { createChunkTransformer } from "../lib/streaming";
import {
  loadHistory,
  saveHistory,
  renameHistoryItemInArray
} from "../lib/history";
import { exportWordWithS3 } from "../lib/exportDoc";

/* Components */
import TopBar from "./components/TopBar";
import HistoryDesktop from "./components/HistoryDesktop";
import HistoryMobile from "./components/HistoryMobile";
import Composer from "./components/Composer";
import DesktopPreviewPane from "./components/DesktopPreviewPane";
import MobilePreviewOverlay from "./components/MobilePreviewOverlay";

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

  // responsive flags
  const [isMdUp, setIsMdUp] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsMdUp(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  // mobile overlay
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  // collapsible history rail (desktop) / drawer (mobile)
  const [leftOpen, setLeftOpen] = useState(false);

  // live pages (approx)
  const [pages, setPages] = useState(0);
  const pageBreaksRef = useRef(0);
  const lastPageEstRef = useRef(0);

  // target pages
  const [targetPages, setTargetPages] = useState(10);
  const targetPagesRef = useRef(targetPages);
  useEffect(() => {
    targetPagesRef.current = targetPages;
  }, [targetPages]);

  const MIN_ALLOWED_PAGES = 3;
  const MAX_ALLOWED_PAGES = 40;
  const WORDS_PER_PAGE = 350;

  // stall indicator (drafting)
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

  // streaming sanitizer state
  const blockedTagRef = useRef(null); // null | "style" | "script" | "head"

  // auto-scroll control
  const shouldAutoScrollRef = useRef(true);
  const rafScrollScheduled = useRef(false);

  // streaming + skeleton state
  const isStreaming = status === "starting" || status === "generating";
  const noTokensYet = html.trim().length === 0;
  const showPreStreamSkeleton = isStreaming && noTokensYet;

  // pane visibility (desktop)
  const paneHasContent = isStreaming || html.trim().length > 0 || !!selected;
  const paneVisible = !paneClosed && paneHasContent;

  // widths (desktop)
  const RIGHT_W = 840;
  const LEFT_OPEN_W = 256;
  const LEFT_CLOSED_W = 48;

  // history rename wrapper -> uses lib helpers
  function renameHistoryItem(key, name) {
    setHistory((h) => {
      const next = renameHistoryItemInArray(h, key, name);
      saveHistory(next);
      return next;
    });
  }

  /* ---------- streaming chunk transformer (uses latest target via ref) ---------- */
  const transformChunkRespectingLimit = useMemo(
    () =>
      createChunkTransformer({
        getTargetPages: () => targetPagesRef.current,
        pageBreaksRef,
        setPages,
        blockedTagRef
      }),
    [] // safe: reads latest via getTargetPages() ref
  );

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

              // opportunistic title update
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

          // cap visible pages
          if (pageBreaksRef.current >= targetPagesRef.current - 1) {
            try {
              socketRef.current?.close(4001, "target-pages-reached");
            } catch {}
          }
        } else if (msg.type === "page") {
          const val = Math.min(Number(msg.value || 0), Math.max(1, targetPagesRef.current));
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
              saveHistory(next);
              return next;
            });
            setSelected(item);
            setPreviewLoading(false);
            if (derivedName) setDocTitle(derivedName);
            if (!isMdUp) setMobilePreviewOpen(true);
          }
        } else if (msg.type === "presigned") {
          setHistory((h) => {
            const next = h.map((it) => (it.key === msg.key ? { ...it, s3Url: msg.s3Url } : it));
            saveHistory(next);
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
    const saved = loadHistory();
    setHistory(saved);
    initSocket(null);
    return () => {
      try {
        const ws = socketRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) ws.close(1000, "unmount");
      } catch {}
    };
  }, []);

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
    setStatus("starting");
    setDownloadUrl(null);
    setSelected(null);
    setPaneClosed(false);
    setDocTitle("Document");
    shouldAutoScrollRef.current = true;

    setPages(0);
    pageBreaksRef.current = 0;
    lastPageEstRef.current = 0;
    blockedTagRef.current = null;
    lastDeltaAtRef.current = Date.now();
    setStalled(false);

    // open preview overlay immediately on mobile
    if (!isMdUp) setMobilePreviewOpen(true);
    setCurrentPage(1);

    const ws = socketRef.current;
    const isOpen = ws && ws.readyState === WebSocket.OPEN;
    const payload = { action: "start", prompt, targetPages: targetPagesRef.current };
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
    setMobilePreviewOpen(false);
    setSelected(null);
  }

  async function openFromHistory(it) {
    setSelected(it);
    setPaneClosed(false);
    if (!isMdUp) setMobilePreviewOpen(true);

    setHtml("");
    setStatus("idle");
    setPreviewLoading(true);
    shouldAutoScrollRef.current = true;

    setPages(0);
    pageBreaksRef.current = 0;
    lastPageEstRef.current = 0;
    blockedTagRef.current = null;
    setStalled(false);
    setDocTitle(it.name || "Document");
    setCurrentPage(1);

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

  function useSuggestion(text) {
    setPrompt(text);
    textareaRef.current?.focus();
  }

  // Export to MS Word (.doc) via lib
  const exportWord = () =>
    exportWordWithS3({
      htmlFragment: html,
      downloadUrl,
      selectedS3Url: selected?.s3Url
    });

  const progressPct = Math.max(0, Math.min(100, (pages / Math.max(targetPages, 1)) * 100));

  // computed paddings (desktop only)
  const padLeft = isMdUp ? (leftOpen ? LEFT_OPEN_W : LEFT_CLOSED_W) : 0;
  const padRight = isMdUp && paneVisible ? RIGHT_W : 0;

  /* ---------- PAGINATION (robust split) ---------- */
  const pageHtmls = useMemo(() => splitPages(html), [html]);
  const [currentPage, setCurrentPage] = useState(1);

  // clamp & auto-advance while streaming
  useEffect(() => {
    const total = Math.max(1, pageHtmls.length);
    if (currentPage > total) setCurrentPage(total);
    if (isStreaming && total > 0) setCurrentPage(total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageHtmls.length, isStreaming]);

  const visibleHtml =
    pageHtmls.length > 0 ? pageHtmls[Math.min(currentPage - 1, pageHtmls.length - 1)] : "";

  return (
    <div className="h-screen bg-white text-slate-900">
      {/* globals */}
      <style jsx global>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .page-break { border-top: 1px dashed #e5e7eb; margin: 28px 0; }
        @media print { .page-break { page-break-after: always; } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
      `}</style>

      {/* LEFT rail (desktop) */}
      <HistoryDesktop
        leftOpen={leftOpen}
        setLeftOpen={setLeftOpen}
        history={history}
        selected={selected}
        openFromHistory={openFromHistory}
        summarizePrompt={summarizePrompt}
      />

      {/* MOBILE: History drawer */}
      {!isMdUp && (
        <HistoryMobile
          leftOpen={leftOpen}
          setLeftOpen={setLeftOpen}
          history={history}
          openFromHistory={openFromHistory}
          summarizePrompt={summarizePrompt}
        />
      )}

      {/* MAIN (center) */}
      <div
        className="h-full transition-[padding] duration-300 ease-in-out"
        style={{ paddingLeft: padLeft, paddingRight: padRight }}
      >
        <TopBar
          docTitle={docTitle}
          isStreaming={isStreaming}
          status={status}
          pages={pages}
          targetPages={targetPages}
          onToggleHistory={() => setLeftOpen((o) => !o)}
          onOpenMobilePreview={() => setMobilePreviewOpen(true)}
        />

        {/* Hero (kept minimal) */}
        <main className="mx-auto max-w-3xl px-5">
          <div className="w-full flex items-start justify-center mt-3 mb-24">
            <div className="text-center text-slate-500 mt-[20vh]">
              <Image src={"/logo.svg"} alt="FirstRead" width={250} height={80} />
            </div>
          </div>
        </main>

        <Composer
          padLeft={padLeft}
          padRight={padRight}
          suggestions={suggestions}
          useSuggestion={useSuggestion}
          prompt={prompt}
          setPrompt={setPrompt}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              start();
            }
          }}
          targetPages={targetPages}
          setTargetPages={setTargetPages}
          MIN_ALLOWED_PAGES={MIN_ALLOWED_PAGES}
          MAX_ALLOWED_PAGES={MAX_ALLOWED_PAGES}
          start={start}
          stop={stop}
          isStreaming={isStreaming}
        />
      </div>

      <DesktopPreviewPane
        paneVisible={paneVisible}
        RIGHT_W={RIGHT_W}
        docTitle={docTitle}
        status={status}
        pages={pages}
        targetPages={targetPages}
        closePane={closePane}
        progressPct={progressPct}
        showPreStreamSkeleton={showPreStreamSkeleton}
        selected={selected}
        previewLoading={previewLoading}
        visibleHtml={visibleHtml}
        isStreaming={isStreaming}
        stalled={stalled}
        html={html}
        downloadUrl={downloadUrl}
        exportWord={exportWord}
        pageHtmls={pageHtmls}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onRightPaneScroll={onRightPaneScroll}
        docScrollRef={docScrollRef}
      />

      {/* MOBILE: Preview overlay */}
      <MobilePreviewOverlay
        isOpen={!isMdUp && mobilePreviewOpen}
        closeOverlay={() => setMobilePreviewOpen(false)}
        docTitle={docTitle}
        status={status}
        stop={stop}
        showPreStreamSkeleton={showPreStreamSkeleton}
        progressPct={progressPct}
        pageHtmls={pageHtmls}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        docScrollRef={docScrollRef}
        onRightPaneScroll={onRightPaneScroll}
        visibleHtml={visibleHtml}
        isStreaming={isStreaming}
        stalled={stalled}
        html={html}
        selected={selected}
        downloadUrl={downloadUrl}
        exportWord={exportWord}
        pages={pages}
      />
    </div>
  );
}