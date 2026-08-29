import { useEffect, useRef } from 'react';
import Sortable from 'sortablejs';
import { Eye, EyeOff, Lock, LockOpen, Square, Circle, Minus, PenTool, Type, Image as ImageIcon } from 'lucide-react';
import { useDoc } from '../state/DocumentContext.jsx';

const TYPE_ICON = { rect: Square, ellipse: Circle, line: Minus, path: PenTool, text: Type, image: ImageIcon };

export default function LayersPanel() {
  const { objects, selectedIds, selectObjects, updateObjects, reorderAll } = useDoc();
  const listRef = useRef(null);

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

  if (!rows.length) {
    return <div className="panel-scroll"><p className="empty-hint">No layers yet.<br />Draw a shape or add an image to get started.</p></div>;
  }

  return (
    <div className="panel-scroll">
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
    </div>
  );
}
