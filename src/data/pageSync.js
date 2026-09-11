const PAGE_SYNC_GROUPS_KEY = "classboard_page_sync_groups";

// A "location" is one tab's slot: { period, paneId }. A group is an array of
// locations that all share the exact same page (tab) — same id, same
// content — kept in sync as it's edited from any of them. Unlike the older
// whole-pane sync, membership is per individual tab, so a pane can freely
// mix tabs that are shared across periods with tabs that are local-only.
export function loadPageSyncGroups() {
  try {
    const s = localStorage.getItem(PAGE_SYNC_GROUPS_KEY);
    if (s) {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed) && parsed.every(g => Array.isArray(g))) return parsed;
    }
  } catch (_) {}
  return [];
}

export function savePageSyncGroups(groups) {
  localStorage.setItem(PAGE_SYNC_GROUPS_KEY, JSON.stringify(groups));
}

const sameLoc = (a, b) => a.period === b.period && a.paneId === b.paneId;

/** Other locations sharing a sync group with this tab, or [] if it's unsynced. */
export function getPageSyncMates(groups, period, paneId, pageId) {
  const here = { period, paneId };
  const group = groups.find(g => g.some(m => m.pageId === pageId && sameLoc(m, here)));
  return group ? group.filter(m => !sameLoc(m, here)) : [];
}

/**
 * Returns a new groups array where this tab is synced with exactly
 * `mateLabels` (other period labels, sharing this same paneId). Anyone
 * previously grouped with this tab or any of the new mates is pulled out of
 * their old group first, then the new group is added (if it has 2+ members).
 */
export function setPageSyncGroup(groups, period, paneId, pageId, mateLabels) {
  const here = { period, paneId, pageId };
  const involved = new Set([`${period}|${paneId}`, ...mateLabels.map(l => `${l}|${paneId}`)]);
  const cleaned = groups
    .map(g => g.filter(m => !involved.has(`${m.period}|${m.paneId}`)))
    .filter(g => g.length > 1);
  const newGroup = [here, ...mateLabels.filter(l => l !== period).map(l => ({ period: l, paneId, pageId }))];
  return newGroup.length > 1 ? [...cleaned, newGroup] : cleaned;
}

/** Drop one location from whichever group contains it (e.g. its tab was closed). */
export function removePageSyncLocation(groups, period, paneId, pageId) {
  const here = { period, paneId };
  return groups
    .map(g => g.some(m => m.pageId === pageId && sameLoc(m, here))
      ? g.filter(m => !(m.pageId === pageId && sameLoc(m, here)))
      : g)
    .filter(g => g.length > 1);
}
