export const TILE_IDS = ['date', 'clock', 'timer', 'text', 'camera', 'notes', 'wheel', 'prize', 'reminders', 'decibel', 'captions'];

const HIDDEN_TILES_KEY = 'classboard_hidden_tiles';

// Tiles the user has deliberately removed — via the Layout tool's
// checkboxes, or by dragging a pane's last page away — as opposed to one
// that's merely missing because the saved layout predates it being
// introduced. migrateLayout auto-heals the latter (grafting the tile back
// in) but leaves anything in this set alone, so an intentional removal
// sticks across reloads while a genuinely new tile type still appears for
// everyone automatically.
export function loadHiddenTileIds() {
  try {
    const s = JSON.parse(localStorage.getItem(HIDDEN_TILES_KEY) || '[]');
    if (Array.isArray(s)) return s.filter(id => TILE_IDS.includes(id));
  } catch (_) {}
  return [];
}

export function saveHiddenTileIds(ids) {
  localStorage.setItem(HIDDEN_TILES_KEY, JSON.stringify(ids));
}

/** Drop each of `hiddenIds` from a tree (e.g. a fresh DEFAULT_LAYOUT), so a
 *  period that's never had a layout saved still honors the user's hidden
 *  tiles instead of showing everything. */
export function stripHiddenTiles(tree, hiddenIds) {
  let next = tree;
  for (const id of hiddenIds) {
    if (collectLeaves(next).has(id)) next = removeLeaf(next, id) ?? next;
  }
  return next;
}

// A detached page (dragged out of a text-pane's tab strip) lives in the tree
// as a dynamically-created leaf of the form "pane-<id>" — these are allowed
// anywhere in the tree but, unlike TILE_IDS, aren't required. The older
// "text-pane-*"/"notes-pane-*" forms are still recognized for layouts saved
// before Board and Notes became one interchangeable pane type.
export function isDynamicPaneId(id) {
  return typeof id === 'string' && /^(pane-|text-pane-|notes-pane-)/.test(id);
}

// Any tile that hosts a text pane — the fixed "text"/"notes" tiles, or a
// detached pane — and so is a valid drop target to join tabs with.
export function isPaneTile(id) {
  return id === 'text' || id === 'notes' || isDynamicPaneId(id);
}

export function makePaneId() {
  return `pane-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// Tiles that can share one pane (switching between them with its ‹ ›
// arrows) — a combined pane is a single leaf joining their IDs with "+",
// e.g. "clock+timer", so each layout tree (per period, compact, presets)
// records for itself whether they're combined.
export const COMBINABLE_IDS = ['clock', 'timer'];

/** The tile IDs a leaf hosts — just itself, unless it's a combined leaf */
export function leafParts(id) {
  return typeof id === 'string' ? id.split('+') : [];
}

export function isCombinedLeaf(id) {
  return leafParts(id).length > 1;
}

/** Whether dragging leaf `fromId` onto leaf `toId` can combine them */
export function canCombine(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return false;
  const parts = [...leafParts(fromId), ...leafParts(toId)];
  return parts.every(p => COMBINABLE_IDS.includes(p)) && new Set(parts).size === parts.length;
}

/** All tile IDs present in a layout tree (a combined leaf counts as each
 *  of its parts) */
export function collectLeaves(node, out = new Set()) {
  if (typeof node === 'string') { leafParts(node).forEach(p => out.add(p)); return out; }
  collectLeaves(node.a, out);
  collectLeaves(node.b, out);
  return out;
}

/** The leaves of a tree exactly as stored — combined leaves left whole */
export function collectRawLeaves(node, out = []) {
  if (typeof node === 'string') { out.push(node); return out; }
  collectRawLeaves(node.a, out);
  collectRawLeaves(node.b, out);
  return out;
}

/** Replace leaf `id` (exact match) with `replacement` */
function replaceLeaf(node, id, replacement) {
  if (typeof node === 'string') return node === id ? replacement : node;
  return { ...node, a: replaceLeaf(node.a, id, replacement), b: replaceLeaf(node.b, id, replacement) };
}

/** Fold leaf `fromId` into leaf `toId`, making one combined pane */
export function combineLeaves(tree, fromId, toId) {
  if (!canCombine(fromId, toId)) return tree;
  const removed = removeLeaf(tree, fromId);
  if (!removed) return tree;
  return replaceLeaf(removed, toId, [...leafParts(toId), ...leafParts(fromId)].join('+'));
}

/** A tree saved back when the "clock" pane held both Period and Timer, with
 *  no "timer" of its own — keep both in that one pane, as they were then.
 *  (Full per-period layouts graft a separate Timer in instead.) */
export function combineLegacyClock(tree) {
  if (!tree || collectLeaves(tree).has('timer')) return tree;
  return replaceLeaf(tree, 'clock', 'clock+timer');
}

/** Split tile `partId` back out of combined leaf `leafId`, beside it */
export function splitLeaf(tree, leafId, partId, side = 'right') {
  const rest = leafParts(leafId).filter(p => p !== partId);
  if (rest.length === leafParts(leafId).length) return tree;
  const restId = rest.join('+');
  return insertLeaf(replaceLeaf(tree, leafId, restId), restId, partId, side);
}

export const DEFAULT_LAYOUT = {
  dir: 'h', ratio: 0.78,
  a: {
    dir: 'v', ratio: 0.22,
    a: 'text',
    b: 'camera',
  },
  b: {
    dir: 'v', ratio: 0.42,
    a: {
      dir: 'v', ratio: 0.28,
      a: 'reminders',
      b: { dir: 'v', ratio: 0.44, a: 'date', b: { dir: 'h', ratio: 0.5, a: 'clock', b: 'timer' } },
    },
    b: {
      dir: 'v', ratio: 0.38,
      a: { dir: 'v', ratio: 0.5, a: 'notes', b: 'captions' },
      b: { dir: 'v', ratio: 0.34, a: 'wheel', b: { dir: 'v', ratio: 0.5, a: 'prize', b: 'decibel' } },
    },
  },
};

// Where to graft a tile that a previously-saved layout predates.
const NEW_TILE_PLACEMENT = {
  reminders: { near: 'prize', side: 'bottom' },
  decibel: { near: 'prize', side: 'bottom' },
  captions: { near: 'notes', side: 'bottom' },
  timer: { near: 'clock', side: 'right' },
};

/** Remove a leaf by ID — or, given one part of a combined leaf, just that
 *  part; returns null if the leaf was the only node */
export function removeLeaf(node, id) {
  if (typeof node === 'string') {
    if (node === id) return null;
    const parts = leafParts(node);
    return parts.includes(id) ? parts.filter(p => p !== id).join('+') : node;
  }
  const a = removeLeaf(node.a, id);
  const b = removeLeaf(node.b, id);
  if (a === null) return b;
  if (b === null) return a;
  return { ...node, a, b };
}

/** Insert newId adjacent to targetId on the given side ('top'|'bottom'|'left'|'right') */
export function insertLeaf(node, targetId, newId, side) {
  if (typeof node === 'string') {
    // Targeting one part of a combined leaf docks beside the whole pane.
    if (node !== targetId && !leafParts(node).includes(targetId)) return node;
    targetId = node;
    const dir = (side === 'left' || side === 'right') ? 'h' : 'v';
    const [a, b] = (side === 'top' || side === 'left') ? [newId, targetId] : [targetId, newId];
    return { dir, ratio: 0.5, a, b };
  }
  return {
    ...node,
    a: insertLeaf(node.a, targetId, newId, side),
    b: insertLeaf(node.b, targetId, newId, side),
  };
}

/** Swap the positions of two leaves, keeping the rest of the tree (sizes, etc.) intact */
export function swapLeaves(node, idA, idB) {
  if (typeof node === 'string') {
    if (node === idA) return idB;
    if (node === idB) return idA;
    return node;
  }
  return { ...node, a: swapLeaves(node.a, idA, idB), b: swapLeaves(node.b, idA, idB) };
}

/** Move fromId to be adjacent to toId on the given side */
export function moveTile(tree, fromId, toId, side) {
  if (fromId === toId) return tree;
  const removed = removeLeaf(tree, fromId);
  if (!removed || typeof removed === 'string') return tree; // can't remove the only tile
  return insertLeaf(removed, toId, fromId, side);
}

/** Validate that a layout tree contains at least the expected tile IDs,
 *  other than any the user has deliberately hidden (plus, optionally, any
 *  number of detached-page panes alongside them) */
export function validateLayout(node, hiddenIds = []) {
  function check(n) {
    if (typeof n === 'string') {
      if (isCombinedLeaf(n)) return leafParts(n).every(p => COMBINABLE_IDS.includes(p));
      return TILE_IDS.includes(n) || isDynamicPaneId(n);
    }
    if (!n || !['h', 'v'].includes(n.dir) || typeof n.ratio !== 'number') return false;
    return check(n.a) && check(n.b);
  }
  if (!check(node)) return false;
  const leaves = collectLeaves(node);
  return TILE_IDS.filter(id => !hiddenIds.includes(id)).every(id => leaves.has(id));
}

/**
 * Bring a previously-saved layout up to date: drop any leaves we no longer
 * recognise, then graft in any tile IDs added since it was saved (near a
 * sensible neighbour, falling back to the first leaf) — skipping any the
 * user has deliberately hidden (see loadHiddenTileIds). Returns a tree that
 * should pass validateLayout, or null if it can't be salvaged.
 */
export function migrateLayout(node, hiddenIds = []) {
  if (!node) return null;
  let tree = node;

  for (const id of collectLeaves(tree)) {
    if (!TILE_IDS.includes(id) && !isDynamicPaneId(id)) {
      tree = removeLeaf(tree, id);
      if (!tree) return null;
    }
  }

  for (const id of TILE_IDS) {
    if (hiddenIds.includes(id)) continue;
    const leaves = collectLeaves(tree);
    if (leaves.has(id)) continue;
    const place = NEW_TILE_PLACEMENT[id];
    const anchor = place && leaves.has(place.near) ? place.near : [...leaves][0];
    if (!anchor) return null;
    tree = insertLeaf(tree, anchor, id, place?.side ?? 'bottom');
  }

  return tree;
}

export function loadLayout() {
  try {
    const saved = localStorage.getItem('classboard_layout_v2');
    if (saved) {
      const hidden = loadHiddenTileIds();
      const layout = migrateLayout(JSON.parse(saved), hidden);
      if (layout && validateLayout(layout, hidden)) return layout;
    }
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
}

export function saveLayout(layout) {
  localStorage.setItem('classboard_layout_v2', JSON.stringify(layout));
}
