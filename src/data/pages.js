// Shared helpers for the text-pane "pages" model: a flat pool of pages
// (`{ id, html, fontSize }`) per period, plus a `panes` map recording which
// pane instance (the "text" or "notes" tile, or a tile detached from either)
// shows which pages, in what order — `{ [paneId]: pageId[] }`. There's no
// distinction between a "Board" page and a "Notes" page — any page can live
// in any pane — so this is one pool per period, not one per pane type.

export function genPageId() {
  return `pg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function makePage(html = "", fontSize = 48) {
  return { id: genPageId(), html, fontSize };
}

export function isPageArray(v) {
  return Array.isArray(v) && v.every(p => p && typeof p.id === "string" && typeof p.html === "string");
}

export function isPanesMap(v) {
  return v && typeof v === "object" && !Array.isArray(v)
    && Object.values(v).every(list => Array.isArray(list) && list.every(id => typeof id === "string"));
}

// One-time migration of a period's old text-pane data — whichever stage it's
// in — into the unified { pages, panes } shape. Returns null if already
// migrated, or if there was never any text-pane data for this period (stays
// empty rather than getting blank pages stamped on just for existing).
export function migrateToUnifiedPages(period) {
  if (isPageArray(period?.pages) && isPanesMap(period?.panes)) return null;

  // Already-migrated two-pool stage (textPages/notePages + textPanes/notePanes)
  if (isPageArray(period?.textPages) || isPageArray(period?.notePages)) {
    const pages = [...(period.textPages || []), ...(period.notePages || [])];
    const panes = { ...(period.textPanes || {}), ...(period.notePanes || {}) };
    return { pages, panes };
  }

  // Original fixed-3-array stage (texts/textFontSizes, notes/noteFontSizes)
  if (!Array.isArray(period?.texts) && !Array.isArray(period?.notes)) return null;
  const pages = [];
  const panes = {};
  if (Array.isArray(period.texts)) {
    const fonts = Array.isArray(period.textFontSizes) ? period.textFontSizes : [];
    const textPages = period.texts.map((html, i) => makePage(html || "", fonts[i] ?? 48));
    pages.push(...textPages);
    panes.text = textPages.map(p => p.id);
  }
  if (Array.isArray(period.notes)) {
    const fonts = Array.isArray(period.noteFontSizes) ? period.noteFontSizes : [];
    const notePages = period.notes.map((html, i) => makePage(html || "", fonts[i] ?? 20));
    pages.push(...notePages);
    panes.notes = notePages.map(p => p.id);
  }
  return { pages, panes };
}

// Pages a given pane currently shows, in the pane's own order.
export function pagesForPane(pages, panes, paneId) {
  const ids = panes?.[paneId] ?? [];
  const byId = new Map(pages.map(p => [p.id, p]));
  return ids.map(id => byId.get(id)).filter(Boolean);
}
