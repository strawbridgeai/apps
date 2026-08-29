import { useEffect, useRef } from 'react';
import Sortable from 'sortablejs';
import { Eye, EyeOff, Lock, LockOpen, Square, Circle, Minus, PenTool, Type, Image as ImageIcon, Plus } from 'lucide-react';
import { useDoc } from '../state/DocumentContext.jsx';
import { createShape } from '../lib/shapes.js';

const TYPE_ICON = { rect: Square, ellipse: Circle, line: Minus, path: PenTool, text: Type, image: ImageIcon };

export default function LayersPanel() {
  const { doc, objects, selectedIds, selectObjects, updateObjects, reorderAll, addObjects } = useDoc();
  const listRef = useRef(null);

  // GIMP-style "New Layer": this app has no bare empty-layer concept (every
  // layer is a drawable object), so the closest equivalent is a fresh
  // default rectangle, centered on the canvas and auto-selected.
  const addLayer = () => {
    const width = 160;
    const height = 160;
    addObjects([createShape('rect', { x: doc.width / 2 - width / 2, y: doc.height / 2 - height / 2, width, height })]);
  };

  // Rendered top-to-bottom = front-to-back, i.e. reverse of z-order array.
  const rows = [...objects].reverse();

  useEffect(() => {
    if (!listRef.current) return;
    const sortable = Sortable.create(listRef.current, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      handle: '.layer-row',
      onEnd: () => {
        const displayedIds = [...listRef.current.children].map((el) => el.dataset.id);
        reorderAll([...displayedIds].reverse());
      },
    });
    return () => sortable.destroy();
  }, [objects.length, reorderAll]);

  return (
    <div className="layers-panel">
      <div className="panel-scroll">
        {rows.length ? (
          <div ref={listRef}>
            {rows.map((obj) => {
              const Icon = TYPE_ICON[obj.type] || Square;
              const selected = selectedIds.includes(obj.id);
              return (
                <div
                  key={obj.id}
                  data-id={obj.id}
                  className={`layer-row ${selected ? 'selected' : ''} ${!obj.visible ? 'dim' : ''}`}
                  onClick={(e) => {
                    if (e.shiftKey) {
                      selectObjects(selected ? selectedIds.filter((id) => id !== obj.id) : [...selectedIds, obj.id]);
                    } else {
                      selectObjects([obj.id]);
                    }
                  }}
                >
                  <Icon className="layer-icon" />
                  <input
                    className="layer-name"
                    value={obj.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateObjects([obj.id], () => ({ name: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    title={obj.locked ? 'Unlock' : 'Lock'}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateObjects([obj.id], () => ({ locked: !obj.locked }));
                    }}
                  >
                    {obj.locked ? <Lock /> : <LockOpen />}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title={obj.visible ? 'Hide' : 'Show'}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateObjects([obj.id], () => ({ visible: !obj.visible }));
                    }}
                  >
                    {obj.visible ? <Eye /> : <EyeOff />}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="empty-hint">No layers yet.<br />Draw a shape, add an image, or hit + below to get started.</p>
        )}
      </div>
      <div className="layers-toolbar">
        <button type="button" className="icon-btn" title="Add layer" onClick={addLayer}>
          <Plus />
        </button>
      </div>
    </div>
  );
}
