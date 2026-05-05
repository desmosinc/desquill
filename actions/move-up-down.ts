import {
  Cursor,
  type LeftOrRight,
  swapDir,
  swapUpdown,
  type UpOrDown
} from '../cursor';
import type { MqModel } from '../mq-model';
import {
  type MqGroup,
  type MqInteriorNode,
  type MqNonGroup
} from '../mq-nodes';
import { addCursorIndex } from '../stash-cursors';
import { seekGroup } from './seek-cursor';

export function moveUpDown(model: MqModel, updown: UpOrDown): MqModel {
  const selection = model.selection;

  const right = updownIntoOnSide(selection.head, updown, 'right');
  if (right) {
    // The head is before something like a fraction that has an upInto/downInto,
    // e.g. `<!>\frac{1}{2}`, so move into the top/bottom of it.
    return model
      .withPointSelection(right)
      .withAriaQueueDirEndOf('left', right.group);
  }

  const left = updownIntoOnSide(selection.head, updown, 'left');
  if (left) {
    // The head is after something like a fraction that has an upInto/downInto,
    // e.g. `\frac{1}{2}<!>`, so move into the top/bottom of it.
    return model
      .withPointSelection(left)
      .withAriaQueueDirEndOf('right', left.group);
  }

  return updownOutOf(model, selection.head, selection.head.group, updown);
}

/**
 * If there is a fraction/supsub/etc on the `dir` side of the `cursor`, then move
 * into the `updown` group of that fraction/supsub/etc. Return the new cursor.
 */
function updownIntoOnSide(
  cursor: Cursor,
  updown: UpOrDown,
  dir: LeftOrRight
): Cursor | undefined {
  const sideNode = cursor.nodeInDirection(dir);
  if (!sideNode) return undefined;
  const updownInto = updown === 'up' ? upInto(sideNode) : downInto(sideNode);
  if (!updownInto) return undefined;
  return updownInto.lastCursorInDir(swapDir(dir));
}

/**
 * The user pressed 'down' (resp. up) in the group `group`. Find the first ancestor where the cursor
 * is in its `upInto` group (resp. `downInto` group).
 * 1. If the ancestor has a not-undefined `downInto` (resp `upInto`), then move into it.
 * 2. Otherwise (a `sup` with no `sub`, or a `sub` with no `sup`), move next to the ancestor.
 */
function updownOutOf(
  model: MqModel,
  cursor: Cursor,
  group: MqGroup,
  updown: UpOrDown
): MqModel {
  const ancestor = firstAncestorWithUpdown(group, swapUpdown(updown));
  if (ancestor === undefined) {
    // Nowhere to go, move cursor to head.
    return model.withPointSelection(model.selection.head);
  }
  const moveTo = updownInto(ancestor, updown);
  if (moveTo) {
    // Move into it
    const ancestorGroup = group.ancestorAtDepth(
      ancestor.depth() + 1
    ) as MqGroup;
    const point = jumpUpDown(cursor, ancestorGroup, moveTo);
    return model
      .withPointSelection(point)
      .withAriaQueueNode(point.group, { shouldDescribe: true });
  } else {
    // A `sup` with no `sub`, or a `sub` with no `sup`
    // Move next to the ancestor
    const dir: LeftOrRight = isAtEndOfAncestor(cursor, ancestor)
      ? 'right'
      : 'left';
    return model
      .withPointSelection(ancestor.cursorOnSide(dir))
      .withAriaQueueDirOf(dir, ancestor);
  }
}

/** Find the first ancestor where the cursor is in its `updownInto` group. */
function firstAncestorWithUpdown(group: MqGroup, updown: UpOrDown) {
  while (true) {
    const ancestor = group.parent();
    if (!ancestor) {
      return undefined;
    }
    const updownGroup = updownInto(ancestor, updown);
    if (updownGroup && updownGroup.eq(group)) {
      return ancestor;
    }
    group = ancestor.parent();
  }
}

/**
 * Assumption: `cursor` is inside `ancestor`.
 *
 * True if the cursor is on the right-most side of its group, which is the last child of its parent, and
 * its parent is the last child of _its_ parent, up until you get to the `ancestor` itself.
 *
 * For example, a "down" when the cursor is at the end of the `sqrt` in an exponent, like `e^{\sqrt{x<!>}}`, triggers
 * the exception (putting the cursor after the SupSub node, even though the cursor isn't at the end of the `sup` group).
 * That's because the cursor is at the end of the index of the `sqrt`, which is at the end of the `sup` group.
 *
 * The same applies for a cursor at the end of a `brackets` node, like `e^{\left(x<!>\right)}`. It triggers the
 * exception for the same reason, despite the cursor not visually being exactly at the end of the group because
 * it looks like a `)` is after it. However, internally, there is nothing after the cursor because it's at the end
 * of the group in the `brackets` node.
 *
 * Surprisingly, this condition doesn't require any ancestor group to be the last child of a parent node.
 * As a consequence, pressing "down" on either `e^{\sqrt[3<!>]{5}}` or `e^{\sqrt[3]{5<!>}}` moves the cursor to
 * after the exponent as `e^{\sqrt[3]{5}}<!>`, despite the cursor at the end of the index "3" seems like it's
 * not at the end of the exponent (and should thus move to bbefore the exponent).
 *
 * Based on `insLeftOfMeUnlessAtEnd` from legacy MQ.
 */
function isAtEndOfAncestor(cursor: Cursor, ancestor: MqNonGroup): boolean {
  if (!cursor.eq(cursor.group.lastCursor())) {
    return false;
  }
  const groupParent = cursor.group.parent();
  if (groupParent === undefined) {
    throw new Error('Programming Error: ancestor is not ancestor of cursor.');
  }
  let current: MqInteriorNode = groupParent;
  while (!current.eq(ancestor)) {
    const parentGroup = current.parent();
    if (!current.eq(parentGroup.lastChild()!)) {
      return false;
    }
    const grandparentNonGroup = parentGroup.parent();
    if (grandparentNonGroup === undefined) {
      throw new Error('Programming Error: ancestor is not ancestor of cursor.');
    }
    current = grandparentNonGroup;
  }
  return true;
}

/**
 * Jump from one group to another group with up/down arrow.
 * Note that `cursor` is not necessarily in the `ancestorGroup`.
 * For example, in `\frac{\frac{abc}{xy<!>z}+1}{123}`, pressing "Down"
 * leads to `jumpUpDown()` called with the cursor being in the `xyz` group but the
 * `ancestorGroup` is the full `\frac{abc}{xyz}+1` (and `toGroup` is a the `123`.)
 */
function jumpUpDown(
  cursor: Cursor,
  ancestorGroup: MqGroup,
  toGroup: MqGroup
): Cursor {
  addCursorIndex(cursor.group, 'upDown', cursor.index);
  ancestorGroup.mutable_upDownGroup = cursor.group;

  const upDownGroup = toGroup.mutable_upDownGroup;
  if (upDownGroup) {
    const cachedIndex = upDownGroup?.mutable_cursorIndices?.get('upDown');
    if (cachedIndex !== undefined) {
      return new Cursor(upDownGroup, cachedIndex);
    }
  }

  const cursorX = getCursorClientX(cursor);
  if (cursorX === undefined) {
    // Give up. This should only be reachable if rogue CSS made things `display: none`,
    // or if we were un-careful and called this method before mounting to the DOM.
    return toGroup.lastCursor();
  }
  const newCursor = seekGroup(toGroup, cursorX);
  if (newCursor === undefined) {
    // Guarding against rogue CSS again.
    return toGroup.lastCursor();
  }
  return newCursor;
}

export function getCursorClientX(cursor: Cursor): number | undefined {
  // TODO-mq-rewrite-behavior: This is using the adjacent nodes to determine the cursor position.
  // That probably isn't the most accurate because `boundingClientRect` doesn't include
  // margin. Old MQ tracks the rendered cursor node, which we'd want to put in the MqModel.
  const nodeBefore = cursor.nodeBefore();
  if (nodeBefore) {
    return nodeBefore.boundingClientRect()?.right;
  } else {
    const left = cursor.group.boundingClientRect()?.left;
    if (left === undefined) return undefined;
    if (cursor.group.parent() === undefined) {
      // Special case of the cursor at the far left of the root group.
      // The root group may be scrolled, in which case we need to subtract
      // the scroll amount to get to the actual x coordinate.
      const scrollLeft = cursor.group.getDomNode()?.scrollLeft;
      if (scrollLeft !== undefined) {
        return left - scrollLeft;
      }
    }
    return left;
  }
}

function updownInto(node: MqNonGroup, updown: UpOrDown): MqGroup | undefined {
  return updown === 'up' ? upInto(node) : downInto(node);
}

export function upInto(node: MqNonGroup): MqGroup | undefined {
  switch (node.type) {
    case 'frac':
    case 'binom': {
      return node.num;
    }
    case 'supsub':
    case 'summation': {
      return node.sup;
    }
    case 'sqrt':
    case 'brackets':
    case 'style-cmd':
    case 'char':
    case 'percentof':
    case 'token':
    case 'ans': {
      return undefined;
    }
  }
}

export function downInto(node: MqNonGroup): MqGroup | undefined {
  switch (node.type) {
    case 'frac':
    case 'binom': {
      return node.den;
    }
    case 'supsub':
    case 'summation': {
      return node.sub;
    }
    case 'sqrt':
    case 'brackets':
    case 'style-cmd':
    case 'char':
    case 'percentof':
    case 'token':

    case 'ans': {
      return undefined;
    }
  }
}
