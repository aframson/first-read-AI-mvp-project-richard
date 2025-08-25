"use client";
import { History } from "lucide-react";

export default function HistoryDesktop({
  leftOpen,
  setLeftOpen,
  history,
  selected,
  openFromHistory,
  summarizePrompt
}) {
  return (
    <aside
      className="hidden md:block fixed left-0 top-0 bottom-0 border-r border-slate-200 bg-white transition-[width] duration-300 ease-in-out overflow-hidden"
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
  );
}