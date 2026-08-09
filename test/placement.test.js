import test from "node:test";
import assert from "node:assert/strict";
import { placeOverlay } from "../src/placement.js";

const anchor = { left: 100, top: 100, right: 150, bottom: 120, width: 50, height: 20 };
const overlay = { width: 80, height: 40 };
const viewport = { width: 400, height: 300 };

test("places to the right when space is available", () => {
  const result = placeOverlay(anchor, overlay, viewport, { placement: "right", offset: 10 });
  assert.equal(result.placement, "right");
  assert.equal(result.left, 160);
  assert.equal(result.top, 90);
});

test("auto chooses a lower-overflow placement", () => {
  const rightEdgeAnchor = { left: 350, top: 100, right: 390, bottom: 120, width: 40, height: 20 };
  const result = placeOverlay(rightEdgeAnchor, overlay, viewport, { placement: "auto", offset: 8, padding: 8 });
  assert.equal(result.placement, "left");
});

test("clamps overlay inside viewport padding", () => {
  const cornerAnchor = { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 };
  const result = placeOverlay(cornerAnchor, { width: 200, height: 100 }, { width: 220, height: 120 }, { placement: "top", padding: 8 });
  assert.equal(result.left, 8);
  assert.equal(result.top, 8);
});

test("rejects unsupported placements", () => {
  assert.throws(() => placeOverlay(anchor, overlay, viewport, { placement: "diagonal" }), /Unsupported placement/);
});
