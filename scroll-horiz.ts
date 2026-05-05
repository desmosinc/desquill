/***********************************************
 * Horizontal panning for editable fields that
 * overflow their width
 **********************************************/

import { getCursorClientX } from './actions/move-up-down';
import { animate } from './animate';
import type { MqController } from './mq-controller';
import {
  isSelectionCollapsed,
  makePointSelection,
  type MqSelection
} from './selection';

/**
 * Scroll the math field left or right to keep the head of the selection in view.
 *
 * The scrolling is performed with a short animation: the first scroll update is synchronous
 * (so the field scrolls on the first frame after an input), and later scroll updates
 * are performed after `requestAnimationFrame` calls.
 */
export function scrollHoriz(mqController: MqController) {
  const root = mqController.getRoot();
  const rootDom = root.getDomNode();
  if (!rootDom) return;
  const rootRect = rootDom.getBoundingClientRect();
  if (!rootRect) return;
  let selection = mqController.getModel().selection;

  if (mqController.isSelecting()) {
    // Currently dragging to select, so the main point of interest is
    // the cursor, not the selection as a whole.
    selection = makePointSelection(selection.head);
  }

  const scrollBy =
    mqController.getFocusState() === 'focused'
      ? getScrollBy(selection, rootRect)
      : // Scroll back to start when not focused.
        -rootDom.scrollLeft;

  if (scrollBy === 0) return;
  if (scrollBy < 0 && rootDom.scrollLeft === 0) return;
  if (
    scrollBy > 0 &&
    rootDom.scrollWidth <= rootDom.scrollLeft + rootRect.width
  )
    return;

  if (mqController.cancelScrollHoriz) {
    mqController.cancelScrollHoriz();
    mqController.cancelScrollHoriz = undefined;
  }

  const start = rootDom.scrollLeft;
  const duration = mqController.getModel().config.scrollAnimationDuration;
  animate(duration, (progress, scheduleNext, cancel) => {
    if (progress >= 1) {
      mqController.cancelScrollHoriz = undefined;
      rootDom.scrollLeft = Math.round(start + scrollBy);
    } else {
      mqController.cancelScrollHoriz = cancel;
      scheduleNext();
      rootDom.scrollLeft = Math.round(start + progress * scrollBy);
    }
  });
}

function getScrollBy(selection: MqSelection, rootRect: DOMRect): number {
  if (isSelectionCollapsed(selection)) {
    // point selection
    const x = getCursorClientX(selection.head);
    if (x === undefined) {
      // Not yet rendered, or rogue 'display: none'
      return 0;
    }
    if (x > rootRect.right - 20) return x - (rootRect.right - 20);
    else if (x < rootRect.left + 20) return x - (rootRect.left + 20);
    else return 0;
  } else {
    // non-point selection
    const left = selection.left.nodeAfter()?.boundingClientRect()?.left;
    const right = selection.right.nodeBefore()?.boundingClientRect()?.right;
    if (left === undefined || right === undefined) {
      // Not yet rendered, or rogue 'display: none'
      return 0;
    }
    const overLeft = left - (rootRect.left + 20);
    const overRight = right - (rootRect.right - 20);
    if (selection.head.eq(selection.left)) {
      // Head is on the left
      if (overLeft < 0) return overLeft;
      else if (overRight > 0) {
        if (left - overRight < rootRect.left + 20) return overLeft;
        else return overRight;
      } else return 0;
    } else {
      // Head is on the right
      if (overRight > 0) return overRight;
      else if (overLeft < 0) {
        if (right - overLeft > rootRect.right - 20) return overRight;
        else return overLeft;
      } else return 0;
    }
  }
}
