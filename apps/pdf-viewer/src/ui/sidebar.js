import { state, removePage } from '../state.js';
import { renderPageToCanvas } from '../pdf/pdfSetup.js';
import Sortable from 'sortablejs';
import { buildPdfBytes, downloadBytes } from '../pdf/exportPdf.js';

let sortableInstance = null;

export function renderSidebar(container, { onSelectionChange, onActivate } = {}) {
  container.innerHTML = '';

  if (state.pages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Load one or more PDF files to get started.';
    container.appendChild(empty);
    return;
  }

  for (const page of state.pages) {
    const card = document.createElement('div');
    card.className = 'sidebar-item' + (state.activeKey === page.key ? ' active' : '');
    card.dataset.key = page.key;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.page-controls')) return;
      state.activeKey = page.key;
      onActivate?.(page.key);
      renderSidebar(container, { onSelectionChange, onActivate });
    });

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'thumb-wrap';
    const canvas = document.createElement('canvas');
    thumbWrap.appendChild(canvas);
    card.appendChild(thumbWrap);

    const doc = state.docs.get(page.docId);
    renderPageToCanvas(doc.pdfDoc, page.pageIndex, canvas, 0.35).catch(() => {});

    const label = document.createElement('div');
    label.className = 'page-label';
    const numBadge = page.detectedNumber != null ? ` · #${page.detectedNumber}` : '';
    label.textContent = `${doc.name} — p.${page.pageIndex + 1}${numBadge}`;
    card.appendChild(label);

    const controls = document.createElement('div');
    controls.className = 'page-controls';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selected.has(page.key);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selected.add(page.key);
      else state.selected.delete(page.key);
      onSelectionChange?.();
    });
    controls.appendChild(checkbox);

    const extractBtn = document.createElement('button');
    extractBtn.textContent = 'Extract';
    extractBtn.className = 'btn-sm';
    extractBtn.title = 'Download this page as its own PDF';
    extractBtn.addEventListener('click', async () => {
      const bytes = await buildPdfBytes([page]);
      downloadBytes(bytes, `${doc.name.replace(/\.pdf$/i, '')}-p${page.pageIndex + 1}.pdf`);
    });
    controls.appendChild(extractBtn);

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.className = 'btn-sm btn-danger';
    removeBtn.addEventListener('click', () => {
      const wasActive = state.activeKey === page.key;
      removePage(page.key);
      if (wasActive) onActivate?.(null);
      renderSidebar(container, { onSelectionChange, onActivate });
      onSelectionChange?.();
    });
    controls.appendChild(removeBtn);

    card.appendChild(controls);
    container.appendChild(card);
  }

  if (sortableInstance) sortableInstance.destroy();
  sortableInstance = Sortable.create(container, {
    animation: 150,
    ghostClass: 'drag-ghost',
    filter: 'input,button',
    preventOnFilter: false,
    onEnd: (evt) => {
      const [moved] = state.pages.splice(evt.oldIndex, 1);
      state.pages.splice(evt.newIndex, 0, moved);
    },
  });
}
