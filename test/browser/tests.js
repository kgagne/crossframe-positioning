import {
  FrameOverlay,
  FrameTooltip,
  getRectRelativeToWindow
} from "../../src/index.js";

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function near(actual, expected, message, tolerance = 0.5) {
  assert(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
}

const nextFrame = (win = window) => new Promise((resolve) => win.requestAnimationFrame(() => resolve()));

async function frames(count = 3) {
  for (let i = 0; i < count; i += 1) await nextFrame();
}

/**
 * Append a same-origin iframe built from `html` to `parentDocument` and wait
 * for it to load. The load handler is attached before insertion so a fast
 * load cannot be missed.
 */
function frame(parentDocument, style, html) {
  return new Promise((resolve) => {
    const iframe = parentDocument.createElement("iframe");
    iframe.style.cssText = style;
    iframe.addEventListener("load", () => {
      resolve({ iframe, win: iframe.contentWindow, doc: iframe.contentDocument });
    }, { once: true });
    iframe.srcdoc = `<!doctype html><style>html,body{margin:0}</style>${html}`;
    parentDocument.body.appendChild(iframe);
  });
}

/**
 * Two levels of frames: A in the top page, B inside A. B contains `innerHtml`.
 * A is at (50, 40) with a 3px border and 5px padding; B is at (20, 10) inside
 * A with a 2px border.
 */
async function nested(innerHtml, { outerStyle = "", outerHtml = "", innerStyle = "" } = {}) {
  const a = await frame(
    document,
    `left:50px;top:40px;width:500px;height:400px;border:3px solid #999;padding:5px;${outerStyle}`,
    outerHtml
  );
  const b = await frame(
    a.doc,
    `position:absolute;left:20px;top:10px;width:300px;height:200px;border:2px solid #999;padding:0;${innerStyle}`,
    innerHtml
  );
  return { a, b };
}

function overlayPoint(overlay) {
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(overlay.element.style.transform);
  return { left: Number(match[1]), top: Number(match[2]) };
}

function isHidden(element) {
  return !element || !element.isConnected || element.hidden || element.style.display === "none";
}

const target = '<div id="t" style="position:absolute;left:7px;top:9px;width:30px;height:12px"></div>';

// Geometry -------------------------------------------------------------------

test("geometry: adds frame borders and padding through two levels", async () => {
  const { b } = await nested(target);
  const rect = getRectRelativeToWindow(b.doc.getElementById("t"), window);
  // x: 50 + 3 + 5 + 20 + 2 + 7 = 87, y: 40 + 3 + 5 + 10 + 2 + 9 = 69
  near(rect.left, 87, "left");
  near(rect.top, 69, "top");
  near(rect.width, 30, "width");
  near(rect.height, 12, "height");
});

test("geometry: accounts for scroll in every frame", async () => {
  const tall = '<div style="height:3000px"></div>';
  const { a, b } = await nested(target + tall, { outerHtml: tall });
  a.win.scrollTo(0, 25);
  b.win.scrollTo(0, 4);
  const rect = getRectRelativeToWindow(b.doc.getElementById("t"), window);
  near(rect.top, 69 - 25 - 4, "top");
});

test("geometry: scales through a CSS-transformed frame", async () => {
  const a = await frame(
    document,
    "left:50px;top:40px;width:400px;height:300px;border:4px solid #999;padding:6px;transform:scale(0.5);transform-origin:0 0",
    '<div id="t" style="position:absolute;left:20px;top:30px;width:40px;height:10px"></div>'
  );
  const rect = getRectRelativeToWindow(a.doc.getElementById("t"), window);
  // x: 50 + (4 + 6 + 20) * 0.5 = 65, y: 40 + (4 + 6 + 30) * 0.5 = 60
  near(rect.left, 65, "left");
  near(rect.top, 60, "top");
  near(rect.width, 20, "width");
  near(rect.height, 5, "height");
});

test("geometry: scales through nested transformed frames", async () => {
  const { b } = await nested(target, {
    outerStyle: "transform:scale(2);transform-origin:0 0",
    innerStyle: "transform:scale(0.5);transform-origin:0 0"
  });
  const rect = getRectRelativeToWindow(b.doc.getElementById("t"), window);
  // Within A: 20 + (2 + 7) * 0.5 = 24.5. In top: 50 + (3 + 5 + 24.5) * 2 = 115.
  near(rect.left, 115, "left");
  // Within A: 10 + (2 + 9) * 0.5 = 15.5. In top: 40 + (3 + 5 + 15.5) * 2 = 87.
  near(rect.top, 87, "top");
  near(rect.width, 30, "width");
  near(rect.height, 12, "height");
});

test("geometry: scales through a CSS-zoomed frame", async () => {
  const a = await frame(
    document,
    "left:50px;top:40px;width:400px;height:300px;border:4px solid #999;padding:6px;zoom:2",
    '<div id="t" style="position:absolute;left:20px;top:30px;width:40px;height:10px"></div>'
  );
  const frameRect = a.iframe.getBoundingClientRect();
  const rect = getRectRelativeToWindow(a.doc.getElementById("t"), window);
  // Zoom scales the frame's border, padding and contents by 2 from wherever
  // the browser places the frame's box.
  near(frameRect.width, (400 + 8 + 12) * 2, "zoomed frame width");
  near(rect.left, frameRect.left + (4 + 6 + 20) * 2, "left");
  near(rect.top, frameRect.top + (4 + 6 + 30) * 2, "top");
  near(rect.width, 80, "width");
  near(rect.height, 20, "height");
});

// Tooltip --------------------------------------------------------------------

test("tooltip: shows and hides for a trigger two frames down", async () => {
  const { b } = await nested('<button id="t" data-frame-tip="Hello &lt;b&gt;">Tip</button>');
  const tooltip = new FrameTooltip({ targetWindow: window, placement: "right" }).mount(b.doc);
  const button = b.doc.getElementById("t");

  try {
    button.dispatchEvent(new b.win.PointerEvent("pointerover", { bubbles: true }));
    const tip = document.querySelector(".frame-tip");
    assert(tip && !isHidden(tip), "tooltip shown on pointerover");
    assert(tip.textContent === "Hello <b>", "content is text, not HTML");
    assert(tip.getAttribute("role") === "tooltip", "role is tooltip");

    button.dispatchEvent(new b.win.PointerEvent("pointerout", { bubbles: true, relatedTarget: b.doc.body }));
    assert(isHidden(tip), "tooltip hidden on pointerout");

    button.dispatchEvent(new b.win.FocusEvent("focusin", { bubbles: true }));
    assert(!isHidden(document.querySelector(".frame-tip")), "tooltip shown on focusin");

    button.dispatchEvent(new b.win.FocusEvent("focusout", { bubbles: true }));
    assert(isHidden(document.querySelector(".frame-tip")), "tooltip hidden on focusout");
  } finally {
    tooltip.destroy();
  }
});

test("tooltip: positions next to the trigger in top-window coordinates", async () => {
  const { b } = await nested('<button id="t" data-frame-tip="x" style="position:absolute;left:7px;top:9px;width:30px;height:12px;padding:0;border:0">x</button>');
  const tooltip = new FrameTooltip({ targetWindow: window, placement: "right", offset: 8 }).mount(b.doc);

  try {
    b.doc.getElementById("t").dispatchEvent(new b.win.PointerEvent("pointerover", { bubbles: true }));
    const point = overlayPoint(tooltip.overlay);
    // Anchor at (87, 69), 30x12. The tip is 60x20 + padding from page CSS.
    near(point.left, 87 + 30 + 8, "left");
    const tipHeight = tooltip.overlay.element.getBoundingClientRect().height;
    near(point.top, 69 + (12 - tipHeight) / 2, "top", 1);
  } finally {
    tooltip.destroy();
  }
});

test("tooltip: describes a trigger in another frame through a hidden copy", async () => {
  const { b } = await nested('<span id="hint">Hint</span><button id="t" aria-describedby="hint" data-frame-tip="Details">x</button>');
  const tooltip = new FrameTooltip({ targetWindow: window }).mount(b.doc);
  const button = b.doc.getElementById("t");

  try {
    button.dispatchEvent(new b.win.PointerEvent("pointerover", { bubbles: true }));
    const ids = button.getAttribute("aria-describedby").split(" ");
    assert(ids.length === 2 && ids[0] === "hint", `existing reference kept: ${ids}`);
    const copy = b.doc.getElementById(ids[1]);
    assert(copy && copy.hidden, "hidden copy in the trigger's document");
    assert(copy.textContent === "Details", "copy holds the tooltip text");
    assert(document.getElementById(ids[1]) === null, "the id is not in the tooltip's document");

    button.dispatchEvent(new b.win.PointerEvent("pointerout", { bubbles: true, relatedTarget: b.doc.body }));
    assert(button.getAttribute("aria-describedby") === "hint", "reference removed on hide");
    assert(!copy.isConnected, "copy removed on hide");

    button.dispatchEvent(new b.win.FocusEvent("focusin", { bubbles: true }));
    const shownCopy = b.doc.getElementById(button.getAttribute("aria-describedby").split(" ")[1]);
    tooltip.destroy();
    assert(button.getAttribute("aria-describedby") === "hint", "reference removed on destroy");
    assert(!shownCopy.isConnected, "copy removed on destroy");
  } finally {
    tooltip.destroy();
  }
});

test("tooltip: describes a same-document trigger by the tooltip's id", async () => {
  const button = document.createElement("button");
  button.dataset.frameTip = "Same";
  document.body.appendChild(button);
  const tooltip = new FrameTooltip({ targetWindow: window }).mount(document);

  try {
    button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    const tip = document.querySelector(".frame-tip");
    assert(tip.id && button.getAttribute("aria-describedby") === tip.id, "points at the tooltip");
    assert(document.querySelectorAll("[hidden]").length === 0, "no hidden copy");

    button.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: document.body }));
    assert(!button.hasAttribute("aria-describedby"), "attribute removed when it held only the tooltip");
  } finally {
    tooltip.destroy();
  }
});

test("tooltip: Escape hides it until the pointer leaves the trigger", async () => {
  const { b } = await nested('<button id="t" data-frame-tip="x"><span id="inner">x</span></button>');
  const tooltip = new FrameTooltip({ targetWindow: window }).mount(b.doc);
  const button = b.doc.getElementById("t");
  const inner = b.doc.getElementById("inner");
  const escape = (win, doc) => doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  try {
    button.dispatchEvent(new b.win.PointerEvent("pointerover", { bubbles: true }));
    const tip = document.querySelector(".frame-tip");
    escape(b.win, b.doc);
    assert(isHidden(tip), "hidden by Escape in the trigger's document");
    assert(!button.hasAttribute("aria-describedby"), "description removed");

    inner.dispatchEvent(new b.win.PointerEvent("pointerover", { bubbles: true }));
    assert(isHidden(document.querySelector(".frame-tip")), "stays hidden while the pointer is on the trigger");

    inner.dispatchEvent(new b.win.PointerEvent("pointerout", { bubbles: true, relatedTarget: b.doc.body }));
    button.dispatchEvent(new b.win.PointerEvent("pointerover", { bubbles: true }));
    assert(!isHidden(document.querySelector(".frame-tip")), "shown again after the pointer left");

    escape(window, document);
    assert(isHidden(document.querySelector(".frame-tip")), "hidden by Escape in the target document");
  } finally {
    tooltip.destroy();
  }
});

test("tooltip: Escape hides a focused trigger's tooltip until focus returns", async () => {
  const { b } = await nested('<button id="t" data-frame-tip="x">x</button>');
  const tooltip = new FrameTooltip({ targetWindow: window }).mount(b.doc);
  const button = b.doc.getElementById("t");

  try {
    button.dispatchEvent(new b.win.FocusEvent("focusin", { bubbles: true }));
    b.doc.dispatchEvent(new b.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert(isHidden(document.querySelector(".frame-tip")), "hidden by Escape");

    button.dispatchEvent(new b.win.PointerEvent("pointerover", { bubbles: true }));
    assert(isHidden(document.querySelector(".frame-tip")), "hover does not reopen it");

    button.dispatchEvent(new b.win.FocusEvent("focusout", { bubbles: true }));
    button.dispatchEvent(new b.win.FocusEvent("focusin", { bubbles: true }));
    assert(!isHidden(document.querySelector(".frame-tip")), "shown again on renewed focus");
  } finally {
    tooltip.destroy();
  }
});

test("tooltip: Escape listeners are removed on destroy", async () => {
  const { b } = await nested('<button id="t" data-frame-tip="x">x</button>');
  const tooltip = new FrameTooltip({ targetWindow: window }).mount(b.doc);
  tooltip.destroy();
  tooltip.active = b.doc.getElementById("t");
  b.doc.dispatchEvent(new b.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert(tooltip.dismissed === null, "no handler ran after destroy");
});

test("overlay: default class is crossframe-overlay", async () => {
  const { b } = await nested(target);
  const overlay = new FrameOverlay(b.doc.getElementById("t"), { targetWindow: window });
  try {
    assert(overlay.create().className === "crossframe-overlay", overlay.element.className);
  } finally {
    overlay.destroy();
  }
});

// Auto-update ----------------------------------------------------------------

async function trackedOverlay(innerHtml, options = {}) {
  const fixture = await nested(innerHtml, options);
  const anchor = fixture.b.doc.getElementById("t");
  const overlay = new FrameOverlay(anchor, { targetWindow: window, placement: "right", className: "frame-tip" });
  overlay.show();
  return { ...fixture, anchor, overlay };
}

test("auto-update: follows scrolling of the anchor's frame", async () => {
  const { b, overlay } = await trackedOverlay(target + '<div style="height:3000px"></div>');
  try {
    const before = overlayPoint(overlay);
    b.win.scrollTo(0, 30);
    await frames();
    near(overlayPoint(overlay).top, before.top - 30, "top after scroll");
  } finally {
    overlay.destroy();
  }
});

test("auto-update: follows scrolling of an ancestor frame", async () => {
  const { a, overlay } = await trackedOverlay(target, { outerHtml: '<div style="height:3000px"></div>' });
  try {
    const before = overlayPoint(overlay);
    a.win.scrollTo(0, 12);
    await frames();
    near(overlayPoint(overlay).top, before.top - 12, "top after scroll");
  } finally {
    overlay.destroy();
  }
});

test("auto-update: follows scrolling of an element inside a frame", async () => {
  const { b, overlay } = await trackedOverlay(
    '<div id="s" style="height:150px;overflow:auto"><div style="height:40px"></div>' +
      '<div id="t" style="width:30px;height:12px"></div><div style="height:1000px"></div></div>'
  );
  try {
    const before = overlayPoint(overlay);
    b.doc.getElementById("s").scrollTop = 20;
    await frames();
    near(overlayPoint(overlay).top, before.top - 20, "top after element scroll");
  } finally {
    overlay.destroy();
  }
});

test("auto-update: follows the anchor when its frame is resized", async () => {
  const { b, overlay } = await trackedOverlay(
    '<div id="t" style="position:absolute;right:10px;top:9px;width:30px;height:12px"></div>'
  );
  try {
    const before = overlayPoint(overlay);
    b.iframe.style.width = "250px";
    await frames(4);
    near(overlayPoint(overlay).left, before.left - 50, "left after frame resize");
  } finally {
    overlay.destroy();
  }
});

test("auto-update: follows the anchor when its size changes", async () => {
  const { anchor, overlay } = await trackedOverlay(target);
  try {
    const before = overlayPoint(overlay);
    anchor.style.width = "70px";
    await frames(4);
    near(overlayPoint(overlay).left, before.left + 40, "left after anchor resize");
  } finally {
    overlay.destroy();
  }
});

test("auto-update: follows a frame moved by content inserted above it", async () => {
  const { a, overlay } = await trackedOverlay(target, { innerStyle: "position:static;display:block;margin:10px" });
  try {
    const before = overlayPoint(overlay);
    const banner = a.doc.createElement("div");
    banner.style.height = "35px";
    a.doc.body.prepend(banner);
    await frames(4);
    near(overlayPoint(overlay).top, before.top + 35, "top after insertion");
  } finally {
    overlay.destroy();
  }
});

test("auto-update: stops after hide and can be turned off", async () => {
  const { b, overlay } = await trackedOverlay(target + '<div style="height:3000px"></div>');
  const manual = new FrameOverlay(overlay.anchor, { targetWindow: window, placement: "right", autoUpdate: false });
  try {
    manual.show();
    const manualBefore = overlayPoint(manual);
    overlay.hide();
    b.win.scrollTo(0, 30);
    await frames();
    assert(overlay.tracking === null, "hidden overlay is not tracking");
    near(overlayPoint(manual).top, manualBefore.top, "autoUpdate:false overlay did not move");
  } finally {
    overlay.destroy();
    manual.destroy();
  }
});

// Detach ---------------------------------------------------------------------

test("detach: hides when the anchor is removed", async () => {
  const { anchor, overlay } = await trackedOverlay(target);
  let detached = 0;
  overlay.onDetach = () => {
    detached += 1;
  };
  try {
    anchor.remove();
    await frames();
    assert(isHidden(overlay.element), "overlay hidden");
    assert(detached === 1, `onDetach called once, got ${detached}`);
    assert(overlay.tracking === null, "tracking stopped");
  } finally {
    overlay.destroy();
  }
});

test("detach: hides when an ancestor frame is removed", async () => {
  const { a, overlay } = await trackedOverlay(target);
  try {
    a.iframe.remove();
    await frames();
    assert(isHidden(overlay.element), "overlay hidden");
  } finally {
    overlay.destroy();
  }
});

test("detach: hides when the anchor's frame navigates away", async () => {
  const { b, overlay } = await trackedOverlay(target);
  try {
    await new Promise((resolve) => {
      b.iframe.addEventListener("load", resolve, { once: true });
      b.iframe.srcdoc = "<p>Next page</p>";
    });
    await frames();
    assert(isHidden(overlay.element), "overlay hidden");
  } finally {
    overlay.destroy();
  }
});

test("detach: tooltip shows again after its trigger is re-inserted", async () => {
  const { b } = await nested('<button id="t" data-frame-tip="x">x</button>');
  const tooltip = new FrameTooltip({ targetWindow: window }).mount(b.doc);
  const button = b.doc.getElementById("t");
  try {
    button.dispatchEvent(new b.win.PointerEvent("pointerover", { bubbles: true }));
    button.remove();
    await frames();
    assert(isHidden(document.querySelector(".frame-tip")), "hidden after removal");
    assert(tooltip.active === null, "active trigger cleared");

    b.doc.body.appendChild(button);
    button.dispatchEvent(new b.win.PointerEvent("pointerover", { bubbles: true }));
    assert(!isHidden(document.querySelector(".frame-tip")), "shown again");
  } finally {
    tooltip.destroy();
  }
});

test("destroy: removes the overlay element and its listeners", async () => {
  const { b, overlay } = await trackedOverlay(target + '<div style="height:3000px"></div>');
  const element = overlay.element;
  overlay.destroy();
  b.win.scrollTo(0, 30);
  await frames();
  assert(!element.isConnected, "element removed");
  assert(overlay.element === null, "element released");
  assert(!document.querySelector(".frame-tip"), "no overlay recreated");
});

// Runner ---------------------------------------------------------------------

const errors = [];
window.addEventListener("error", (event) => errors.push(String(event.error || event.message)));
window.addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)));

const results = [];
for (const { name, fn } of tests) {
  errors.length = 0;
  try {
    await fn();
    await frames(1);
    if (errors.length) throw new Error(`Uncaught: ${errors.join("; ")}`);
    results.push({ name, ok: true });
  } catch (error) {
    // Firefox's stack omits the message, so report both.
    results.push({ name, ok: false, error: `${error}\n${error?.stack || ""}` });
  }

  for (const node of [...document.body.children]) {
    if (node.tagName !== "SCRIPT") node.remove();
  }
  window.scrollTo(0, 0);
}

await fetch("/__results", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userAgent: navigator.userAgent, results })
});
