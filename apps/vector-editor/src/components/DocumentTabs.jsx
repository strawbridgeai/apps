import { useRef, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { useWorkspace, TAB_DRAG_TYPE } from '../state/Workspace.jsx';

// How long a dragged tab must hover another tab before that tab opens, so
// the drag can carry on and land at a precise spot on its canvas.
const HOVER_SWITCH_MS = 550;

// Browser-style document tabs. Drag a tab onto another tab to drop its
// artwork into that document as a new layer, or hover there to switch to
// it and release over the canvas to place it exactly.
export default function DocumentTabs({ onNew }) {
  const { tabs, activeId, setActiveId, closeTab, transferTab, draggingRef } = useWorkspace();
  const [overId, setOverId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const hoverTimer = useRef(null);

  const clearHover = () => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setOverId(null);
  };

  return (
    <div className="doc-tabs" role="tablist" aria-label="Open documents">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        const isDropTarget = overId === tab.id && dragId && dragId !== tab.id;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            draggable
            title={tabs.length > 1 ? `${tab.title} — drag onto another tab to add it as a layer there` : tab.title}
            className={`doc-tab ${isActive ? 'active' : ''} ${isDropTarget ? 'drop-target' : ''} ${dragId === tab.id ? 'dragging' : ''}`}
            onClick={() => setActiveId(tab.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setActiveId(tab.id)}
            onAuxClick={(e) => e.button === 1 && closeTab(tab.id)}
            onDragStart={(e) => {
              e.dataTransfer.setData(TAB_DRAG_TYPE, tab.id);
              e.dataTransfer.effectAllowed = 'copy';
              draggingRef.current = tab.id;
              setDragId(tab.id);
            }}
            onDragEnd={() => {
              draggingRef.current = null;
              setDragId(null);
              clearHover();
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE) || draggingRef.current === tab.id) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              if (overId !== tab.id) {
                clearHover();
                setOverId(tab.id);
                if (!isActive) hoverTimer.current = setTimeout(() => setActiveId(tab.id), HOVER_SWITCH_MS);
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) clearHover();
            }}
            onDrop={(e) => {
              const from = e.dataTransfer.getData(TAB_DRAG_TYPE);
              clearHover();
              if (!from || from === tab.id) return;
              e.preventDefault();
              setActiveId(tab.id);
              transferTab(from, tab.id);
            }}
          >
            <span className="doc-tab-title">{tab.title}</span>
            <button
              type="button"
              className="doc-tab-close"
              title="Close tab"
              draggable={false}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              <X />
            </button>
          </div>
        );
      })}
      <button type="button" className="doc-tab-new" title="New document tab" onClick={onNew}>
        <Plus />
      </button>
    </div>
  );
}
