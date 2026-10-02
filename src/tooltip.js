import { isElement } from "./geometry.js";
import { FrameOverlay } from "./overlay.js";

let nextId = 0;

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
    this.autoUpdate = options.autoUpdate !== false;
    this.active = null;
    this.overlay = null;
    // A trigger whose tooltip was dismissed with Escape stays hidden until
    // the pointer leaves it or it loses focus.
    this.dismissed = null;
    this.description = null;
    this.keyDocuments = [];

    this.onPointerOver = this.onPointerOver.bind(this);
    this.onPointerOut = this.onPointerOut.bind(this);
    this.onFocusIn = this.onFocusIn.bind(this);
    this.onFocusOut = this.onFocusOut.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
  }

  mount(rootDocument = document) {
    this.rootDocument = rootDocument;
    rootDocument.addEventListener("pointerover", this.onPointerOver, true);
    rootDocument.addEventListener("pointerout", this.onPointerOut, true);
    rootDocument.addEventListener("focusin", this.onFocusIn, true);
    rootDocument.addEventListener("focusout", this.onFocusOut, true);

    // Escape may be pressed while focus is in the trigger's document or in
    // the document showing the tooltip.
    this.keyDocuments = [...new Set([rootDocument, this.targetWindow.document])];
    for (const doc of this.keyDocuments) {
      doc.addEventListener("keydown", this.onKeyDown, true);
    }
    return this;
  }

  destroy() {
    if (this.rootDocument) {
      this.rootDocument.removeEventListener("pointerover", this.onPointerOver, true);
      this.rootDocument.removeEventListener("pointerout", this.onPointerOut, true);
      this.rootDocument.removeEventListener("focusin", this.onFocusIn, true);
      this.rootDocument.removeEventListener("focusout", this.onFocusOut, true);
    }

    for (const doc of this.keyDocuments) {
      try {
        doc.removeEventListener("keydown", this.onKeyDown, true);
      } catch {
        // The document may already be gone.
      }
    }
    this.keyDocuments = [];

    this.overlay?.destroy();
    this.undescribe();
    this.overlay = null;
    this.active = null;
    this.dismissed = null;
  }

  getTrigger(node) {
    if (!isElement(node)) return null;
    return node.closest(this.selector);
  }

  show(trigger) {
    if (this.active !== trigger) {
      this.overlay?.destroy();
      this.undescribe();
      this.overlay = new FrameOverlay(trigger, {
        targetWindow: this.targetWindow,
        placement: this.placement,
        offset: this.offset,
        padding: this.padding,
        className: this.className,
        autoUpdate: this.autoUpdate,
        // The overlay hides itself when its trigger or frame goes away.
        onDetach: (overlay) => {
          if (overlay !== this.overlay) return;
          this.undescribe();
          this.active = null;
        }
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

    this.describe(trigger, element);
    this.overlay.show();
  }

  hide() {
    this.overlay?.hide();
    this.undescribe();
    this.active = null;
  }

  /**
   * Point the trigger's aria-describedby at the tooltip. ID references do not
   * cross documents, so when the tooltip renders in another document the
   * trigger points at a hidden copy of its text in the trigger's own document.
   * A directly referenced hidden element still supplies the description.
   */
  describe(trigger, element) {
    this.undescribe();

    let reference = element;
    let mirror = null;
    const triggerDocument = trigger.ownerDocument;

    if (element.ownerDocument !== triggerDocument) {
      mirror = triggerDocument.createElement("div");
      mirror.hidden = true;
      mirror.textContent = element.textContent;
      (triggerDocument.body || triggerDocument.documentElement).appendChild(mirror);
      reference = mirror;
    }

    if (!reference.id) reference.id = `crossframe-tip-${++nextId}`;
    const ids = (trigger.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    if (!ids.includes(reference.id)) ids.push(reference.id);
    trigger.setAttribute("aria-describedby", ids.join(" "));

    this.description = { trigger, id: reference.id, mirror };
  }

  undescribe() {
    if (!this.description) return;
    const { trigger, id, mirror } = this.description;
    this.description = null;

    const ids = (trigger.getAttribute("aria-describedby") || "")
      .split(/\s+/)
      .filter((token) => token && token !== id);
    if (ids.length) trigger.setAttribute("aria-describedby", ids.join(" "));
    else trigger.removeAttribute("aria-describedby");

    mirror?.remove();
  }

  onPointerOver(event) {
    const trigger = this.getTrigger(event.target);
    if (trigger && trigger !== this.active && trigger !== this.dismissed) this.show(trigger);
  }

  onPointerOut(event) {
    const trigger = this.getTrigger(event.target);
    if (!trigger) return;
    if (event.relatedTarget?.nodeType && trigger.contains(event.relatedTarget)) return;

    if (trigger === this.dismissed) this.dismissed = null;
    if (trigger === this.active) this.hide();
  }

  onFocusIn(event) {
    const trigger = this.getTrigger(event.target);
    if (!trigger) return;
    this.dismissed = null;
    this.show(trigger);
  }

  onFocusOut(event) {
    const trigger = this.getTrigger(event.target);
    if (trigger === this.dismissed) this.dismissed = null;
    if (trigger === this.active) this.hide();
  }

  // WCAG 1.4.13: the tooltip can be dismissed without moving the pointer or
  // focus. Escape is not consumed, so it still reaches the page.
  onKeyDown(event) {
    if (event.key !== "Escape" || !this.active) return;
    this.dismissed = this.active;
    this.hide();
  }
}
