import { state } from '../state.js';

export function openWatermarkPanel() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal watermark-modal';
  overlay.appendChild(modal);

  const wm = state.watermark;

  modal.innerHTML = `
    <div class="modal-header"><span>Watermark</span></div>
    <label class="field">
      <input type="checkbox" id="wm-enabled" ${wm.enabled ? 'checked' : ''}/>
      Add watermark to exported PDF
    </label>
    <label class="field">Text
      <input type="text" id="wm-text" value="${wm.text}" />
    </label>
    <label class="field">Opacity: <span id="wm-opacity-val">${wm.opacity}</span>
      <input type="range" id="wm-opacity" min="0.05" max="1" step="0.05" value="${wm.opacity}" />
    </label>
    <label class="field">Rotation: <span id="wm-rotation-val">${wm.rotation}°</span>
      <input type="range" id="wm-rotation" min="-90" max="90" step="5" value="${wm.rotation}" />
    </label>
    <label class="field">Font size: <span id="wm-fontsize-val">${wm.fontSize}</span>
      <input type="range" id="wm-fontsize" min="12" max="120" step="2" value="${wm.fontSize}" />
    </label>
    <label class="field">Color
      <input type="color" id="wm-color" value="${wm.color}" />
    </label>
    <div class="modal-actions">
      <button class="btn-sm" id="wm-close">Done</button>
    </div>
  `;

  modal.querySelector('#wm-enabled').addEventListener('change', (e) => (wm.enabled = e.target.checked));
  modal.querySelector('#wm-text').addEventListener('input', (e) => (wm.text = e.target.value));
  modal.querySelector('#wm-opacity').addEventListener('input', (e) => {
    wm.opacity = parseFloat(e.target.value);
    modal.querySelector('#wm-opacity-val').textContent = wm.opacity;
  });
  modal.querySelector('#wm-rotation').addEventListener('input', (e) => {
    wm.rotation = parseInt(e.target.value, 10);
    modal.querySelector('#wm-rotation-val').textContent = wm.rotation + '°';
  });
  modal.querySelector('#wm-fontsize').addEventListener('input', (e) => {
    wm.fontSize = parseInt(e.target.value, 10);
    modal.querySelector('#wm-fontsize-val').textContent = wm.fontSize;
  });
  modal.querySelector('#wm-color').addEventListener('input', (e) => (wm.color = e.target.value));
  modal.querySelector('#wm-close').addEventListener('click', () => overlay.remove());

  document.body.appendChild(overlay);
}
