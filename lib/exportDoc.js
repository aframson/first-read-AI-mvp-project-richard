// lib/exportDoc.js
import { buildWordHtmlFromFragment, extractTitleFromHtml } from "./html";

/**
 * Export to .doc with the same fallback order you had:
 *  1) downloadUrl (fresh S3 html)
 *  2) selectedS3Url (history item)
 *  3) htmlFragment currently in memory (wrap into full Word HTML)
 */
export async function exportWordWithS3({ htmlFragment, downloadUrl, selectedS3Url }) {
  try {
    let htmlToSave = "";

    if (downloadUrl) {
      const res = await fetch(downloadUrl, { cache: "no-store" });
      htmlToSave = await res.text();
    } else if (selectedS3Url) {
      const res = await fetch(selectedS3Url, { cache: "no-store" });
      htmlToSave = await res.text();
    } else if (htmlFragment?.trim().length) {
      htmlToSave = buildWordHtmlFromFragment(htmlFragment);
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