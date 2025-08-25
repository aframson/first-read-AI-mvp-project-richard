"use client";
import { History, Eye } from "lucide-react";
import Image from "next/image";

export default function TopBar({
  docTitle,
  isStreaming,
  status,
  pages,
  targetPages,
  onToggleHistory,
  onOpenMobilePreview
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* History toggle (always visible) */}
          <button
            onClick={onToggleHistory}
            className="inline-flex md:hidden h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100"
            title="History"
            type="button"
          >
            <History size={18} />
          </button>
          <Image src={"/logo.svg"} alt="FirstRead" width={100} height={28} />
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden xs:block text-sm font-medium text-slate-700 max-w-[40vw] truncate">
            {docTitle}
          </div>
          {/* status badge */}
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
          {/* pages badge */}
          <div
            className={`hidden sm:block text-xs px-2 py-1 rounded-full border ${
              pages >= targetPages
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-slate-50 border-slate-200 text-slate-600"
            }`}
            title="Approximate pages generated so far"
          >
            {pages} / {targetPages} pages
          </div>

          {/* Mobile preview toggle */}
          <button
            onClick={onOpenMobilePreview}
            className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100"
            title="Open preview"
            type="button"
          >
            <Eye size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}