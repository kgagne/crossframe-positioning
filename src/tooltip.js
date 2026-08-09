import { FrameOverlay } from "./overlay.js";

export class FrameTooltip {
  constructor(options = {}) {
    this.selector = options.selector || "[data-frame-tip]";
    this.contentAttribute = options.contentAttribute || "data-frame-tip";
    this.targetWindow = options.targetWindow || window.top || window;
    this.placement = options.placement || "auto";
    this.offset = Number.isFinite(options.offset) ? options.offset : 8;
    this.padding = Number.isFinite(options.padding) ? options.padding : 8;
    this.className = options.className || "frame-tip";
    this.allowHTML = options.allowHTML === true;
    this.active = null;
    this.overlay = null;

    this.onPointerOver = this.onPointerOver.bind(this);
    this.onPointerOut = this.onPointerOut.bind(this);
    this.onFocusIn = this.onFocusIn.bind(this);
    this.onFocusOut = this.onFocusOut.bind(this);
  }

  mount(rootDocument = document) {
    this.rootDocument = rootDocument;
    rootDocument.addEventListener("pointerover", this.onPointerOver, true);
    rootDocument.addEventListener("pointerout", this.onPointerOut, true);
    rootDocument.addEventListener("focusin", this.onFocusIn, true);
    rootDocument.addEventListener("focusout", this.onFocusOut, true);
    return this;
  }

  destroy() {
    if (this.rootDocument) {
      this.rootDocument.removeEventListener("pointerover", this.onPointerOver, true);
      this.rootDocument.removeEventListener("pointerout", this.onPointerOut, true);
      this.rootDocument.removeEventListener("focusin", this.onFocusIn, true);
      this.rootDocument.removeEventListener("focusout", this.onFocusOut, true);
    }

    this.overlay?.destroy();
    this.overlay = null;
    this.active = null;
  }

  getTrigger(node) {
    if (!(node instanceof Element)) return null;
    return node.closest(this.selector);
  }

  show(trigger) {
    if (this.active !== trigger) {
      this.overlay?.destroy();
      this.overlay = new FrameOverlay(trigger, {
        targetWindow: this.targetWindow,
        placement: this.placement,
        offset: this.offset,
        padding: this.padding,
        className: this.className
      });
      this.active = trigger;
    }

    const element = this.overlay.create();
    const content = trigger.getAttribute(this.contentAttribute) || "";
    element.setAttribute("role", "tooltip");

    if (this.allowHTML) {
      element.innerHTML = content;
    } else {
      element.textContent = content;
    }

    this.overlay.show();
  }

  hide() {
    this.overlay?.hide();
    this.active = null;
  }

  onPointerOver(event) {
    const trigger = this.getTrigger(event.target);
    if (trigger && trigger !== this.active) this.show(trigger);
  }

  onPointerOut(event) {
    const trigger = this.getTrigger(event.target);
    if (!trigger || trigger !== this.active) return;

    if (event.relatedTarget instanceof Node && trigger.contains(event.relatedTarget)) return;
    this.hide();
  }

  onFocusIn(event) {
    const trigger = this.getTrigger(event.target);
    if (trigger) this.show(trigger);
  }

  onFocusOut(event) {
    const trigger = this.getTrigger(event.target);
    if (trigger === this.active) this.hide();
  }
}
