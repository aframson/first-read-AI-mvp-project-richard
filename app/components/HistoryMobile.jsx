"use client";
import { X } from "lucide-react";

export default function HistoryMobile({
  leftOpen,
  setLeftOpen,
  history,
  openFromHistory,
  summarizePrompt
}) {
  if (!leftOpen) return null;

  return (
    <div className="fixed inset-0 z-40" aria-modal="true" role="dialog">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={() => setLeftOpen(false)}
        aria-hidden="true"
      />
      <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-xl border-r border-slate-200">
        <div className="flex items-center justify-between px-3 py-3 border-b border-slate-200">
          <div className="font-semibold">History</div>
          <button
            onClick={() => setLeftOpen(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100"
            aria-label="Close history"
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="h-[calc(100%-48px)] overflow-y-auto p-2">
          {history.length === 0 && (
            <div className="text-sm text-slate-500 px-2 mt-2">No contracts yet.</div>
          )}
          <div className="mt-2 flex flex-col gap-1.5">
            {history.map((it) => (
              <button
                key={it.key}
                title={it.name || it.prompt}
                onClick={() => {
                  openFromHistory(it);
                  setLeftOpen(false);
                }}
                className="w-full text-left rounded-md px-3 py-2 hover:bg-slate-50 overflow-hidden min-w-0"
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
      </div>
    </div>
  );
}