import { getRectRelativeToWindow } from "./geometry.js";
import { placeOverlay } from "./placement.js";

export class FrameOverlay {
  constructor(anchor, options = {}) {
    if (!(anchor instanceof Element)) {
      throw new TypeError("anchor must be an Element");
    }

    this.anchor = anchor;
    this.targetWindow = options.targetWindow || window.top || window;
    this.placement = options.placement || "auto";
    this.offset = Number.isFinite(options.offset) ? options.offset : 8;
    this.padding = Number.isFinite(options.padding) ? options.padding : 8;
    this.className = options.className || "frame-anchor-overlay";
    this.element = null;
  }

  create() {
    if (this.element?.isConnected) return this.element;

    const element = this.targetWindow.document.createElement("div");
    element.className = this.className;
    element.style.position = "fixed";
    element.style.left = "0";
    element.style.top = "0";
    element.style.pointerEvents = "none";
    element.style.zIndex = "2147483647";

    (this.targetWindow.document.body || this.targetWindow.document.documentElement).appendChild(element);
    this.element = element;

    return element;
  }

  position() {
    const element = this.create();
    const anchorRect = getRectRelativeToWindow(this.anchor, this.targetWindow);
    const overlayRect = element.getBoundingClientRect();
    const viewport = {
      width: this.targetWindow.innerWidth,
      height: this.targetWindow.innerHeight
    };

    const point = placeOverlay(anchorRect, overlayRect, viewport, {
      placement: this.placement,
      offset: this.offset,
      padding: this.padding
    });

    element.dataset.placement = point.placement;
    element.style.transform = `translate(${Math.round(point.left)}px, ${Math.round(point.top)}px)`;

    return point;
  }

  show() {
    const element = this.create();
    element.hidden = false;
    element.style.display = "block";
    this.position();
  }

  hide() {
    if (!this.element) return;
    this.element.hidden = true;
    this.element.style.display = "none";
  }

  destroy() {
    this.element?.remove();
    this.element = null;
  }
}
