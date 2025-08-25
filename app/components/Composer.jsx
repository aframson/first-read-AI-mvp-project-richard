"use client";
import { Play, Square } from "lucide-react";
import { useEffect, useRef } from "react";

export default function Composer({
  padLeft,
  padRight,
  suggestions,
  useSuggestion,
  prompt,
  setPrompt,
  onKeyDown,
  targetPages,
  setTargetPages,
  MIN_ALLOWED_PAGES,
  MAX_ALLOWED_PAGES,
  start,
  stop,
  isStreaming
}) {

     // NEW: autosize
  const textareaRef = useRef(null);
  const MAX_TXT_HEIGHT = 180;

  const autosize = (el) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_TXT_HEIGHT) + "px";
  };

  useEffect(() => {
    autosize(textareaRef.current);
  }, [prompt]);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-10 pointer-events-none transition-[padding] duration-300 ease-in-out"
      style={{ paddingLeft: padLeft, paddingRight: padRight }}
    >
      <div className="pointer-events-none bg-gradient-to-t from-white via-white/95 to-transparent h-20" />

      {/* badges */}
      <div className="mx-auto max-w-3xl px-4 pb-8 pointer-events-auto">
        <div className="flex items-center justify-between gap-2">
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 flex-1">
            {suggestions.slice(0, 9).map((s, i) => (
              <button
                key={i}
                onClick={() => useSuggestion(s)}
                className="inline-flex items-center justify-center text-center rounded-[10px] border border-slate-200 px-3 py-2 text-[12px] text-slate-600 hover:bg-slate-50"
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
            onInput={(e) => autosize(e.currentTarget)} 
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Describe the contract you need…"
            className="min-h-[40px] max-h-[180px] flex-1 resize-none rounded-[16px] px-3 py-2 outline-none placeholder:text-slate-400 overflow-y-auto hide-scrollbar"
            style={{ height: "auto" }} 
          />
          <div className="flex items-center gap-1 pb-1 pr-1">
            {/* Pages selector (hidden on xs for space) */}
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
                      setTargetPages(Math.min(MAX_ALLOWED_PAGES, Math.max(MIN_ALLOWED_PAGES, n)));
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
  );
}