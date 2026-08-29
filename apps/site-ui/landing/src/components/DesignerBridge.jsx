import { useEffect } from 'react';
import { applyCssVarLive, applyTextPatchLive, setConfigOverride } from '../lib/designerLive.js';

// Mirrors lib/cssVars.js's GRADIENT_PRESETS - a live-preview-only copy since
// the admin panel needs the actual resolved CSS value to set live, not just
// the preset name the server stores. Small and static enough that
// duplicating it here (rather than sharing code across these two
// separately-deployed apps) is the pragmatic choice.
const GRADIENT_PRESETS = {
  none: 'none',
  'forest-mist':
    'radial-gradient(ellipse 70% 50% at 15% -10%, rgba(79, 157, 79, 0.14), transparent 60%),' +
    'radial-gradient(ellipse 60% 45% at 100% 10%, rgba(47, 168, 156, 0.12), transparent 60%),' +
    'radial-gradient(ellipse 55% 40% at 50% 120%, rgba(224, 216, 63, 0.10), transparent 60%)',
  sunrise:
    'radial-gradient(ellipse 75% 55% at 20% -10%, rgba(224, 175, 63, 0.16), transparent 60%),' +
    'radial-gradient(ellipse 60% 45% at 100% 5%, rgba(224, 120, 63, 0.12), transparent 60%)',
  lagoon:
    'radial-gradient(ellipse 70% 55% at 10% -5%, rgba(47, 168, 156, 0.16), transparent 60%),' +
    'radial-gradient(ellipse 60% 45% at 100% 15%, rgba(63, 143, 200, 0.12), transparent 60%)',
};

function applyLiveSet(msg) {
  const { targetKind, name, path, patchId, value } = msg;
  if (targetKind === 'cssVar') {
    if (msg.preset) applyCssVarLive(name, GRADIENT_PRESETS[value] ?? GRADIENT_PRESETS.none);
    else applyCssVarLive(name, value);
  } else if (targetKind === 'config') {
    setConfigOverride(path, value);
  } else if (targetKind === 'textPatch') {
    applyTextPatchLive(patchId, value);
  }
}

// Click-to-select overlay for the Site Designer preview iframe only —
// mounted by App.jsx solely when `?designer=1` is present, which the real
// published site never receives, so this is inert dead code there. Hovers
// draw an outline around any `[data-designer-id]` ancestor of the cursor;
// clicking posts the object id to the parent dashboard (DesignerTab.jsx /
// useSiteDesigner in site-ui/admin), which scrolls to and highlights that
// object's fields in the left panel. Same-origin (this preview and the
// dashboard are both served by the one Express app), so the postMessage
// target origin is exact, not '*'.
export function DesignerBridge() {
  useEffect(() => {
    const outline = document.createElement('div');
    outline.style.cssText =
      'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #24968a;' +
      'border-radius:4px;transition:left 0.08s ease-out,top 0.08s ease-out,width 0.08s ease-out,height 0.08s ease-out;display:none;';
    document.body.appendChild(outline);

    function findTarget(e) {
      return e.target.closest?.('[data-designer-id]') || null;
    }

    function onOver(e) {
      const el = findTarget(e);
      if (!el) {
        outline.style.display = 'none';
        return;
      }
      const r = el.getBoundingClientRect();
      Object.assign(outline.style, {
        display: 'block',
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
    }

    function onOut(e) {
      if (!e.relatedTarget || !e.relatedTarget.closest?.('[data-designer-id]')) outline.style.display = 'none';
    }

    function onClick(e) {
      const el = findTarget(e);
      if (!el) return;
      e.preventDefault();
      window.parent.postMessage({ type: 'site-designer:select', objectId: el.getAttribute('data-designer-id') }, window.location.origin);
    }

    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout', onOut, true);
    document.addEventListener('click', onClick, true);

    // Incoming direction: the admin panel relays every field edit here the
    // moment it happens (see hooks.js's setFieldValue), applied instantly
    // with no rebuild - see applyLiveSet above.
    function onMessage(e) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'site-designer:live-set') applyLiveSet(e.data);
    }
    window.addEventListener('message', onMessage);

    return () => {
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('mouseout', onOut, true);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('message', onMessage);
      outline.remove();
    };
  }, []);

  return null;
}
