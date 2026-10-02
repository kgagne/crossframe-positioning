import { getRectRelativeToWindow, getWindowChain, isElement } from "./geometry.js";
import { placeOverlay } from "./placement.js";

export class FrameOverlay {
  constructor(anchor, options = {}) {
    if (!isElement(anchor)) {
      throw new TypeError("anchor must be an Element");
    }

    this.anchor = anchor;
    this.targetWindow = options.targetWindow || window.top || window;
    this.placement = options.placement || "auto";
    this.offset = Number.isFinite(options.offset) ? options.offset : 8;
    this.padding = Number.isFinite(options.padding) ? options.padding : 8;
    this.className = options.className || "crossframe-overlay";
    this.autoUpdate = options.autoUpdate !== false;
    this.onDetach = typeof options.onDetach === "function" ? options.onDetach : null;
    this.element = null;
    this.tracking = null;
    this.frameRequest = 0;

    this.scheduleUpdate = this.scheduleUpdate.bind(this);
    this.update = this.update.bind(this);
    this.detach = this.detach.bind(this);
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
    // clientWidth/clientHeight exclude scrollbars; innerWidth/innerHeight do not.
    const root = this.targetWindow.document.documentElement;
    const viewport = {
      width: root.clientWidth || this.targetWindow.innerWidth,
      height: root.clientHeight || this.targetWindow.innerHeight
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
    if (this.autoUpdate) this.startTracking();
  }

  hide() {
    this.stopTracking();
    if (!this.element) return;
    this.element.hidden = true;
    this.element.style.display = "none";
  }

  destroy() {
    this.stopTracking();
    this.element?.remove();
    this.element = null;
  }

  /**
   * Whether the anchor is still rendered in a document that is still framed
   * inside the target window.
   */
  isAnchorAttached() {
    if (!this.anchor.isConnected) return false;

    let currentWindow = this.anchor.ownerDocument?.defaultView;
    while (currentWindow && currentWindow !== this.targetWindow) {
      const frameElement = currentWindow.frameElement;
      if (!frameElement?.isConnected) return false;
      currentWindow = frameElement.ownerDocument?.defaultView;
    }

    return currentWindow === this.targetWindow;
  }

  scheduleUpdate() {
    if (this.frameRequest) return;
    this.frameRequest = this.targetWindow.requestAnimationFrame(this.update);
  }

  update() {
    this.frameRequest = 0;
    if (!this.tracking) return;

    if (!this.isAnchorAttached()) {
      this.detach();
      return;
    }

    try {
      this.position();
    } catch {
      this.detach();
    }
  }

  detach() {
    if (!this.tracking) return;
    this.hide();
    this.onDetach?.(this);
  }

  // Scrolling or resizing any window between the anchor and the target moves
  // the anchor in target coordinates. Removing the anchor, removing one of its
  // frames or navigating one of them away leaves the overlay orphaned. Layout
  // changes made only through styles in an ancestor document are not seen;
  // call position() after making them.
  startTracking() {
    if (this.tracking) return;

    const windows = getWindowChain(this.anchor, this.targetWindow);
    const anchorWindow = windows[0];
    const cleanups = [];
    const listen = (target, type, listener, options) => {
      target.addEventListener(type, listener, options);
      cleanups.push(() => target.removeEventListener(type, listener, options));
    };

    for (const win of windows) {
      // Capture catches scrolling elements too, since scroll does not bubble.
      listen(win, "scroll", this.scheduleUpdate, { capture: true, passive: true });
      listen(win, "resize", this.scheduleUpdate, { passive: true });
      if (win !== this.targetWindow) listen(win, "pagehide", this.detach);

      // Observers are created in each document's own realm so they run with
      // that document's rendering updates.
      if (win.MutationObserver) {
        // Inserted or removed nodes can also shift the anchor or a frame.
        // Attributes are not observed: position() writes the overlay's style.
        const mutations = new win.MutationObserver(() => {
          if (this.isAnchorAttached()) this.scheduleUpdate();
          else this.detach();
        });
        mutations.observe(win.document, { childList: true, subtree: true });
        cleanups.push(() => mutations.disconnect());
      }
    }

    if (anchorWindow.ResizeObserver) {
      const anchorSize = new anchorWindow.ResizeObserver(this.scheduleUpdate);
      anchorSize.observe(this.anchor);
      cleanups.push(() => anchorSize.disconnect());
    }

    if (this.targetWindow.ResizeObserver && this.element) {
      const overlaySize = new this.targetWindow.ResizeObserver(this.scheduleUpdate);
      overlaySize.observe(this.element);
      cleanups.push(() => overlaySize.disconnect());
    }

    this.tracking = cleanups;
  }

  stopTracking() {
    if (this.frameRequest) {
      this.targetWindow.cancelAnimationFrame(this.frameRequest);
      this.frameRequest = 0;
    }

    if (!this.tracking) return;
    const cleanups = this.tracking;
    this.tracking = null;

    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {
        // The window or document may already be gone.
      }
    }
  }
}
