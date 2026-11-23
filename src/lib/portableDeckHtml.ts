/**
 * Standalone Portable HTML Export.
 *
 * Generates a single self-contained `.html` presentation with zero external
 * dependencies that works offline in any modern browser. Includes:
 * - Keyboard navigation (←/→/Space/PageUp/PageDown/Home/End)
 * - Touch swipe navigation
 * - Grid overview (`G`)
 * - Fullscreen (`F`), Blackout (`B`), Whiteout (`W`)
 * - Step-by-step build playback using PureSlides' exact SEEK_CORE_FN
 * - Responsive viewport scaling + crisp minimal HUD
 */
import { geometryFromHtml } from './deckDocument'
import { inlineAssetUrls, picturesOnly, type PreviewAssetMap } from './packageAssets'
import { escapeHtmlText, sanitizeForSameOriginMeasure } from './sanitizeDeck'
import { BUILD_CSS, SEEK_CORE_FN } from './slideSeek'

export interface PortableDeckOptions {
  title?: string
  previews?: PreviewAssetMap
}

export function buildPortableDeckHtml(
  html: string,
  options: PortableDeckOptions = {},
): string {
  const geometry = geometryFromHtml(html)
  const safeHtml = sanitizeForSameOriginMeasure(html)
  const inlined = options.previews
    ? inlineAssetUrls(safeHtml, picturesOnly(options.previews))
    : safeHtml

  let headStyles = ''
  let deckMarkup = ''
  let docTitle = options.title?.trim() || 'Presentation'

  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(inlined, 'text/html')
    const parsedTitle = doc.querySelector('title')?.textContent?.trim()
    if (!options.title && parsedTitle) docTitle = parsedTitle
    headStyles = [...doc.querySelectorAll('head style')]
      .map(style => style.outerHTML)
      .join('\n')
    const root = doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
    if (root) {
      deckMarkup = root.outerHTML
    } else {
      deckMarkup = `<div id="deck" data-deck-id="${geometry.deckId}" data-width="${geometry.width}" data-height="${geometry.height}" style="width:${geometry.width}px;height:${geometry.height}px;position:relative;overflow:hidden">${doc.body.innerHTML}</div>`
    }
  } else {
    deckMarkup = inlined
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtmlText(docTitle)}</title>
${headStyles}
  <style>
    ${BUILD_CSS}
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #0d0e11;
      color: #f2f3f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    }
    #ps-stage {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      overflow: hidden;
    }
    #ps-viewport {
      position: relative;
      width: ${geometry.width}px;
      height: ${geometry.height}px;
      transform-origin: center center;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
      background: #ffffff;
    }
    #ps-veil {
      position: fixed;
      inset: 0;
      z-index: 30;
      display: none;
      align-items: center;
      justify-content: center;
      font: 500 13px/1.4 ui-monospace, Menlo, monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    #ps-veil[data-mode="black"] { display: flex; background: #000000; color: rgba(255,255,255,0.28); }
    #ps-veil[data-mode="white"] { display: flex; background: #ffffff; color: rgba(0,0,0,0.32); }
    #ps-progress {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: 3px;
      background: rgba(255,255,255,0.12);
      z-index: 40;
    }
    #ps-progress-fill {
      height: 100%;
      width: 0%;
      background: #c79a1e;
      transition: width 160ms ease;
    }
    #ps-hud {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: 14px;
      z-index: 41;
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: none;
      transition: opacity 220ms ease;
    }
    #ps-hud.idle { opacity: 0; }
    .ps-pill {
      pointer-events: auto;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border-radius: 3px;
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(14,15,18,0.82);
      color: #f2f3f5;
      font: 600 11px/1 ui-monospace, Menlo, monospace;
      letter-spacing: 0.04em;
      cursor: pointer;
    }
    .ps-pill:hover { background: rgba(34,36,42,0.92); }
    .ps-spacer { flex: 1; }
    #ps-grid {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: none;
      flex-direction: column;
      background: rgba(12, 13, 16, 0.96);
      padding: 24px;
      overflow-y: auto;
    }
    #ps-grid.open { display: flex; }
    #ps-grid-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
      font: 600 12px/1 ui-monospace, Menlo, monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #b4b7be;
    }
    #ps-grid-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px;
    }
    .ps-grid-card {
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 3px;
      background: #17191e;
      color: #f2f3f5;
      padding: 12px;
      text-align: left;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ps-grid-card[data-active="true"] { border-color: #c79a1e; box-shadow: 0 0 0 1px #c79a1e; }
    .ps-grid-num { font: 700 11px/1 ui-monospace, Menlo, monospace; color: #c79a1e; }
    .ps-grid-title { font: 600 14px/1.3 -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
  </style>
</head>
<body>
  <div id="ps-stage">
    <div id="ps-viewport">
      ${deckMarkup}
    </div>
  </div>
  <div id="ps-veil" aria-live="polite"></div>
  <div id="ps-progress"><div id="ps-progress-fill"></div></div>
  <div id="ps-hud">
    <button class="ps-pill" id="ps-prev" type="button" aria-label="Previous slide">← Prev</button>
    <button class="ps-pill" id="ps-next" type="button" aria-label="Next slide">Next →</button>
    <button class="ps-pill" id="ps-grid-btn" type="button">Grid (G)</button>
    <button class="ps-pill" id="ps-fs-btn" type="button">Fullscreen (F)</button>
    <span class="ps-spacer"></span>
    <span class="ps-pill" id="ps-counter">1 / 1</span>
  </div>
  <div id="ps-grid" role="dialog" aria-label="Slide grid">
    <div id="ps-grid-head">
      <span>${escapeHtmlText(docTitle)} · Slide overview</span>
      <button class="ps-pill" id="ps-grid-close" type="button">Close (Esc)</button>
    </div>
    <div id="ps-grid-cards"></div>
  </div>
  <script>
  (function () {
    ${SEEK_CORE_FN}
    var W = ${geometry.width};
    var H = ${geometry.height};
    var viewport = document.getElementById('ps-viewport');
    var root = document.querySelector('[data-deck-id]') || document.getElementById('deck');
    var veil = document.getElementById('ps-veil');
    var fill = document.getElementById('ps-progress-fill');
    var counter = document.getElementById('ps-counter');
    var hud = document.getElementById('ps-hud');
    var grid = document.getElementById('ps-grid');
    var gridCards = document.getElementById('ps-grid-cards');
    var kids = slideChildrenOf(root);
    var total = Math.max(1, kids.length);
    var slideIndex = 0;
    var stepIndex = 0;
    var veilMode = '';
    var gridOpen = false;
    var idleTimer = 0;

    stashAuthorStylesIn(root);
    document.documentElement.setAttribute('data-live', 'true');

    function fitViewport() {
      var scale = Math.min(window.innerWidth / W, window.innerHeight / H);
      viewport.style.transform = 'scale(' + scale + ')';
    }

    function render() {
      renderSlideIn(root, slideIndex, stepIndex);
      var steps = stepsOf(slideIn(root, slideIndex));
      counter.textContent = (slideIndex + 1) + ' / ' + total + (steps ? ' · ' + stepIndex + '/' + steps : '');
      fill.style.width = (((slideIndex + 1) / total) * 100) + '%';
      veil.setAttribute('data-mode', veilMode);
      veil.textContent = veilMode === 'black' ? 'Blackout (B)' : veilMode === 'white' ? 'Whiteout (W)' : '';
      if (gridOpen) renderGrid();
    }

    function renderGrid() {
      gridCards.innerHTML = '';
      for (var i = 0; i < total; i++) {
        var el = slideIn(root, i);
        var heading = el && el.querySelector ? el.querySelector('h1,h2,h3') : null;
        var label = (heading && heading.textContent ? heading.textContent.trim() : '') || ('Slide ' + (i + 1));
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ps-grid-card';
        btn.setAttribute('data-active', String(i === slideIndex));
        btn.innerHTML = '<span class="ps-grid-num">' + String(i + 1).padStart(2, '0') + '</span><span class="ps-grid-title"></span>';
        btn.querySelector('.ps-grid-title').textContent = label;
        (function (idx) {
          btn.addEventListener('click', function () {
            slideIndex = idx;
            stepIndex = 0;
            gridOpen = false;
            grid.classList.remove('open');
            render();
          });
        })(i);
        gridCards.appendChild(btn);
      }
    }

    function go(dir) {
      veilMode = '';
      var steps = stepsOf(slideIn(root, slideIndex));
      if (dir > 0) {
        if (stepIndex < steps) { stepIndex++; }
        else if (slideIndex < total - 1) { slideIndex++; stepIndex = 0; }
      } else {
        if (stepIndex > 0) { stepIndex--; }
        else if (slideIndex > 0) { slideIndex--; stepIndex = stepsOf(slideIn(root, slideIndex)); }
      }
      render();
    }

    function toggleGrid() {
      gridOpen = !gridOpen;
      grid.classList.toggle('open', gridOpen);
      if (gridOpen) renderGrid();
    }

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
      } else if (document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
      }
    }

    function wakeHud() {
      hud.classList.remove('idle');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { hud.classList.add('idle'); }, 2600);
    }

    document.getElementById('ps-prev').addEventListener('click', function () { go(-1); });
    document.getElementById('ps-next').addEventListener('click', function () { go(1); });
    document.getElementById('ps-grid-btn').addEventListener('click', toggleGrid);
    document.getElementById('ps-grid-close').addEventListener('click', toggleGrid);
    document.getElementById('ps-fs-btn').addEventListener('click', toggleFullscreen);

    window.addEventListener('keydown', function (e) {
      wakeHud();
      var k = e.key;
      if (k === 'Escape') {
        if (gridOpen) { toggleGrid(); e.preventDefault(); }
        else if (veilMode) { veilMode = ''; render(); e.preventDefault(); }
        return;
      }
      if (k === 'g' || k === 'G') { toggleGrid(); e.preventDefault(); return; }
      if (gridOpen) return;
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === ' ' || k === 'PageDown' || k === 'n') { go(1); e.preventDefault(); }
      else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'Backspace' || k === 'PageUp' || k === 'p') { go(-1); e.preventDefault(); }
      else if (k === 'Home') { slideIndex = 0; stepIndex = 0; render(); e.preventDefault(); }
      else if (k === 'End') { slideIndex = total - 1; stepIndex = stepsOf(slideIn(root, slideIndex)); render(); e.preventDefault(); }
      else if (k === 'b' || k === 'B' || k === '.') { veilMode = veilMode === 'black' ? '' : 'black'; render(); e.preventDefault(); }
      else if (k === 'w' || k === 'W') { veilMode = veilMode === 'white' ? '' : 'white'; render(); e.preventDefault(); }
      else if (k === 'f' || k === 'F') { toggleFullscreen(); e.preventDefault(); }
    });

    var touchStartX = null;
    window.addEventListener('touchstart', function (e) {
      if (e.touches && e.touches.length === 1) touchStartX = e.touches[0].clientX;
    }, { passive: true });
    window.addEventListener('touchend', function (e) {
      if (touchStartX === null || gridOpen) return;
      var dx = (e.changedTouches[0] ? e.changedTouches[0].clientX : touchStartX) - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    }, { passive: true });

    window.addEventListener('resize', fitViewport);
    window.addEventListener('mousemove', wakeHud);
    fitViewport();
    render();
    wakeHud();
  })();
  </script>
</body>
</html>
`
}
