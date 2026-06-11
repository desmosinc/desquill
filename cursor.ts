import type { MqGroup, MqNonGroup } from './mq-nodes.ts';

export type LeftOrRight = 'left' | 'right';

export function swapDir(dir: LeftOrRight) {
  return dir === 'left' ? 'right' : 'left';
}

export type UpOrDown = 'up' | 'down';

export function swapUpdown(updown: UpOrDown) {
  return updown === 'up' ? 'down' : 'up';
}

/**
 * A cursor is a position after a node in a group,
 * or at the start of the group.
 */
export class Cursor {
  readonly group: MqGroup;
  /**
   * Invariant: `0 <= index <= group.children.length`.
   *
   * The cursor is after `group.children[index - 1]` (if `index > 0`)
   * and it is before `group.children[index]` (if `index < group.children.length`)
   */
  readonly index: number;

  constructor(group: MqGroup, index: number) {
    this.group = group;
    this.index = index;
  }

  eq(other: Cursor): boolean {
    return this.group.eq(other.group) && this.index === other.index;
  }

  nodeInDirection(dir: LeftOrRight): MqNonGroup | undefined {
    if (dir === 'left') {
      return this.nodeBefore();
    } else {
      return this.nodeAfter();
    }
  }

  /**
   * Return the node before the cursor, if any.
   * This returns `undefined` when the cursor is at the start of a group.
   */
  nodeBefore(): MqNonGroup | undefined {
    return this.group.nthChild(this.index - 1);
  }

  /**
   * Return the node after the cursor, if any.
   * This returns `undefined` when the cursor is at the end of a group.
   */
  nodeAfter(): MqNonGroup | undefined {
    return this.group.nthChild(this.index);
  }
}
