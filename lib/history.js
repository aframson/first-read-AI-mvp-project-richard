// lib/history.js

const LS_KEY = "fr_history";

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveHistory(nextArray) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(nextArray || []));
  } catch {}
}

/** Pure array helper — caller is responsible for calling saveHistory(next) */
export function renameHistoryItemInArray(history = [], key, name) {
  if (!key || !name) return history;
  return history.map((it) => (it.key === key ? { ...it, name } : it));
}