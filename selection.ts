import { Cursor, type LeftOrRight } from './cursor.ts';
import type { MqModel } from './mq-model.ts';
import {
  makeGroup,
  type MqBrackets,
  mqBracketWithGhostSide,
  type MqGroup,
  type MqNode
} from './mq-nodes.ts';
import type { ExportedLatexSelection } from './mq-public-api.ts';
import { cursorToLatexIndex, printLatex } from './print-latex.ts';
import { copyCursorIndices } from './stash-cursors.ts';

/**
 * Invariants (checked in `makeSelection`)
 * 1. `head.group.contains(anchor.group)` (Broad Head).
 * 2. `left.group.eq(head.group) && right.group.eq(head.group)` (Same Group)
 * 3. `left.eq(head) || right.eq(head)` (Head is One End)
 * 4. `right.index >= left.index` (Right is Right of Left)
 * Note a point selection (all four fields equal) satisfies all of the invariants.
 */
export type MqSelection = {
  readonly anchor: Cursor;
  readonly head: Cursor;
  readonly left: Cursor;
  readonly right: Cursor;
};

export function exportSelection(
  selection: MqSelection
): ExportedLatexSelection {
  const { left, right, anchor, head } = selection;
  const latex = printLatex(left.group.getRoot());
  return {
    latex,
    startIndex: cursorToLatexIndex(left),
    endIndex: cursorToLatexIndex(right),
    anchorIndex: cursorToLatexIndex(anchor),
    headIndex: cursorToLatexIndex(head)
  };
}

/**
 * Visualize the selection, with `!` representing the anchor,
 * The head is either `<` or `>`, and the other end of the balanced
 * range is represented with `[` or `]`.
 */
export function visualizeSelection(selection: MqSelection) {
  const latex = printLatex(selection.head.group.getRoot());

  if (latex.includes('<!>') || latex.includes('!]') || latex.includes('[!')) {
    throw new Error('Ambiguous selection visualization.');
  }

  const leftLatexIndex = cursorToLatexIndex(selection.left);
  const rightLatexIndex = cursorToLatexIndex(selection.right);
  const anchorLatexIndex = cursorToLatexIndex(selection.anchor);
  const headLatexIndex = cursorToLatexIndex(selection.head);
  const a = latex.slice(0, leftLatexIndex);
  const b = latex.slice(leftLatexIndex, anchorLatexIndex);
  const c = latex.slice(anchorLatexIndex, rightLatexIndex);
  const d = latex.slice(rightLatexIndex);

  const leftChar = leftLatexIndex === headLatexIndex ? '<' : '[';
  const rightChar = rightLatexIndex === headLatexIndex ? '>' : ']';
  return `${a}${leftChar}${b}!${c}${rightChar}${d}`;
}

export function getSelectionSide(selection: MqSelection, dir: LeftOrRight) {
  return dir === 'left' ? selection.left : selection.right;
}

export function isSelectionCollapsed(selection: MqSelection) {
  return selection.left.eq(selection.right);
}

export function makePointSelection(anchorAndHead: Cursor): MqSelection {
  // The point selection always satisfies the invariants since `anchor.eq(head)`.
  return {
    anchor: anchorAndHead,
    head: anchorAndHead,
    left: anchorAndHead,
    right: anchorAndHead
  };
}

/** Assumes the anchor is on the left. */
export function makeSameParentSelection(
  group: MqGroup,
  leftIndex: number,
  rightIndex: number
): MqSelection {
  leftIndex = Math.min(leftIndex, rightIndex);
  rightIndex = Math.max(leftIndex, rightIndex);
  const left = new Cursor(group, leftIndex);
  const right = new Cursor(group, rightIndex);
  // This selection always satisfies the invariants since `anchor.group.eq(head.group)`
  return {
    anchor: left,
    head: right,
    left,
    right
  };
}

/**
 * Return the selection given by the `anchor` and `head`.
 * If it is an invalid selection (violates Broad Head Invariant), return undefined.
 * Note that if `anchor.eq(head)`, this will never return undefined.
 * More generally, if `anchor.group.eq(head.group)`, this will never return undefined.
 */
export function makeSelection(
  anchor: Cursor,
  head: Cursor
): MqSelection | undefined {
  const otherEndIndex = getOtherEndIndex(anchor, head);
  if (otherEndIndex === undefined) {
    // Broad Head Invariant violated, return undefined.
    return undefined;
  }

  const leftIndex = Math.min(head.index, otherEndIndex);
  const rightIndex = Math.max(head.index, otherEndIndex);
  // The min/max behavior ensures `right.index >= left.index` (Right is Right of Left)
  const left = new Cursor(head.group, leftIndex);
  const right = new Cursor(head.group, rightIndex);
  // Trivially satisfies `left.group.eq(head.group) && right.group.eq(head.group)` (Same Group Invariant).
  // Also, `leftIndex === head.index || rightIndex === head.index` clearly holds (assuming there are no NaNs).
  // so `left.eq(head) || right.eq(head)` holds (Head is One End Invariant).

  if (anchor.group.getRoot() !== head.group.getRoot()) {
    throw new Error(
      'Programming Error: anchor and head must be from same root'
    );
  }

  return { anchor, head, left, right };
}

function satisfiesBroadHead(anchor: Cursor, head: Cursor): boolean {
  return head.group.contains(anchor.group);
}

/**
 * Returns undefined if the `anchor` and `head` together do not satisfy the Broad Head Invariant.
 *
 * Otherwise, they satisfy the Broad Head Invariant, so one end of the range is going to be the `head`.
 * The other end will be based on the `anchor` but will be in the same group as the `head`.
 * Return the index of the other end in the group.
 *
 * If the `head` is left of the `anchor`, then the left endpoint is the `head`
 * and the right endpoint is the first position right of the `anchor` (including the `anchor`)
 * with the same parent group as the `head`.
 *
 * If the `anchor` is left of the `head`, the right endpoint is the `head`,
 * and the left endpoint is the first position left of the `anchor` (including the `anchor`)
 * with the same parent group as the `head`.
 */
function getOtherEndIndex(anchor: Cursor, head: Cursor): number | undefined {
  const parentDepth = head.group.depth();
  if (!satisfiesBroadHead(anchor, head)) {
    return undefined;
  }
  // We just checked and verified the Broad Head invariant is satisfied,
  // i.e. `head.group.contains(anchor.group)`.
  // Hence we know `anchor.group.depth() >= parentDepth`

  let otherEndIndex;
  if (anchor.group.depth() === parentDepth) {
    // anchor already has the right depth.
    otherEndIndex = anchor.index;
  } else {
    // `anchor.group.depth() > parentDepth`, so the right edge is really
    // going to be after or before an ancestor non-group of `anchor`.
    // That is `anchorAncestor`, which is a direct child of `head.group`.
    const anchorAncestor = anchor.group.ancestorAtDepth(parentDepth + 1);
    otherEndIndex = anchorAncestor.getIndex()!;

    if (otherEndIndex >= head.index) {
      // We went up in the spine, so `anchorIndex` (if used in a cursor) currently points _before_ some parent
      // of the real anchor cursor. That's fine if the head is to the right, but not fine if the head is to the left.
      //
      // E.g. `1-\frac{23}{45}+6`. If the anchor is after the "2", and the head is after the "1", then
      // (before this tweak), the `anchorIndex` points to before the fraction, and the `head.index`
      // points to after the "1". Adding 1 to the `anchorIndex` causes it to point to after the fraction.
      otherEndIndex += 1;
    }
  }
  return otherEndIndex;
}

/**
 * Create a new selection by maintaining a given anchor, and picking a new head.
 * The head is picked such that `makeSelection(anchor, head)` contains the cursor `minHead`
 * while minimizing the size of the selection `makeSelection(anchor, head)`, and
 * ensuring the selection is still valid (i.e. it satisfies the Broad Head invariant; the head
 * is in the same group as the anchor, or the head is in an ancestor group of the anchor).
 */
export function makeLeastCommonAncestorSelection(
  anchor: Cursor,
  minHead: Cursor
): MqSelection {
  const lcaGroup = getLeastCommonAncestorGroup(anchor.group, minHead.group);
  if (lcaGroup.eq(minHead.group)) {
    return makeSelection(anchor, minHead)!;
  }
  const anchorPos = positionInAncestor(lcaGroup, anchor);
  const headPos = positionInAncestor(lcaGroup, minHead);
  const headIndex = getHeadIndex(anchorPos, headPos);
  return makeSelection(anchor, new Cursor(lcaGroup, headIndex))!;
}

/**
 * Assuming the anchor and tentative head are at `anchorPos` and `headPos` respectively
 * inside the same group, return the index of the cursor of where the head should be.
 */
function getHeadIndex(
  anchorPos: PositionInAncestor,
  headPos: PositionInAncestor
): number {
  if (headPos.type === 'cursor') {
    // (cursor, cursor) or (node, cursor) cases.
    return headPos.index;
  }
  // else, minHead is nested inside a node.
  // The final head cursor can end up either at index `headPos.index`, or `headPos.index + 1`,
  // depending on which side the anchor is
  if (anchorPos.index === headPos.index) {
    if (anchorPos.type === 'node') {
      // (node, same node) case: Both anchor and head are nested inside the same node.
      // They must be in different children of the node, otherwise the common ancestor would be smaller.
      // E.g. anchor in denominator and head in numerator, or anchor in subscript and head in superscript.
      // The selection will contain just this one node.
      //
      // Following old MQ, resolve the order based on LaTeX order, so dragging from denominator to numerator
      // puts the head before the fraction node, and dragging from numerator to denominator puts the head after
      // the fraction node.
      //
      // Note subscripts `a_{bottom}^{top}` have backwards latex order compared to fractions `\frac{top}{bottom}`.
      return anchorPos.groupIndex <= headPos.groupIndex
        ? headPos.index + 1
        : headPos.index;
    } else {
      // (cursor, node) special case
      // Anchor is a cursor and head is a node, and they have the same index,
      // e.g. you dragged from `a<!>\frac{bc}{de}f` into `a\frac{b<!>c}{de}f`.
      // This does _not_ include the reverse direction (dragging from `a\frac{bc}{de}<!>f`,
      // which has the anchor index being 1 larger than the head index.
      return headPos.index + 1;
    }
  } else if (anchorPos.index < headPos.index) {
    // Anchor (node or cursor) index is less than head (node) index, e.g.
    // you dragged from `a<!>b\frac{cd}{ef}` into `ab\frac{c<!>d}{ef}`. Put the
    // head after the node, like `a[!b\frac{cd}{ef}>`
    return headPos.index + 1;
  } else {
    // Anchor (node or cursor) index is greater than head (node) index, e.g.
    // you dragged from `ab\frac{cd}{ef}g<!>h` into `ab\frac{c<!>d}{ef}gh`. Put the
    // head before the node, like `ab<\frac{c<!>d}{ef}g!]h`
    return headPos.index;
  }
}

type PositionInAncestor =
  | {
      type: 'cursor';
      /** Refers to the cursor after node `index-1` and before node `index`. */
      index: number;
    }
  | {
      type: 'node';
      /** Refers to node `index`, i.e. between cursors `index` and `index+1` */
      index: number;
      /** The cursor is inside group `groupIndex` of that node. */
      groupIndex: number;
    };

function positionInAncestor(
  ancestorGroup: MqGroup,
  cursor: Cursor
): PositionInAncestor {
  if (cursor.group.eq(ancestorGroup)) {
    return { type: 'cursor', index: cursor.index };
  } else {
    const groupBeforeMin = cursor.group.ancestorAtDepth(
      ancestorGroup.depth() + 2
    ) as MqGroup;
    const minNode = groupBeforeMin.parent()!;
    return {
      type: 'node',
      index: minNode.getIndex(),
      groupIndex: groupBeforeMin.getIndex()!
    };
  }
}

function getLeastCommonAncestorGroup(groupA: MqGroup, groupB: MqGroup) {
  let lcaGroup = groupA;
  while (!lcaGroup.contains(groupB)) {
    const parent = lcaGroup.parent();
    if (!parent) {
      throw new Error(
        'Programming error: tried to take the common ancestor of two groups in different trees.'
      );
    }
    lcaGroup = parent.parent();
  }
  return lcaGroup;
}

/**
 * Return a struct of two elements:
 * - the new root node after replacing the given selection with zero or more inserted nodes.
 * - the selection highlighting just the inserted nodes in the new root.
 * Does not mutate any nodes.
 *
 * Passes stashed cursors through.
 */
export function spliceMqTree(
  deleteRange: MqSelection,
  insert: MqNode[]
): { root: MqGroup; insertedSelection: MqSelection } {
  const { root, insertedSelections } = spliceMqTreeSeveral(deleteRange, [
    insert
  ]);
  return { root, insertedSelection: insertedSelections[0] };
}

/** Passes stashed cursors through. */
export function spliceMqTreeSingle<N extends MqNode>(
  deleteRange: MqSelection,
  insert: N
): { root: MqGroup; inserted: N } {
  const { root, insertedSelection } = spliceMqTree(deleteRange, [insert]);
  const inserted = insertedSelection.left.nodeAfter();
  if (!inserted || inserted !== insert) {
    throw new Error('Programming error: node not inserted right');
  }
  return { root, inserted: inserted as N };
}

/** Returns `insertedSelections` with the same length as `inserts`.
 * Passes stashed cursors through. */
export function spliceMqTreeSeveral(
  deleteRange: MqSelection,
  /** Assumes `inserts` has only a few entries (to avoid spread stack overflow) */
  inserts: MqNode[][]
): { root: MqGroup; insertedSelections: MqSelection[] } {
  const { left, right } = deleteRange;
  const leftIndex = left.index;
  const rightIndex = right.index;
  // Note left.group === right.group
  const group = left.group;
  const children = group.children;
  const newChildren = children
    .slice(0, leftIndex)
    .concat(...inserts, children.slice(rightIndex));

  const newGroup = makeGroup(newChildren);
  group.replacedWith(newGroup);
  copyCursorIndices(group, newGroup, (index) => {
    if (index <= leftIndex) {
      return index;
    } else if (index >= rightIndex) {
      return index - rightIndex + leftIndex + inserts.length;
    } else {
      // Cursor is in the deleted range. Just put it after the inserted range.
      return leftIndex + inserts.length;
    }
  });
  const insertedSelections = [];
  let i = leftIndex;
  for (const insert of inserts) {
    insertedSelections.push(
      makeSameParentSelection(newGroup, i, i + insert.length)
    );
    i += insert.length;
  }
  return {
    root: newGroup.getRoot(),
    insertedSelections
  };
}
export function unwrapBracket(node: MqBrackets): {
  root: MqGroup;
  insertedSelection: MqSelection;
} {
  return spliceMqTree(node.containingSelection(), node.middle.children);
}

export function sliceMqTree(range: MqSelection): MqNode[] {
  const { left, right } = range;
  const leftIndex = left.index;
  const rightIndex = right.index;
  // Note left.group === right.group
  const group = left.group;
  return group.children.slice(leftIndex, rightIndex);
}

/**
 * Return first node in selection satisfying p. Includes children of nodes in selection.
 */
function findInSelection(
  range: MqSelection,
  p: (node: MqNode) => boolean
): MqNode | undefined {
  const children = range.left.group.children;
  for (let i = range.left.index; i < range.right.index; i++) {
    const found = children[i].find(p);
    if (found) return found;
  }
  return undefined;
}

export function removeGhostsFromSelection(model: MqModel) {
  while (true) {
    const bracket = findInSelection(
      model.selection,
      (x) => x.type === 'brackets' && !!x.ghostSide
    );
    if (bracket?.type !== 'brackets') break;

    model = model.withSplicedMqTree(bracket.containingSelection(), () => [
      mqBracketWithGhostSide(bracket, undefined)
    ]);
  }
  return model;
}
