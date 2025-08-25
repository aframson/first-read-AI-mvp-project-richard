"use client";
import { useEffect, useRef } from "react";

/** Sandboxed HTML renderer using Shadow DOM to prevent style bleed */
export default function ShadowHTML({ html }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    if (!host.shadowRoot) {
      host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = `
        :host { all: initial; display: block; }
        .doc-root { font: 10.5pt/1.45 system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif; color:#111; }
        .doc-root h1,.doc-root h2,.doc-root h3 { margin: 1.2em 0 .5em; }
        .doc-root ol { margin: 0 0 0 1.2em; }
        .doc-root .page-break { page-break-after: always; }
        @page { margin: 1in; }
        @media screen { .doc-root .page-break { border-top: 1px dashed #e5e7eb; margin: 28px 0; } }
      `;
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