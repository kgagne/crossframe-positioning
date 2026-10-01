/**
 * Realm-independent Element check. `instanceof Element` is false for elements
 * that belong to another frame, because each window has its own Element.
 *
 * @param {unknown} value
 * @returns {value is Element}
 */
export function isElement(value) {
  return value?.nodeType === 1 && typeof value.getBoundingClientRect === "function";
}

function sourceWindowOf(element) {
  if (!isElement(element)) {
    throw new TypeError("element must be an Element");
  }

  const sourceWindow = element.ownerDocument?.defaultView;
  if (!sourceWindow) {
    throw new Error("Unable to resolve the element's source window");
  }

  return sourceWindow;
}

function parentWindowOf(currentWindow) {
  const frameElement = currentWindow.frameElement;

  if (!frameElement) {
    throw new Error("Target window is not a reachable same-origin ancestor");
  }

  const parentWindow = frameElement.ownerDocument?.defaultView;

  if (!parentWindow) {
    throw new Error("Unable to continue frame traversal");
  }

  return { frameElement, parentWindow };
}

/**
 * List the windows between an element and a same-origin ancestor window,
 * starting with the element's own window and ending with the target.
 *
 * @param {Element} element
 * @param {Window} targetWindow
 * @returns {Window[]}
 */
export function getWindowChain(element, targetWindow = window.top || window) {
  let currentWindow = sourceWindowOf(element);
  const chain = [currentWindow];

  while (currentWindow !== targetWindow) {
    currentWindow = parentWindowOf(currentWindow).parentWindow;
    chain.push(currentWindow);
  }

  return chain;
}

/**
 * Translate an element's viewport rectangle into the coordinate space of a
 * same-origin ancestor window.
 *
 * Frames scaled with CSS transforms or `zoom` are supported. Rotated or skewed
 * frames are approximated by their bounding box.
 *
 * @param {Element} element
 * @param {Window} targetWindow
 * @returns {{left:number,top:number,right:number,bottom:number,width:number,height:number}}
 */
export function getRectRelativeToWindow(element, targetWindow = window.top || window) {
  let currentWindow = sourceWindowOf(element);

  const rect = element.getBoundingClientRect();
  let left = rect.left;
  let top = rect.top;
  let width = rect.width;
  let height = rect.height;

  while (currentWindow !== targetWindow) {
    const { frameElement, parentWindow } = parentWindowOf(currentWindow);

    // The frame's viewport starts inside its border and padding, not at the
    // edge of its border box. Those insets and the frame's contents are both
    // scaled by any transform or zoom; offsetWidth/offsetHeight are not, so
    // the ratio to the rendered box gives the scale.
    const frameRect = frameElement.getBoundingClientRect();
    const frameStyle = parentWindow.getComputedStyle(frameElement);
    const scaleX = frameElement.offsetWidth ? frameRect.width / frameElement.offsetWidth : 1;
    const scaleY = frameElement.offsetHeight ? frameRect.height / frameElement.offsetHeight : 1;
    const insetLeft = frameElement.clientLeft + (parseFloat(frameStyle.paddingLeft) || 0);
    const insetTop = frameElement.clientTop + (parseFloat(frameStyle.paddingTop) || 0);

    left = frameRect.left + (insetLeft + left) * scaleX;
    top = frameRect.top + (insetTop + top) * scaleY;
    width *= scaleX;
    height *= scaleY;

    currentWindow = parentWindow;
  }

  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height
  };
}
