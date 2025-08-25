"use client";
import { Loader2, X, Download } from "lucide-react";
import ShadowHTML from "./ShadowHTML";
import PreStreamSkeleton from "./PreStreamSkeleton";
import PaginationControls from "./PaginationControls";

export default function DesktopPreviewPane({
  paneVisible,
  RIGHT_W,
  docTitle,
  status,
  pages,
  targetPages,
  closePane,
  progressPct,
  showPreStreamSkeleton,
  selected,
  previewLoading,
  visibleHtml,
  isStreaming,
  stalled,
  html,
  downloadUrl,
  exportWord,
  pageHtmls,
  currentPage,
  setCurrentPage,
  onRightPaneScroll,
  docScrollRef
}) {
  return (
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
              {status === "starting" && <Loader2 size={14} className="animate-spin" />}
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
            <div className="h-full bg-blue-500 transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* pagination (sticky) */}
        <div className="px-5">
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
          className={`relative flex-1 overflow-auto p-6 pb-24 ${
            showPreStreamSkeleton
              ? "bg-gradient-to-r from-white via-[#f7f9ff] to-white bg-[length:200%_100%] animate-[shimmer_1.6s_linear_infinite]"
              : "bg-white"
          } hide-scrollbar`}
          style={{ scrollbarGutter: "stable", contain: "layout paint size" }}
          aria-live="polite"
        >
          {showPreStreamSkeleton ? (
            <PreStreamSkeleton />
          ) : selected && previewLoading ? (
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-[12px] text-slate-600">~{pages} page{pages === 1 ? "" : "s"} generated</div>

            {/* duplicate compact pagination in footer */}
            {pageHtmls.length > 0 && (
              <div className="sm:order-last">
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
  );
}