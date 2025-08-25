"use client";

export default function PreStreamSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-5 w-2/3 rounded bg-slate-200/90 mb-4" />
      {Array.from({ length: 22 }).map((_, i) => (
        <div
          key={i}
          className="h-3 rounded bg-slate-200/80 mb-2"
          style={{ width: `${90 - (i % 6) * 8}%` }}
        />
      ))}
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