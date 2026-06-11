import type { Cursor, LeftOrRight } from '../cursor.ts';
import type { MqModel } from '../mq-model.ts';
import type { MqGroup, MqNode, MqNonGroup } from '../mq-nodes.ts';

/**
 * Return the closest cursor to the x-coordinate `clientX` in the `group`.
 * This only returns `undefined` if some `boundingClientRect` call fails, i.e.
 * either the nodes have not been mounted to the DOM yet, or rogue CSS applied
 * `display: none` somewhere in there.
 */
export function seekGroup(group: MqGroup, clientX: number): Cursor | undefined {
  const lastChild = group.lastChild();
  if (!lastChild) {
    // There are no children, so just put the cursor in the _only_ available spot.
    return group.lastCursor();
  }
  let child: MqNonGroup = lastChild;
  let rect = child.boundingClientRect();

  if (!rect) return undefined;

  if (clientX > rect.right) {
    // Click right of the rightmost child.
    return group.lastCursor();
  }

  // Proceed right-to-left. This follows old MQ. I don't know why it's right-to-left.
  // We could equally well binary search here, but there's no need at this point.
  while (clientX < rect.left) {
    const prevChild = child.prevSibling();
    if (!prevChild) break;

    child = prevChild;
    rect = child.boundingClientRect();
    if (!rect) return undefined;
  }
  return seekNonGroup(child, clientX);
}

function seekNonGroup(node: MqNonGroup, clientX: number): Cursor | undefined {
  const rect = node.boundingClientRect();
  if (!rect) return undefined;

  let group = node.firstChild();
  if (group === undefined) {
    // No children; insert at whichever side the click was closer to
    const mid = rect.left + rect.width / 2;
    const side: LeftOrRight = clientX < mid ? 'left' : 'right';
    return node.cursorOnSide(side);
  }

  // Else this is something with one or more children, like brackets or supsub or fraction.
  //
  // Follow the behavior of old MQ here, which seems un-intuitive because up arrow from
  // `\frac{\frac{12345678}{1}}{abcd<!>}` puts the cursor after the 6 like
  // `\frac{\frac{123456<!>78}{1}}{abcd}`, rather than at the end of the denominator.

  let prevLeftBound = rect.left;
  for (; group !== undefined; group = group.nextSibling()) {
    const groupRect = group.boundingClientRect();
    if (!groupRect) return undefined;

    if (clientX < groupRect.left) {
      // If this group is the middle of a brackets node, then this actually makes sense:
      // `prevLeftBound` is the left side of the left bracket, and `groupRect.left` is the left side of the
      // group in the middle of the brackets. Place the cursor either just inside or just outside the open-paren,
      // depending on which is closer.
      //
      // Other situations like sup-sub and fraction make less sense.
      // For a numerator, `prevLeftBound` is the left edge of the fraction as a whole.
      // For a denominator, `prevLeftBound` is the left edge of the numerator.
      const mid = (prevLeftBound + groupRect.left) / 2;
      // Closer to this groups's left bound, or the bound left of that?
      if (clientX < mid) {
        const prevSibling = group.prevSibling();
        if (prevSibling) {
          return prevSibling.lastCursor();
        } else {
          return node.cursorOnSide('left');
        }
      } else {
        return group.firstCursor();
      }
    } else if (clientX > groupRect.right) {
      prevLeftBound = groupRect.right;
    } else {
      // The cursor goes in this group.
      return seekGroup(group, clientX);
    }
  }

  // There is always a lastChild because we checked above there's at least one child.
  const lastGroup = node.lastChild()!;
  const lastGroupRect = lastGroup.boundingClientRect();
  if (!lastGroupRect) return undefined;

  // We just visited the last block.
  // Closer to this block's right bound, or the non-group parent's right bound?
  // This makes sense in general. In the particular of this group being the middle of a brackets node,
  // this is placing the cursor either just inside or just outside the close-paren, depending on which is closer.
  const mid = (rect.right + lastGroupRect.right) / 2;
  if (clientX < mid) {
    return lastGroup.lastCursor();
  } else {
    return node.cursorOnSide('right');
  }
}

export function seekCursorInTarget(
  model: MqModel,
  target: Element | undefined,
  clientX: number
): Cursor {
  const node = domNodeToMqNode(model, target) ?? model.root;
  if (node.type === 'group') {
    return seekGroup(node, clientX) ?? node.lastCursor();
  } else {
    return seekNonGroup(node, clientX) ?? node.cursorOnSide('right');
  }
}

/** Returns undefined only if the `target` is not a descendent of `model.root.domNode`. */
export function domNodeToMqNode(
  model: MqModel,
  target: Element | undefined
): MqNode | undefined {
  if (model.domToMqNode === undefined) {
    throw new Error('Programming Error: Not yet rendered to DOM.');
  }
  if (!target) {
    return undefined;
  }
  // Loop because the targeted element could be a descendent of a node in the `domToMqNode` map.
  while (true) {
    const node = model.domToMqNode.get(target as HTMLElement);
    if (node) {
      // Old MQ has some logic being careful here when a mathquill
      // is embedded inside another mathquill, like via a token.
      // ref e.g. https://github.com/desmosinc/mathquill/pull/331
      return node;
    }
    if (!target.parentElement) {
      return undefined;
    }
    target = target.parentElement;
  }
}
