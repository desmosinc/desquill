import { Cursor } from './cursor.ts';
import {
  type MqGroup,
  type MqInteriorNode,
  type MqNode,
  nthChild,
  numChildren
} from './mq-nodes.ts';

/**
 * Traverse through all cursors in latex order.
 */
export function* allCursorsInOrder(root: MqGroup): Generator<Cursor> {
  yield* _allCursorsInOrder(root);
}

function* _allCursorsInOrder(node: MqGroup): Generator<Cursor> {
  yield new Cursor(node, 0);
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const n = numChildren(child);
    for (let j = 0; j < n; j++) {
      const childGroup = nthChild(child, j);
      if (childGroup.type !== 'group') {
        throw new Error('Non-group containing non-group.');
      }
      yield* _allCursorsInOrder(childGroup);
    }
    yield new Cursor(node, i + 1);
  }
}

export function* allGroupsInOrder(group: MqGroup): Generator<MqGroup> {
  yield group;
  for (const child of group.children) {
    const n = numChildren(child);
    for (let j = 0; j < n; j++) {
      const childGroup = nthChild(child, j);
      if (childGroup.type !== 'group') {
        throw new Error('Non-group containing non-group.');
      }
      yield* allGroupsInOrder(childGroup);
    }
  }
}

export function* allNodesInOrder(group: MqGroup): Generator<MqNode> {
  yield group;
  for (const child of group.children) {
    yield child;
    const n = numChildren(child);
    for (let j = 0; j < n; j++) {
      const childGroup = nthChild(child, j);
      if (childGroup.type !== 'group') {
        throw new Error('Non-group containing non-group.');
      }
      yield* allGroupsInOrder(childGroup);
    }
  }
}

export function fixParents(root: MqGroup) {
  for (const node of allNodesInOrder(root)) {
    const n = numChildren(node);
    for (let j = 0; j < n; j++) {
      const child = nthChild(node, j);
      child.updateParent(node as MqInteriorNode, j);
    }
  }
}
