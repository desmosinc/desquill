import { type Cursor, type LeftOrRight, swapDir } from '../cursor';
import type { MqModel } from '../mq-model';
import { isLeaf, type MqGroup, type MqNonGroup } from '../mq-nodes';
import { getSelectionSide, isSelectionCollapsed } from '../selection';
import { downInto, upInto } from './move-up-down';

/** Arrow key left/right without shift/ctrl held. */
export function moveLeftRight(model: MqModel, dir: LeftOrRight): MqModel {
  const selection = model.selection;
  if (isSelectionCollapsed(selection)) {
    // Move the cursor by one space
    return collapsedCursorMoveLeftRight(model, selection.anchor, dir);
  }
  // Move to that side of the selection
  const point = getSelectionSide(selection, dir);
  return model.withPointSelection(point);
}

function collapsedCursorMoveLeftRight(
  model: MqModel,
  cursor: Cursor,
  dir: LeftOrRight
): MqModel {
  const nextNode = cursor.nodeInDirection(dir);
  if (nextNode) {
    return moveTowards(model, nextNode, dir);
  } else {
    return moveOutOf(model, cursor.group, dir);
  }
}

/** The cursor is on the `swapDir(dir)` side of `node` and the user arrow-keys in direction `dir`. */
function moveTowards(
  model: MqModel,
  node: MqNonGroup,
  dir: LeftOrRight
): MqModel {
  const treatAsLeaf =
    isLeaf(node) ||
    (node.type === 'supsub' && !node.sup && model.config.autoSubscriptNumerals);
  if (treatAsLeaf) {
    // E.g. left-arrow from `123<!>` to `12<!>3`.
    return model
      .withPointSelection(node.cursorOnSide(dir))
      .withAriaQueueNode(node);
  }
  const el = updownInto(model, node) ?? node.lastChildInDir(swapDir(dir));
  const point = el.lastCursorInDir(swapDir(dir));
  // E.g. left-arrow from `\frac{123}{4}<!>` to `\frac{123<!>}{4}`.
  return model
    .withPointSelection(point)
    .withAriaQueueDirEndOf(swapDir(dir), el);
}

/** The cursor is at the start/end of group `group` and the user arrow-keys in the direction `dir`. */
export function moveOutOf(
  model: MqModel,
  group: MqGroup,
  dir: LeftOrRight
): MqModel {
  const parent = group.parent();
  if (parent === undefined) {
    // moving left from the leftmost point or right from the rightmost point.
    // No Aria alert here.
    return model.withPointSelection(group.lastCursorInDir(dir));
  }
  const updownIntoNode = updownInto(model, parent);
  const nextGroup = group.nextSiblingInDir(dir);
  if (!updownIntoNode && nextGroup) {
    return model
      .withPointSelection(nextGroup.lastCursorInDir(swapDir(dir)))
      .withAriaQueueDirOf(swapDir(dir), nextGroup);
  } else {
    return model
      .withPointSelection(parent.cursorOnSide(dir))
      .withAriaQueueDirOf(dir, parent);
  }
}

function updownInto(model: MqModel, node: MqNonGroup): MqGroup | undefined {
  const updown = model.config.leftRightIntoCmdGoes;
  if (updown === 'up') {
    return upInto(node);
  } else if (updown === 'down') {
    return downInto(node);
  } else {
    return undefined;
  }
}
