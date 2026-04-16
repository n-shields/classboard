export const TILE_IDS = ['clock', 'text', 'camera', 'notes', 'wheel', 'prize'];

export const DEFAULT_LAYOUT = {
  dir: 'h', ratio: 0.78,
  a: {
    dir: 'v', ratio: 0.22,
    a: 'text',
    b: 'camera',
  },
  b: {
    dir: 'v', ratio: 0.28,
    a: 'clock',
    b: {
      dir: 'v', ratio: 0.38,
      a: 'notes',
      b: {
        dir: 'v', ratio: 0.5,
        a: 'wheel', b: 'prize',
      },
    },
  },
};

/** Remove a leaf by ID; returns null if the leaf was the only node */
export function removeLeaf(node, id) {
  if (typeof node === 'string') return node === id ? null : node;
  const a = removeLeaf(node.a, id);
  const b = removeLeaf(node.b, id);
  if (a === null) return b;
  if (b === null) return a;
  return { ...node, a, b };
}

/** Insert newId adjacent to targetId on the given side ('top'|'bottom'|'left'|'right') */
export function insertLeaf(node, targetId, newId, side) {
  if (typeof node === 'string') {
    if (node !== targetId) return node;
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

/** Move fromId to be adjacent to toId on the given side */
export function moveTile(tree, fromId, toId, side) {
  if (fromId === toId) return tree;
  const removed = removeLeaf(tree, fromId);
  if (!removed || typeof removed === 'string') return tree; // can't remove the only tile
  return insertLeaf(removed, toId, fromId, side);
}

function collectLeaves(node, out = new Set()) {
  if (typeof node === 'string') { out.add(node); return out; }
  collectLeaves(node.a, out);
  collectLeaves(node.b, out);
  return out;
}

/** Validate that a layout tree contains exactly the expected tile IDs */
export function validateLayout(node) {
  function check(n) {
    if (typeof n === 'string') return TILE_IDS.includes(n);
    if (!n || !['h', 'v'].includes(n.dir) || typeof n.ratio !== 'number') return false;
    return check(n.a) && check(n.b);
  }
  if (!check(node)) return false;
  const leaves = collectLeaves(node);
  return TILE_IDS.every(id => leaves.has(id)) && leaves.size === TILE_IDS.length;
}

export function loadLayout() {
  try {
    const saved = localStorage.getItem('classboard_layout_v2');
    if (saved) {
      const layout = JSON.parse(saved);
      if (validateLayout(layout)) return layout;
    }
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
}

export function saveLayout(layout) {
  localStorage.setItem('classboard_layout_v2', JSON.stringify(layout));
}
