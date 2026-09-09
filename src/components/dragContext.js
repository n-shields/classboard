import { createContext } from "react";

// Shared drag context for TileLayout and the Board/Notes tab strips.
export const DragCtx = createContext(null);

// Custom drag-data type for a Board/Notes tab being dragged out of its pane's
// tab strip — distinguishes a "detach/merge this page" drag from a normal
// whole-tile reposition drag, which still uses plain "text/plain".
export const PAGE_DND_TYPE = "application/x-classboard-page";
