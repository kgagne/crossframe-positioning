const placements = new Set(["right", "left", "top", "bottom", "auto"]);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function candidate(anchor, overlay, placement, offset) {
  switch (placement) {
    case "left":
      return {
        left: anchor.left - overlay.width - offset,
        top: anchor.top + (anchor.height - overlay.height) / 2
      };
    case "top":
      return {
        left: anchor.left + (anchor.width - overlay.width) / 2,
        top: anchor.top - overlay.height - offset
      };
    case "bottom":
      return {
        left: anchor.left + (anchor.width - overlay.width) / 2,
        top: anchor.bottom + offset
      };
    case "right":
    default:
      return {
        left: anchor.right + offset,
        top: anchor.top + (anchor.height - overlay.height) / 2
      };
  }
}

function overflowScore(point, overlay, viewport, padding) {
  const right = point.left + overlay.width;
  const bottom = point.top + overlay.height;

  return (
    Math.max(0, padding - point.left) +
    Math.max(0, padding - point.top) +
    Math.max(0, right - (viewport.width - padding)) +
    Math.max(0, bottom - (viewport.height - padding))
  );
}

export function placeOverlay(anchorRect, overlayRect, viewport, options = {}) {
  const requested = options.placement || "auto";
  const offset = Number.isFinite(options.offset) ? options.offset : 8;
  const padding = Number.isFinite(options.padding) ? options.padding : 8;

  if (!placements.has(requested)) {
    throw new TypeError(`Unsupported placement: ${requested}`);
  }

  const candidates = requested === "auto"
    ? ["right", "left", "bottom", "top"]
    : [requested];

  let chosenPlacement = candidates[0];
  let point = candidate(anchorRect, overlayRect, chosenPlacement, offset);
  let score = overflowScore(point, overlayRect, viewport, padding);

  for (const placement of candidates.slice(1)) {
    const nextPoint = candidate(anchorRect, overlayRect, placement, offset);
    const nextScore = overflowScore(nextPoint, overlayRect, viewport, padding);

    if (nextScore < score) {
      chosenPlacement = placement;
      point = nextPoint;
      score = nextScore;
    }
  }

  return {
    placement: chosenPlacement,
    left: clamp(point.left, padding, Math.max(padding, viewport.width - overlayRect.width - padding)),
    top: clamp(point.top, padding, Math.max(padding, viewport.height - overlayRect.height - padding))
  };
}
