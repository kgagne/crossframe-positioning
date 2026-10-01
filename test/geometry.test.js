import test from "node:test";
import assert from "node:assert/strict";
import { getRectRelativeToWindow, getWindowChain, isElement } from "../src/geometry.js";

// Minimal stand-ins for windows, documents and elements. Each fake window is
// its own "realm": nothing here is an instance of a global Element class.

function rect(left, top, width, height) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function makeWindow(frameElement = null) {
  const win = {
    frameElement,
    getComputedStyle: (element) => element.style
  };
  win.document = { defaultView: win };
  return win;
}

function makeElement(win, box) {
  return {
    nodeType: 1,
    ownerDocument: win.document,
    getBoundingClientRect: () => box
  };
}

/**
 * A frame element in `parentWindow` rendered at `box`, with a layout size of
 * offsetWidth x offsetHeight and the given border and padding.
 */
function makeFrame(parentWindow, box, { offsetWidth = box.width, offsetHeight = box.height, border = 0, padding = 0 } = {}) {
  const frame = makeElement(parentWindow, box);
  frame.offsetWidth = offsetWidth;
  frame.offsetHeight = offsetHeight;
  frame.clientLeft = border;
  frame.clientTop = border;
  frame.style = { paddingLeft: `${padding}px`, paddingTop: `${padding}px` };
  return frame;
}

test("returns the element's own rect when it is in the target window", () => {
  const top = makeWindow();
  const element = makeElement(top, rect(10, 20, 30, 40));

  assert.deepEqual(getRectRelativeToWindow(element, top), rect(10, 20, 30, 40));
});

test("adds each frame's position, border and padding", () => {
  const top = makeWindow();
  const outerFrame = makeFrame(top, rect(100, 50, 400, 300), { border: 2, padding: 3 });
  const middle = makeWindow(outerFrame);
  const innerFrame = makeFrame(middle, rect(20, 10, 200, 100), { border: 1 });
  const inner = makeWindow(innerFrame);
  const element = makeElement(inner, rect(5, 6, 30, 10));

  // x: 100 + 2 + 3 + 20 + 1 + 5 = 131, y: 50 + 2 + 3 + 10 + 1 + 6 = 72
  assert.deepEqual(getRectRelativeToWindow(element, top), rect(131, 72, 30, 10));
});

test("stops at an intermediate target window", () => {
  const top = makeWindow();
  const outerFrame = makeFrame(top, rect(100, 50, 400, 300));
  const middle = makeWindow(outerFrame);
  const innerFrame = makeFrame(middle, rect(20, 10, 200, 100));
  const inner = makeWindow(innerFrame);
  const element = makeElement(inner, rect(5, 6, 30, 10));

  assert.deepEqual(getRectRelativeToWindow(element, middle), rect(25, 16, 30, 10));
});

test("scales coordinates and size through a scaled frame", () => {
  const top = makeWindow();
  // Laid out at 200x100 with a 4px border and 6px padding, rendered at half size.
  const frame = makeFrame(top, rect(100, 50, 100, 50), { offsetWidth: 200, offsetHeight: 100, border: 4, padding: 6 });
  const inner = makeWindow(frame);
  const element = makeElement(inner, rect(20, 30, 40, 10));

  // x: 100 + (4 + 6 + 20) * 0.5 = 115, y: 50 + (4 + 6 + 30) * 0.5 = 70
  assert.deepEqual(getRectRelativeToWindow(element, top), rect(115, 70, 20, 5));
});

test("compounds scale across nested frames", () => {
  const top = makeWindow();
  const outerFrame = makeFrame(top, rect(0, 0, 400, 400), { offsetWidth: 200, offsetHeight: 200 });
  const middle = makeWindow(outerFrame);
  const innerFrame = makeFrame(middle, rect(10, 10, 150, 150), { offsetWidth: 100, offsetHeight: 100 });
  const inner = makeWindow(innerFrame);
  const element = makeElement(inner, rect(4, 4, 10, 10));

  // Inner scale 1.5, outer scale 2: x = (10 + 4 * 1.5) * 2 = 32, size 10 * 3 = 30.
  assert.deepEqual(getRectRelativeToWindow(element, top), rect(32, 32, 30, 30));
});

test("treats a frame with no layout size as unscaled", () => {
  const top = makeWindow();
  const frame = makeFrame(top, rect(10, 10, 0, 0), { offsetWidth: 0, offsetHeight: 0 });
  const inner = makeWindow(frame);
  const element = makeElement(inner, rect(1, 2, 3, 4));

  assert.deepEqual(getRectRelativeToWindow(element, top), rect(11, 12, 3, 4));
});

test("throws when the target is not an ancestor", () => {
  const top = makeWindow();
  const unrelated = makeWindow();
  const element = makeElement(top, rect(0, 0, 1, 1));

  assert.throws(() => getRectRelativeToWindow(element, unrelated), /not a reachable same-origin ancestor/);
});

test("rejects values that are not elements", () => {
  assert.throws(() => getRectRelativeToWindow({ nodeType: 3 }, makeWindow()), TypeError);
  assert.throws(() => getRectRelativeToWindow(null, makeWindow()), TypeError);
});

test("isElement accepts elements from any realm", () => {
  assert.equal(isElement(makeElement(makeWindow(), rect(0, 0, 0, 0))), true);
  assert.equal(isElement({ nodeType: 3, getBoundingClientRect() {} }), false);
  assert.equal(isElement(undefined), false);
});

test("getWindowChain lists windows from the element up to the target", () => {
  const top = makeWindow();
  const middle = makeWindow(makeFrame(top, rect(0, 0, 10, 10)));
  const inner = makeWindow(makeFrame(middle, rect(0, 0, 10, 10)));
  const element = makeElement(inner, rect(0, 0, 1, 1));

  assert.deepEqual(getWindowChain(element, top), [inner, middle, top]);
  assert.deepEqual(getWindowChain(element, middle), [inner, middle]);
});
