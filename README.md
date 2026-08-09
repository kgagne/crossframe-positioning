# Crossframe Positioning

Crossframe Positioning is a zero-dependency JavaScript utility for translating element geometry through nested same-origin browsing contexts and positioning overlays in an ancestor window.

It is intended for legacy or embedded applications where UI elements live inside nested iframes or framesets but tooltips, menus, inspectors, or other overlays need to render in a higher-level document.

## Why

`getBoundingClientRect()` returns coordinates relative to the element's own viewport. That is not enough when an element is several frames deep and the overlay must be rendered in `window.top`.

Crossframe Positioning walks the frame hierarchy and translates the element rectangle into the target window's viewport coordinates.

## Features

- Vanilla JavaScript
- Zero runtime dependencies
- Same-origin nested frame traversal
- Reusable geometry primitive
- Overlay positioning with `right`, `left`, `top`, `bottom`, or `auto`
- Viewport clamping
- Tooltip helper
- Pointer and keyboard/focus support
- Text-safe tooltip content by default
- Small modular API

## Install

For now, clone or copy the repository and import directly:

```js
import { getRectRelativeToWindow, FrameTooltip } from "./src/index.js";
```

## Geometry

```js
import { getRectRelativeToWindow } from "./src/index.js";

const rect = getRectRelativeToWindow(button, window.top);

console.log(rect.left, rect.top);
```

The returned rectangle is expressed in the target window's viewport coordinate system.

## Tooltip

```html
<button data-frame-tip="Rendered in the ancestor document">
  More information
</button>
```

```js
import { FrameTooltip } from "./src/index.js";

const tooltips = new FrameTooltip({
  targetWindow: window.top,
  placement: "auto"
});

tooltips.mount();
```

Suggested CSS:

```css
.frame-tip {
  max-width: 22rem;
  padding: 0.625rem 0.75rem;
  border-radius: 0.25rem;
  background: #222;
  color: #fff;
  font: 0.875rem/1.4 system-ui, sans-serif;
}
```

## Custom overlays

The geometry and placement APIs can be used independently:

```js
import {
  getRectRelativeToWindow,
  placeOverlay
} from "./src/index.js";

const anchor = getRectRelativeToWindow(trigger, window.top);
const overlay = popup.getBoundingClientRect();

const point = placeOverlay(
  anchor,
  overlay,
  {
    width: window.top.innerWidth,
    height: window.top.innerHeight
  },
  {
    placement: "auto",
    offset: 8,
    padding: 8
  }
);
```

## Same-origin requirement

Crossframe Positioning cannot traverse cross-origin iframe boundaries. Browsers intentionally prevent scripts from reading the embedding frame element or document across those boundaries.

## Demo

Serve the repository over a local HTTP server and open:

`examples/nested-frames/index.html`

For example:

```bash
python3 -m http.server 8000
```

Then open `/examples/nested-frames/`.

## Tests

```bash
npm test
```

Current tests cover placement selection, viewport clamping, and invalid placement handling. Browser-based frame traversal tests are a logical next addition.

## Project status

Early development. The API may change before `1.0.0`.

## License

MIT
