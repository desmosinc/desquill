import { type LeftOrRight, swapDir, type UpOrDown } from '../cursor.ts';
import type { MqModel } from '../mq-model.ts';
import type { MqGroup, MqNonGroup } from '../mq-nodes.ts';
import { makeSelection, type MqSelection } from '../selection.ts';

/** Arrow key left/right with shift held, and ctrl not held. */
export function selectLeftRight(model: MqModel, dir: LeftOrRight): MqSelection {
  const { selection } = model;
  // The general plan is to just move the head.

  const nextNode = selection.head.nodeInDirection(dir);
  if (nextNode) {
    return selectTowards(model, nextNode, dir);
  } else {
    return selectOutOf(model, selection.head.group, dir);
  }
}

/** The cursor is on the `swapDir(dir)` side of `node` and the user shift-arrow-keys in direction `dir`. */
function selectTowards(
  model: MqModel,
  node: MqNonGroup,
  dir: LeftOrRight
): MqSelection {
  const { selection } = model;
  const { anchor, head } = selection;

  const afterNextSiblingOfHead = node.cursorOnSide(dir);
  const selectionPastSibling = makeSelection(anchor, afterNextSiblingOfHead);
  if (!selectionPastSibling) {
    throw new Error(
      'Programming Error: head group did not change, so `makeSelection` should succeed.'
    );
  }
  const sameApparentSelection =
    selection.left.eq(selectionPastSibling.left) &&
    selection.right.eq(selectionPastSibling.right);
  if (sameApparentSelection) {
    // Oops, expanded past where we should have.
    // E.g. `selection` was `[\frac{12}{3!4}>` (where `!`=anchor, `[`=left, `>`=head=right),
    // then the user did a shift-left-arrow. The `selectionPastSibling` is then
    // `<\frac{12}{3!4}]` (where `!`=anchor, `<`=head=left, `]`=right), but it should have
    // shrunk down to `\frac{12}{3[!4>}` (where `!`=anchor, `>`=head=right, `[`=left).
    const newDepth = head.group.depth() + 2;
    if (newDepth > anchor.group.depth()) {
      throw new Error(
        'Programming Error: Selection flip despite not being in a bigger group.'
      );
    }
    // Legacy MQ uses `unselectInto` for this, but we can shortcut recursive logic by using `ancestorAtDepth`.
    const newHeadGroup = anchor.group.ancestorAtDepth(newDepth) as MqGroup;
    if (newHeadGroup.type !== 'group') {
      // Two levels down from one group should be another group.
      throw new Error(
        'Programming Error: Violated invariant of alternative group and non-group.'
      );
    }
    const newHead = newHeadGroup.lastCursorInDir(swapDir(dir));
    const newSelection = makeSelection(anchor, newHead);
    if (!newSelection) {
      throw new Error(
        'Programming Error: head group is an ancestor of the anchor group, so `makeSelection` should succeed.'
      );
    }
    return newSelection;
  } else {
    return selectionPastSibling;
  }
}

/** The cursor is at the start/end of group `group` and the user arrow-keys in the direction `dir`. */
function selectOutOf(
  model: MqModel,
  group: MqGroup,
  dir: LeftOrRight
): MqSelection {
  const parent = group.parent();
  if (!parent) {
    // Head is at the end of the root block.
    return model.selection;
  }
  const newHead = parent.cursorOnSide(dir);
  const newSelection = makeSelection(model.selection.anchor, newHead);
  if (!newSelection) {
    throw new Error(
      'Programming Error: head group is an ancestor of the anchor group, so `makeSelection` should succeed.'
    );
  }
  return newSelection;
}

function canExtendInDirInSameGroup(selection: MqSelection, dir: LeftOrRight) {
  return selection.head.nodeInDirection(dir) !== undefined;
}

/**
 * Shift-Up/Shift-Down. Equivalent to repeating shift-left/shift-right until reaching the end of a group,
 * but if it's already at the end of the group, then do shift-left/shift-right exactly once to open out of the group.
 */
export function selectUpDown(model: MqModel, updown: UpOrDown): MqModel {
  const dir = updown === 'up' ? 'left' : 'right';
  if (canExtendInDirInSameGroup(model.selection, dir)) {
    do {
      model = model.withSelection(selectLeftRight(model, dir));
    } while (canExtendInDirInSameGroup(model.selection, dir));
  } else {
    model = model.withSelection(selectLeftRight(model, dir));
  }
  return model;
}

/** Shift-Home/Shift-End. Equivalent to repeating shift-left/shift-right until reaching the end of a group. */
export function selectHomeEnd(model: MqModel, dir: LeftOrRight): MqModel {
  while (canExtendInDirInSameGroup(model.selection, dir)) {
    model = model.withSelection(selectLeftRight(model, dir));
  }
  return model;
}

/**
 * Ctrl-Shift-Home/Ctrl-Shift-End. Equivalent to repeating shift-left/shift-right until reaching the end
 * of the root group.
 */
export function selectCtrlHomeEnd(model: MqModel, dir: LeftOrRight): MqModel {
  while (
    model.selection.head.group.depth() > 0 ||
    canExtendInDirInSameGroup(model.selection, dir)
  ) {
    model = model.withSelection(selectLeftRight(model, dir));
  }
  return model;
}

export function selectAll(model: MqModel): MqModel {
  const root = model.root;
  const left = root.firstCursor();
  const right = root.lastCursor();
  // TODO-mq-rewrite-quirk: this seems backwards from what it should be (anchor on left, head on right).
  // Leaving it be to match existing mathquill.
  const selection = makeSelection(right, left);
  if (!selection) {
    throw new Error(
      'Programming Error: selection-all selection should always be valid.'
    );
  }
  return model.withSelection(selection);
}
