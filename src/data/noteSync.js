const NOTE_SYNC_GROUPS_KEY = "classboard_note_sync_groups";

export function loadNoteSyncGroups() {
  try {
    const s = localStorage.getItem(NOTE_SYNC_GROUPS_KEY);
    if (s) {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed) && parsed.every(g => Array.isArray(g))) return parsed;
    }
  } catch (_) {}
  return [];
}

export function saveNoteSyncGroups(groups) {
  localStorage.setItem(NOTE_SYNC_GROUPS_KEY, JSON.stringify(groups));
}

/** Other period labels sharing a sync group with `label`, or [] if unsynced. */
export function getSyncMates(groups, label) {
  const group = groups.find(g => g.includes(label));
  return group ? group.filter(l => l !== label) : [];
}

/**
 * Returns a new groups array where `label` is synced with exactly `mateLabels`.
 * Anyone previously grouped with `label` or any of `mateLabels` is pulled out
 * of their old group first, then the new group is added (if it has 2+ members).
 */
export function setSyncGroup(groups, label, mateLabels) {
  const involved = new Set([label, ...mateLabels]);
  const cleaned = groups
    .map(g => g.filter(l => !involved.has(l)))
    .filter(g => g.length > 1);
  const newGroup = [label, ...mateLabels.filter(l => l !== label)];
  return newGroup.length > 1 ? [...cleaned, newGroup] : cleaned;
}
