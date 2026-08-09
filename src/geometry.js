/**
 * Translate an element's viewport rectangle into the coordinate space of a
 * same-origin ancestor window.
 *
 * @param {Element} element
 * @param {Window} targetWindow
 * @returns {{left:number,top:number,right:number,bottom:number,width:number,height:number}}
 */
export function getRectRelativeToWindow(element, targetWindow = window.top || window) {
  if (!(element instanceof Element)) {
    throw new TypeError("element must be an Element");
  }

  const sourceWindow = element.ownerDocument?.defaultView;
  if (!sourceWindow) {
    throw new Error("Unable to resolve the element's source window");
  }

  const rect = element.getBoundingClientRect();
  let left = rect.left;
  let top = rect.top;
  let currentWindow = sourceWindow;

  while (currentWindow !== targetWindow) {
    const frameElement = currentWindow.frameElement;

    if (!frameElement) {
      throw new Error("Target window is not a reachable same-origin ancestor");
    }

    const frameRect = frameElement.getBoundingClientRect();
    left += frameRect.left;
    top += frameRect.top;

    currentWindow = frameElement.ownerDocument?.defaultView;

    if (!currentWindow) {
      throw new Error("Unable to continue frame traversal");
    }
  }

  return {
    left,
    top,
    right: left + rect.width,
    bottom: top + rect.height,
    width: rect.width,
    height: rect.height
  };
}
