"use client";
import { Loader2, X, Square, Download } from "lucide-react";
import ShadowHTML from "./ShadowHTML";
import PreStreamSkeleton from "./PreStreamSkeleton";
import PaginationControls from "./PaginationControls";

export default function MobilePreviewOverlay({
  isOpen,
  closeOverlay,
  docTitle,
  status,
  stop,
  showPreStreamSkeleton,
  progressPct,
  pageHtmls,
  currentPage,
  setCurrentPage,
  docScrollRef,
  onRightPaneScroll,
  visibleHtml,
  isStreaming,
  stalled,
  html,
  selected,
  downloadUrl,
  exportWord,
  pages
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/30" onClick={closeOverlay} aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 top-0 bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 h-12 px-4">
          <span className="font-medium truncate max-w-[60%]">{docTitle}</span>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 text-xs text-slate-600">
              {(status === "starting" || status === "generating") && (
                <Loader2 size={14} className="animate-spin" />
              )}
              {status}
            </span>
            {(status === "starting" || status === "generating") && (
              <button
                onClick={stop}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-50 active:scale-[.98]"
                title="Stop"
                aria-label="Stop generation"
                type="button"
              >
                <Square size={14} />
                Stop
              </button>
            )}
            <button
              onClick={closeOverlay}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-slate-100"
              title="Close"
              type="button"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* progress */}
        <div className="px-4 pt-2">
          <div className="h-1 w-full rounded bg-slate-100 overflow-hidden">
            <div
              className={`h-full transition-[width] duration-300 ${
                showPreStreamSkeleton ? "bg-slate-200 animate-pulse" : "bg-blue-500"
              }`}
              style={{ width: showPreStreamSkeleton ? "35%" : `${progressPct}%` }}
            />
          </div>
        </div>

        {/* pagination controls (mobile) */}
        <div className="px-4">
          <div className="sticky top-0 z-10 bg-white/85 backdrop-blur rounded-b-md">
            {pageHtmls.length > 0 && (
              <PaginationControls
                currentPage={currentPage}
                totalPages={pageHtmls.length}
                setCurrentPage={setCurrentPage}
              />
            )}
          </div>
        </div>

        <div
          ref={docScrollRef}
          onScroll={onRightPaneScroll}
          className={`relative flex-1 overflow-auto p-4 pb-24 hide-scrollbar ${
            showPreStreamSkeleton
              ? "bg-gradient-to-r from-white via-[#f7f9ff] to-white bg-[length:200%_100%] animate-[shimmer_1.6s_linear_infinite]"
              : "bg-white"
          }`}
          style={{ scrollbarGutter: "stable", contain: "layout paint size" }}
          aria-live="polite"
        >
          {showPreStreamSkeleton ? (
            <PreStreamSkeleton />
          ) : selected && selected.key && !visibleHtml ? (
            <PreStreamSkeleton />
          ) : (
            <>
              {/* Render only the current page */}
              {visibleHtml && <ShadowHTML html={visibleHtml} />}

              {/* {isStreaming && visibleHtml && stalled && (
                <div className="mt-6 flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 size={14} className="animate-spin" />
                  Waiting for more…
                </div>
              )} */}

              {isStreaming && visibleHtml && (
                <div className="absolute right-4 bottom-4 h-5 w-[2px] bg-slate-800/70 animate-[blink_1s_steps(2,start)_infinite] pointer-events-none" />
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
        <div className="border-t border-slate-200 bg-white/90 backdrop-blur px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-[12px] text-slate-600">~{pages} page{pages === 1 ? "" : "s"} generated</div>
            {pageHtmls.length > 0 && (
              <div className="">
                <PaginationControls
                  compact
                  currentPage={currentPage}
                  totalPages={pageHtmls.length}
                  setCurrentPage={setCurrentPage}
                />
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={exportWord}
                disabled={!html?.trim?.().length && !downloadUrl && !selected?.s3Url}
                className={`inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 ${
                  !html?.trim?.().length && !downloadUrl && !selected?.s3Url
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
    </div>
  );
}