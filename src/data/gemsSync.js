const GEMS_SYNC_GROUPS_KEY = "classboard_gems_sync_groups";

// Periods whose points are linked: each group is an array of period labels,
// and no label is in more than one group. A student who's on the roster of
// more than one period in a group (matched by name) has one shared total —
// points given or taken in any of them land in all of them.
export function loadGemsSyncGroups() {
  try {
    const s = localStorage.getItem(GEMS_SYNC_GROUPS_KEY);
    if (s) {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed) && parsed.every(g => Array.isArray(g) && g.every(l => typeof l === "string"))) return parsed;
    }
  } catch (_) {}
  return [];
}

export function saveGemsSyncGroups(groups) {
  localStorage.setItem(GEMS_SYNC_GROUPS_KEY, JSON.stringify(groups));
}

/** The other periods linked with this one, or [] if it's unlinked. */
export function gemsSyncMates(groups, label) {
  const group = groups.find(g => g.includes(label));
  return group ? group.filter(l => l !== label) : [];
}

/**
 * Returns a new groups array where `label` is linked with exactly
 * `mateLabels`. Anyone previously linked with it, or with any of the new
 * mates, is pulled out of their old group first.
 */
export function setGemsSyncGroup(groups, label, mateLabels) {
  const involved = new Set([label, ...mateLabels]);
  const cleaned = groups
    .map(g => g.filter(l => !involved.has(l)))
    .filter(g => g.length > 1);
  const newGroup = [label, ...mateLabels.filter(l => l !== label)];
  return newGroup.length > 1 ? [...cleaned, newGroup] : cleaned;
}

/**
 * Brings every student shared by periods in `labels` to the same total —
 * the highest any of those periods has for them — so a fresh link doesn't
 * drop anyone's points. Returns the full, updated period-data object.
 */
export function reconcileGems(periodData, labels) {
  const best = {};
  const seen = {};
  for (const l of labels) {
    for (const n of periodData[l]?.names || []) {
      seen[n] = (seen[n] || 0) + 1;
      best[n] = Math.max(best[n] || 0, periodData[l]?.gems?.[n] || 0);
    }
  }
  const next = { ...periodData };
  for (const l of labels) {
    const p = next[l];
    if (!Array.isArray(p?.names)) continue;
    const gems = { ...(p.gems || {}) };
    let changed = false;
    for (const n of p.names) {
      if (seen[n] > 1 && (gems[n] || 0) !== best[n]) { gems[n] = best[n]; changed = true; }
    }
    if (changed) next[l] = { ...p, gems };
  }
  return next;
}

/**
 * Merges `patch` into one period's entry, then mirrors it to linked
 * periods: any student whose points changed gets the same total in each
 * linked period that has them on its roster, and a student newly added
 * here picks up the total they already have there. Removing a student (or
 * renaming one away) doesn't touch the other periods. Returns the full,
 * updated period-data object.
 */
export function patchPeriodWithGemsSync(periodData, key, patch, groups = loadGemsSyncGroups()) {
  const before = periodData[key] || {};
  const after = { ...before, ...patch };
  const next = { ...periodData, [key]: after };
  const mates = gemsSyncMates(groups, key).filter(l => Array.isArray(next[l]?.names));
  if (!mates.length || (!("gems" in patch) && !("names" in patch))) return next;

  // New names here: carry over the total they have in a linked period.
  const priorNames = new Set(before.names || []);
  const added = (after.names || []).filter(n => !priorNames.has(n) && !after.gems?.[n]);
  if (added.length && before.names) {
    const gems = { ...(after.gems || {}) };
    let changed = false;
    for (const n of added) {
      const total = Math.max(0, ...mates.map(l => next[l].gems?.[n] || 0));
      if (total) { gems[n] = total; changed = true; }
    }
    if (changed) next[key] = { ...after, gems };
  }

  const oldGems = before.gems || {};
  const newGems = next[key].gems || {};
  const changedNames = Object.keys(newGems).filter(n => newGems[n] !== oldGems[n]);
  if (!changedNames.length) return next;
  for (const l of mates) {
    const p = next[l];
    const roster = new Set(p.names);
    const shared = changedNames.filter(n => roster.has(n) && (p.gems?.[n] || 0) !== newGems[n]);
    if (!shared.length) continue;
    const gems = { ...(p.gems || {}) };
    for (const n of shared) gems[n] = newGems[n];
    next[l] = { ...p, gems };
  }
  return next;
}
