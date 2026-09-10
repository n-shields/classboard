import { collectLeaves, removeLeaf, insertLeaf } from "./layout";

export const TEACHER_TILE_IDS = ["clock", "reminders", "notes"];

export const DEFAULT_TEACHER_LAYOUT = {
  dir: "v", ratio: 0.32,
  a: "clock",
  b: { dir: "v", ratio: 0.22, a: "reminders", b: "notes" },
};

function validateTeacherLayout(node) {
  function check(n) {
    if (typeof n === "string") return TEACHER_TILE_IDS.includes(n);
    if (!n || !["h", "v"].includes(n.dir) || typeof n.ratio !== "number") return false;
    return check(n.a) && check(n.b);
  }
  if (!check(node)) return false;
  const leaves = collectLeaves(node);
  return TEACHER_TILE_IDS.every(id => leaves.has(id));
}

// Bring a previously-saved teacher layout up to date, the same way the main
// board's layout migrates when its tile set changes.
function migrateTeacherLayout(node) {
  if (!node) return null;
  let tree = node;

  for (const id of collectLeaves(tree)) {
    if (!TEACHER_TILE_IDS.includes(id)) {
      tree = removeLeaf(tree, id);
      if (!tree) return null;
    }
  }

  for (const id of TEACHER_TILE_IDS) {
    const leaves = collectLeaves(tree);
    if (leaves.has(id)) continue;
    const anchor = [...leaves][0];
    if (!anchor) return null;
    tree = insertLeaf(tree, anchor, id, "bottom");
  }

  return tree;
}

const TEACHER_LAYOUT_KEY = "classboard_teacher_layout";

export function loadTeacherLayout() {
  try {
    const saved = localStorage.getItem(TEACHER_LAYOUT_KEY);
    if (saved) {
      const layout = migrateTeacherLayout(JSON.parse(saved));
      if (layout && validateTeacherLayout(layout)) return layout;
    }
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_TEACHER_LAYOUT));
}

export function saveTeacherLayout(layout) {
  localStorage.setItem(TEACHER_LAYOUT_KEY, JSON.stringify(layout));
}
