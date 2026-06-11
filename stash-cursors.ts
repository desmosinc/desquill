import { Cursor } from './cursor.ts';
import type { MqGroup } from './mq-nodes.ts';
import { allGroupsInOrder } from './node-traversal-order.ts';
import {
  makeLeastCommonAncestorSelection,
  type MqSelection
} from './selection.ts';

export type StashedCursorKey = 'head' | 'anchor' | 'upDown';

/** Mutates mutable_cursorIndices on the node tree.  */
export function stashSelectionCursors(selection: MqSelection) {
  const { head, anchor } = selection;
  addCursorIndex(head.group, 'head', head.index);
  addCursorIndex(anchor.group, 'anchor', anchor.index);
}

/**
 * Mutates (deletes) mutable_cursorIndices on the node tree.
 * Returns the selection they describe.
 */
export function unstashSelectionCursors(root: MqGroup) {
  let newHead;
  let newAnchor;
  for (const group of allGroupsInOrder(root)) {
    const node = group;
    if (!node.mutable_cursorIndices) continue;
    const thisHead = node.mutable_cursorIndices.get('head');
    if (thisHead !== undefined) {
      if (newHead !== undefined) {
        throw new Error('Programming Error: Duplicate head');
      }
      newHead = new Cursor(group, thisHead);
      node.mutable_cursorIndices.delete('head');
    }
    const thisAnchor = node.mutable_cursorIndices.get('anchor');
    if (thisAnchor !== undefined) {
      if (newAnchor !== undefined) {
        throw new Error('Programming Error: Duplicate anchor');
      }
      newAnchor = new Cursor(group, thisAnchor);
      node.mutable_cursorIndices.delete('anchor');
    }
  }
  if (newHead === undefined) {
    throw new Error('Programming Error: Missing head.');
  }
  if (newAnchor === undefined) {
    throw new Error('Programming Error: Missing anchor.');
  }
  return makeLeastCommonAncestorSelection(newAnchor, newHead);
}

export function clearStashedSelectionCursors(root: MqGroup) {
  for (const group of allGroupsInOrder(root)) {
    if (!group.mutable_cursorIndices) continue;
    group.mutable_cursorIndices.delete('head');
    group.mutable_cursorIndices.delete('anchor');
  }
}

export function clearStashedUpdownCursors(root: MqGroup) {
  for (const group of allGroupsInOrder(root)) {
    if (group.mutable_upDownGroup) {
      group.mutable_upDownGroup = undefined;
    }
    if (group.mutable_cursorIndices) {
      group.mutable_cursorIndices.delete('upDown');
    }
  }
}

/** Mutate the given group by adding a cursor  */
export function addCursorIndex(
  group: MqGroup,
  key: StashedCursorKey,
  index: number
) {
  if (!group.mutable_cursorIndices) {
    group.mutable_cursorIndices = new Map();
  }
  group.mutable_cursorIndices.set(key, index);
}

export function copyCursorIndices(
  fromGroup: MqGroup,
  toGroup: MqGroup,
  fn: (index: number) => number
) {
  if (!fromGroup.mutable_cursorIndices) return;
  for (const [key, index] of fromGroup.mutable_cursorIndices) {
    const newIndex = fn(index);
    addCursorIndex(toGroup, key, newIndex);
  }
}

export function someCursorSatisfies(
  group: MqGroup,
  fn: (index: number) => boolean
) {
  if (!group.mutable_cursorIndices) return false;
  for (const index of group.mutable_cursorIndices.values()) {
    if (fn(index)) return true;
  }
  return false;
}
