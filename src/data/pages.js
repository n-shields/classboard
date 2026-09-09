// Shared helpers for the Board/Notes "pages" model: a flat pool of pages
// (`{ id, html, fontSize }`) per period, plus a `panes` map recording which
// pane instance (the main tile, or a detached tile dragged out of it) shows
// which pages, in what order — `{ [paneId]: pageId[] }`.

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

// One-time migration of a period's old fixed-3 texts/notes arrays into the
// new pages+panes shape. Returns null if `period` is already migrated, or if
// it never had the old shape in the first place (nothing to convert — a
// period with no texts/notes yet should stay empty, not get blank pages
// stamped onto it just for existing), otherwise the { pages, panes } to merge in.
export function migratePeriodPages(period, { textKey, fontKey, pagesKey, panesKey, mainPaneId, defaultFont }) {
  if (isPageArray(period?.[pagesKey]) && isPanesMap(period?.[panesKey])) return null;
  if (!Array.isArray(period?.[textKey])) return null;
  const oldFonts = Array.isArray(period?.[fontKey]) ? period[fontKey] : [];
  const pages = period[textKey].map((html, i) => makePage(html || "", oldFonts[i] ?? defaultFont));
  return { [pagesKey]: pages, [panesKey]: { [mainPaneId]: pages.map(p => p.id) } };
}

// Pages a given pane currently shows, in the pane's own order.
export function pagesForPane(pages, panes, paneId) {
  const ids = panes?.[paneId] ?? [];
  const byId = new Map(pages.map(p => [p.id, p]));
  return ids.map(id => byId.get(id)).filter(Boolean);
}

// "text" | "notes" | null — which page family a pane id belongs to.
export function paneTypeOf(paneId) {
  if (!paneId) return null;
  if (paneId === "text" || paneId.startsWith("text-pane-")) return "text";
  if (paneId === "notes" || paneId.startsWith("notes-pane-")) return "notes";
  return null;
}

// Is `tileId` a Board/Notes pane of the same family as `paneId`? Used to tell
// a merge target (drop anywhere on it to join its tabs) from a plain tile
// (drop on an edge to pop out a brand-new pane there).
export function isSamePaneFamily(tileId, paneId) {
  const type = paneTypeOf(paneId);
  return !!type && paneTypeOf(tileId) === type;
}
