import type { PdfPin } from '../types';

/**
 * Robustly queries and returns page container HTMLElements from EmbedPDF's shadow root.
 * In EmbedPDF (PDFium WASM), each page is rendered inside a positioned layout container.
 */
export function getPageContainers(shadow: ShadowRoot): HTMLElement[] {
  // Method 1: Look for white-background canvas/tile container elements created by EmbedPDF (zs component)
  const whiteBgElements = Array.from(
    shadow.querySelectorAll<HTMLElement>(
      'div[style*="background-color: #fff"], div[style*="background-color: rgb(255, 255, 255)"], div[style*="backgroundColor: #fff"]'
    )
  );

  if (whiteBgElements.length > 0) {
    return whiteBgElements.map((el, idx) => {
      // If the element has a positioned parent, that parent represents the scaled page box
      const parent = el.parentElement;
      const target = parent && parent.style.position === 'relative' ? parent : el;
      if (!target.dataset.pageNumber) {
        target.dataset.pageNumber = String(idx + 1);
      }
      return target;
    });
  }

  // Method 2: Look for scroller layout item containers
  const candidateDivs = Array.from(
    shadow.querySelectorAll<HTMLElement>('.bg-bg-app div[style*="position: relative"]')
  );
  return candidateDivs
    .filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 100 && rect.height > 100;
    })
    .map((el, idx) => {
      if (!el.dataset.pageNumber) {
        el.dataset.pageNumber = String(idx + 1);
      }
      return el;
    });
}

/**
 * Creates the SVG markup for a visual pin marker.
 */
function createPinSvg(isDraft: boolean): string {
  if (isDraft) {
    return `
      <div style="position: relative; display: flex; align-items: center; justify-content: center;">
        <span style="position: absolute; width: 36px; height: 36px; border-radius: 9999px; background: rgba(239, 68, 68, 0.35); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
        <svg width="30" height="36" viewBox="0 0 28 34" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px rgba(239, 68, 68, 0.7)); display: block;">
          <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 20 14 20s14-9.5 14-20c0-7.732-6.268-14-14-14z" fill="#ef4444" stroke="#ffffff" stroke-width="2"/>
          <circle cx="14" cy="13" r="5" fill="#ffffff"/>
        </svg>
      </div>
    `;
  }

  return `
    <div style="position: relative; display: flex; align-items: center; justify-content: center;">
      <svg width="26" height="32" viewBox="0 0 28 34" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.5)); display: block;">
        <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 20 14 20s14-9.5 14-20c0-7.732-6.268-14-14-14z" fill="#0284c7" stroke="#ffffff" stroke-width="1.8"/>
        <circle cx="14" cy="13" r="4.5" fill="#ffffff"/>
      </svg>
    </div>
  `;
}

/**
 * Synchronizes pin DOM elements onto all rendered pages inside the shadow root.
 */
export function renderPinsOnShadow(
  shadow: ShadowRoot,
  pins: PdfPin[],
  onPinClick?: (pin: PdfPin) => void
) {
  const pages = getPageContainers(shadow);
  if (pages.length === 0) return;

  pages.forEach((pageEl, pageIdx) => {
    const pageNumber = pageIdx + 1;
    const pagePins = pins.filter((p) => p.pageNumber === pageNumber);

    // Locate or create the persistent overlay layer on this page
    let pinLayer = pageEl.querySelector<HTMLElement>(':scope > .assembly-pin-layer');
    if (!pinLayer) {
      pinLayer = document.createElement('div');
      pinLayer.className = 'assembly-pin-layer';
      pinLayer.style.position = 'absolute';
      pinLayer.style.inset = '0';
      pinLayer.style.pointerEvents = 'none';
      pinLayer.style.zIndex = '35';
      pageEl.appendChild(pinLayer);
    }

    // Clear existing pins on this layer
    pinLayer.innerHTML = '';

    if (pagePins.length === 0) return;

    pagePins.forEach((pin) => {
      const pinNode = document.createElement('div');
      pinNode.className = 'assembly-pin-marker';
      pinNode.style.position = 'absolute';
      pinNode.style.left = `${pin.x}%`;
      pinNode.style.top = `${pin.y}%`;
      // Anchor needle tip exactly at (x%, y%)
      pinNode.style.transform = 'translate(-50%, -100%)';
      pinNode.style.pointerEvents = 'auto';
      pinNode.style.cursor = 'pointer';
      pinNode.style.userSelect = 'none';

      // Tooltip text
      const tooltipText = [
        pin.author ? `👤 ${pin.author}` : '',
        pin.sectionRef ? `[Sec ${pin.sectionRef}]` : '',
        pin.comment ? `"${pin.comment}"` : '',
      ]
        .filter(Boolean)
        .join(' • ');

      pinNode.title = tooltipText || (pin.isDraft ? 'Draft Pin' : `Note on Page ${pin.pageNumber}`);
      pinNode.innerHTML = createPinSvg(Boolean(pin.isDraft));

      if (onPinClick) {
        pinNode.addEventListener('click', (e) => {
          e.stopPropagation();
          onPinClick(pin);
        });
      }

      pinLayer.appendChild(pinNode);
    });
  });
}
