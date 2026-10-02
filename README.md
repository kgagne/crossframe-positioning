# Crossframe Positioning

Crossframe Positioning is a zero-dependency JavaScript utility for translating element geometry through nested same-origin browsing contexts and positioning overlays in an ancestor window.

It is intended for legacy or embedded applications where UI elements live inside nested iframes or framesets but tooltips, menus, inspectors, or other overlays need to render in a higher-level document.

## Why

`getBoundingClientRect()` returns coordinates relative to the element's own viewport. That is not enough when an element is several frames deep and the overlay must be rendered in `window.top`.

Crossframe Positioning walks the frame hierarchy and translates the element rectangle into the target window's viewport coordinates.

## Features

- Vanilla JavaScript
- Zero runtime dependencies
- Same-origin nested frame traversal, including frame borders, padding and
  frames scaled with CSS transforms or `zoom`
- Reusable geometry primitive
- Overlay positioning with `right`, `left`, `top`, `bottom`, or `auto`
- Viewport clamping
- Repositions while shown when any frame between the trigger and the target
  window scrolls or resizes, or the trigger changes size
- Hides itself when its trigger is removed or its frame is removed or navigated
- Tooltip helper
- Pointer and keyboard/focus support, Escape to dismiss, and
  `aria-describedby` on the trigger, including across frames
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

Tooltip content is inserted as text by default. Passing `allowHTML: true`
inserts the attribute's value as HTML in the target window's document instead.
**Only use `allowHTML` with content you fully control.** With user-supplied or
otherwise untrusted content it allows cross-site scripting, and the markup runs
in the ancestor document, not in the frame it came from.

### Accessibility

- The tooltip has `role="tooltip"` and is shown on hover and on keyboard focus.
- While shown, the trigger's `aria-describedby` refers to it, so screen readers
  announce it. ID references cannot cross documents, so when the tooltip
  renders in another window the trigger refers to a hidden copy of the tooltip
  text in its own document. Existing `aria-describedby` values are kept, and
  the reference is removed again on hide.
- Escape hides the tooltip without moving focus or the pointer (WCAG 1.4.13).
  It stays hidden until the pointer leaves the trigger or the trigger loses
  focus. The key is not consumed, so the page still receives it. Escape is
  heard in the mounted document and in the target window's document.

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

## Overlay lifecycle

`FrameOverlay` (and `FrameTooltip`, which uses it) tracks its anchor while
shown:

```js
import { FrameOverlay } from "./src/index.js";

const overlay = new FrameOverlay(trigger, {
  targetWindow: window.top,
  placement: "bottom",
  onDetach: () => console.log("trigger or its frame went away")
});

overlay.create().textContent = "Details";
overlay.show();   // positions, then tracks scroll, resize and removal
overlay.hide();   // stops tracking
overlay.destroy(); // removes the overlay element
```

The overlay element gets the class `crossframe-overlay` unless `className` is
given (`FrameTooltip` uses `frame-tip`).

Pass `autoUpdate: false` to position only when `show()` or `position()` is
called. Layout changes in an ancestor document made only through styles (for
example, moving a frame by changing its `top`) fire no event the overlay can
observe; call `position()` after making them.

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
npm test              # placement and geometry, in Node
npm run test:browser  # frame traversal, tooltips, tracking and cleanup in a real browser
```

The browser suite serves the repository, opens `test/browser/index.html` in a
headless browser and collects the results the page posts back, so it needs no
automation dependency. It uses `$BROWSER`, or the first of `firefox`,
`chromium`, `chromium-browser` or `google-chrome` on `PATH`; pass
`--browser <command>` to choose another.

## Limitations

- Cross-origin frames cannot be traversed.
- Rotated or skewed frames are approximated by their bounding box.

## Project status

Early development. The API may change before `1.0.0`.

## License

MIT
