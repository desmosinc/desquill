import { Cursor, type LeftOrRight } from './cursor';
import { computeEllipsisMarks, type MarkSet } from './mq-marks';
import { printLatex } from './print-latex';
import { makeSameParentSelection } from './selection';
import { copyCursorIndices, type StashedCursorKey } from './stash-cursors';
import type { StyleCmdVal } from './style-commands';

abstract class MqNodeBase {
  // Prevent assignment from a plain object.
  public _isMqNodeBase: true;
  private _parent: MqGroup | MqInteriorNode | undefined;
  private _index: number = -1;

  constructor(children: MqNode[]) {
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      child._parent = this as any as MqGroup | MqInteriorNode;
      child._index = i;
    }
  }
  // Invariant: parent of a group is a non-group and vice-versa.
  // Also the root is a group, so non-groups always have parents.
  parent(this: MqNonGroup): MqGroup;
  parent(this: MqGroup): MqInteriorNode | undefined;
  parent(this: MqNode): MqGroup | MqInteriorNode | undefined;
  parent(): MqGroup | MqInteriorNode | undefined {
    return this._parent;
  }

  /** Returns -1 for the root and disconnected nodes. */
  getIndex(): number {
    return this._index;
  }

  updateParent(parent: MqGroup | MqInteriorNode, index: number) {
    this._parent = parent;
    this._index = index;
  }

  getRoot(this: MqNode): MqGroup {
    let node: MqNode = this;
    while (node.parent()) node = node.parent()!;
    if (node.type !== 'group')
      throw new Error('Invariant failed: root is not group');
    return node;
  }

  eq(this: MqNode, other: MqNode): boolean {
    // Note this comparison assumes that nodes in different parts of the tree always compare inequal.
    // If we started re-using nodes, this would have to change.
    return this === other;
  }

  printLatex(this: MqNode) {
    return printLatex(this);
  }

  private siblingInDirection(this: MqNode, offset: 1 | -1): MqNode | undefined {
    const newIndex = offset + this.getIndex();
    const parentNode = this.parent();
    if (!parentNode) return undefined;
    if (newIndex < 0 || newIndex >= numChildren(parentNode)) {
      return undefined;
    }
    return nthChild(parentNode, newIndex);
  }

  numChildren(this: MqNode) {
    return numChildren(this);
  }

  nextSiblingInDir(this: MqNonGroup, dir: LeftOrRight): MqNonGroup | undefined;
  nextSiblingInDir(this: MqGroup, dir: LeftOrRight): MqGroup | undefined;
  nextSiblingInDir(this: MqNode, dir: LeftOrRight): MqNode | undefined;
  nextSiblingInDir(this: MqNode, dir: LeftOrRight): MqNode | undefined {
    return dir === 'right' ? this.nextSibling() : this.prevSibling();
  }

  nextSibling(this: MqNonGroup): MqNonGroup | undefined;
  nextSibling(this: MqGroup): MqGroup | undefined;
  nextSibling(this: MqNode): MqNode | undefined;
  nextSibling(this: MqNode): MqNode | undefined {
    return this.siblingInDirection(+1);
  }

  prevSibling(this: MqNonGroup): MqNonGroup | undefined;
  prevSibling(this: MqGroup): MqGroup | undefined;
  prevSibling(this: MqNode): MqNode | undefined;
  prevSibling(this: MqNode): MqNode | undefined {
    return this.siblingInDirection(-1);
  }

  // Invariant: child of a group is a non-group and vice-versa.
  nthChild(this: MqInteriorNode, n: number): MqGroup | undefined;
  nthChild(this: MqLeafNode, n: number): undefined;
  nthChild(this: MqNonGroup, n: number): MqGroup | undefined;
  nthChild(this: MqGroup, n: number): MqNonGroup | undefined;
  nthChild(this: MqNode, n: number): MqNode | undefined;
  nthChild(this: MqNode, n: number): MqNode | undefined {
    const count = numChildren(this);
    if (n < 0 || n >= count) return undefined;
    const child = nthChild(this, n);
    return child;
  }

  firstChild(this: MqGroup): MqNonGroup | undefined;
  firstChild(this: MqNonGroup): MqGroup | undefined;
  firstChild(this: MqNode): MqNode | undefined;
  firstChild(this: MqNode): MqNode | undefined {
    return this.nthChild(0);
  }

  lastChild(this: MqGroup): MqNonGroup | undefined;
  lastChild(this: MqNonGroup): MqGroup | undefined;
  lastChild(this: MqNode): MqNode | undefined;
  lastChild(this: MqNode): MqNode | undefined {
    const count = numChildren(this);
    return this.nthChild(count - 1);
  }

  /** This matches Legacy MQ's `el.getEnd()` */
  lastChildInDir(this: MqGroup, dir: LeftOrRight): MqNonGroup | undefined;
  // Assumption: interior nodes always have at least one child.
  lastChildInDir(this: MqInteriorNode, dir: LeftOrRight): MqGroup;
  lastChildInDir(
    this: MqGroup | MqInteriorNode,
    dir: LeftOrRight
  ): MqNode | undefined;
  lastChildInDir(
    this: MqGroup | MqInteriorNode,
    dir: LeftOrRight
  ): MqNode | undefined {
    return dir === 'left' ? this.firstChild() : this.lastChild();
  }

  firstCursor(this: MqGroup) {
    return new Cursor(this, 0);
  }

  lastCursor(this: MqGroup) {
    return new Cursor(this, numChildren(this));
  }

  lastCursorInDir(this: MqGroup, dir: LeftOrRight) {
    return dir === 'left' ? this.firstCursor() : this.lastCursor();
  }

  cursorOnSide(this: MqNonGroup, dir: LeftOrRight) {
    if (dir === 'left') {
      return new Cursor(this.parent(), this.getIndex());
    } else {
      return new Cursor(this.parent(), this.getIndex() + 1);
    }
  }

  /** All parents, including itself, in decreasing order of depth,
   * ending with the root node. */
  allParents(this: MqNode): MqNode[] {
    const out = [];
    for (
      let node: MqNode | undefined = this;
      node !== undefined;
      node = node.parent()
    ) {
      out.push(node);
    }
    return out;
  }

  /** Depth is measured as number of edges to the root, so the root has depth 0. */
  depth(this: MqNode): number {
    let i = 0;
    let node = this;
    while (node.parent()) {
      node = node.parent()!;
      i += 1;
    }
    return i;
  }

  ancestorAtDepth(this: MqNode, depth: number): MqNode {
    let node: MqNode = this;
    let nodeDepth = this.depth();
    if (depth < 0 || depth > nodeDepth) {
      throw new Error(`Invalid depth ${depth} for node of depth ${nodeDepth}`);
    }
    while (nodeDepth > depth) {
      node = node.parent()!;
      nodeDepth -= 1;
    }
    return node;
  }

  /** True if `this` equals `other` or `this` contains `other`,
   * i.e. `this` is bigger (closer to the root) */
  contains(this: MqNode, other: MqNode): boolean {
    return (
      this.depth() <= other.depth() &&
      this.eq(other.ancestorAtDepth(this.depth()))
    );
  }

  /**
   * Return the smallest group containing `node`.
   * Always returns either `this` (if `this` is already a group), or `this.parent()` (otherwise).
   */
  smallestAncestorGroup(this: MqNode): MqGroup {
    if (this.type === 'group') {
      return this;
    }
    const parent = this.parent();
    if (parent === undefined) {
      throw new Error('Programming Error: Non-group as root of the tree.');
    }
    if (parent.type === 'group') return parent as MqGroup;
    throw new Error('Programming error: non-group containing non-group.');
  }

  /**
   * Return a new node where this node is replaced with a new node, up to the root.
   * Does not mutate any nodes, besides parent/index pointers.
   */
  replacedWith(this: MqGroup, node: MqGroup): MqGroup;
  replacedWith<N extends MqNonGroup>(this: MqNonGroup, node: N): N;
  replacedWith(this: MqNode, node: MqNode): MqNode {
    return replacedWith(this, node);
  }

  containingSelection(this: MqNonGroup) {
    const parent = this.parent();
    const index = this.getIndex();
    return makeSameParentSelection(parent, index, index + 1);
  }

  getDomNode(this: MqNode): HTMLElement | undefined {
    if (this.type === 'group') {
      return this.mutable_domNode;
    } else {
      const groupNode = this.parent();
      return groupNode.mutable_domChildren?.[this.getIndex()];
    }
  }

  /**
   * If this was rendered since the last edit, and it is not hidden by `display: none` or
   * begin disconnected from the tree, then return the result of getBoundingClientRect.
   * Otherwise return undefined.
   */
  boundingClientRect(this: MqNode): DOMRect | undefined {
    const domNode = this.getDomNode();
    if (!domNode) return undefined;

    // Return undefined for disconnected and hidden (display: none) elements
    if (domNode.getClientRects().length === 0) {
      return undefined;
    }
    return domNode.getBoundingClientRect();
  }

  /**
   * Return first node in tree satisfying p
   */
  find(this: MqNode, p: (node: MqNode) => boolean): MqNode | undefined {
    if (p(this)) return this;
    for (let i = 0; i < this.numChildren(); i++) {
      const found = this.nthChild(i)?.find(p);
      if (found) return found;
    }
    return undefined;
  }
}
abstract class MqNonGroupBase extends MqNodeBase {}

/** Passes stashed cursors through. */
function replacedWith(before: MqNode, after: MqNode): MqNode {
  if ((after.type === 'group') !== (before.type === 'group')) {
    throw new Error('Cannot replace group with non-group or vice-versa.');
  }
  const parent = before.parent();
  if (parent === undefined) {
    // Base case: replaced the root, so we're done.
    return after;
  } else {
    // Recursive case: recursively replace the parent, then extend.
    // Index is non-undefined because `this` is not the root.
    const index = before.getIndex()!;
    const newParent = withNthChildReplaced(parent, index, after);
    const parentReplaced = replacedWith(parent, newParent);
    const newThis = parentReplaced.nthChild(index);
    if (!newThis || newThis.type !== after.type) {
      throw new Error(
        'Programming error: withNthChildReplaced did not preserve child count.'
      );
    }
    return newThis;
  }
}

export type HTMLTag = 'span' | 'var';
export class MqChar extends MqNonGroupBase {
  public readonly type = 'char';
  public readonly latex: string;

  constructor(latex: string) {
    super([]);
    this.latex = latex;
  }
}

export class MqGroup extends MqNodeBase {
  public readonly type = 'group';
  public readonly children: MqNode[];
  public readonly marks: GroupMarks;
  /**
   * Map from a key to an index corresponding to a `Cursor` index.
   */
  public mutable_cursorIndices: Map<StashedCursorKey, number> | undefined;
  /**
   * The group that has the relevant 'upDown' cursor index when going up/down into this group.
   * It's always a descendent of this group, so this pointer is valid as long as this group is valid.
   */
  public mutable_upDownGroup: MqGroup | undefined;
  /**
   * The nodes corresponding to each child.
   * If there has been a render since the last update, this is a list of the same length as `.children`.
   * Otherwise, it's `undefined`.
   *
   * Note this is not necessarily the same as the list of all DOM children of the DOM node corresponding to the
   * group. In particular, `\overleftrightarrow{abc}` has extra DOM nodes before and after the children,
   * to render the arrows themselves.
   */
  public mutable_domChildren: HTMLElement[] | undefined;
  /**
   * If there has been a render since the last update, then give the element this node
   * corresponded to in that render. Otherwise, it's `undefined`.
   */
  public mutable_domNode: HTMLElement | undefined;

  constructor(children: MqNode[]) {
    children = ensureGhostsOnlyAtOneEnd(children);
    super(children);
    const ellipsis = computeEllipsisMarks(children);
    this.marks = {
      mutable_operatorName: [],
      mutable_infixOperatorName: [],
      mutable_prefixOperatorName: [],
      ellipsis
    };
    this.children = children;
  }
}

export function makeGroup(children: MqNode[]) {
  return new MqGroup(children);
}

export function clearDerivedStateOnGroup(group: MqGroup) {
  group.mutable_domChildren = undefined;
  group.mutable_domNode = undefined;
  group.marks.mutable_infixOperatorName = [];
  group.marks.mutable_prefixOperatorName = [];
  group.marks.mutable_operatorName = [];
}

export interface GroupMarks {
  mutable_operatorName: MarkSet;
  mutable_infixOperatorName: MarkSet;
  mutable_prefixOperatorName: MarkSet;
  ellipsis: MarkSet;
}

/** Concatenate groups, passing stashed cursors through. */
export function concatGroups(groupA: MqGroup, groupB: MqGroup): MqGroup {
  const group = makeGroup(groupA.children.concat(groupB.children));
  copyCursorIndices(groupA, group, (index) => index);
  copyCursorIndices(groupB, group, (index) => index + groupA.children.length);
  return group;
}

/**
 * If some child is a 'brackets' node that has a ghost bracket somewhere other than the
 * start/end of the entire group, then un-ghost that bracket.
 */
function ensureGhostsOnlyAtOneEnd(children: MqNode[]): MqNode[] {
  let newChildren: MqNode[] | undefined = undefined;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type !== 'brackets') continue;
    if (
      (child.ghostSide === 'left' && i > 0) ||
      (child.ghostSide === 'right' && i < children.length - 1)
    ) {
      newChildren ||= Array.from(children);
      newChildren[i] = mqBracketWithGhostSide(child, undefined);
    }
  }
  return newChildren ?? children;
}

export class MqSqrt extends MqNonGroupBase {
  public readonly type = 'sqrt';
  public readonly radicand: MqGroup;
  public readonly index: MqGroup | undefined;

  constructor({
    radicand,
    index
  }: {
    radicand: MqGroup;
    index: MqGroup | undefined;
  }) {
    const children = [];
    if (index) children.push(index);
    children.push(radicand);
    super(children);
    this.radicand = radicand;
    this.index = index;
  }
}

export class MqSupSub extends MqNonGroupBase {
  public readonly type = 'supsub';
  public readonly sub: MqGroup | undefined;
  public readonly sup: MqGroup | undefined;

  constructor({
    sub,
    sup
  }: {
    sub: MqGroup | undefined;
    sup: MqGroup | undefined;
  }) {
    const children = [];
    if (sub) children.push(sub);
    if (sup) children.push(sup);
    super(children);
    this.sup = sup;
    this.sub = sub;
  }
}

export class MqFrac extends MqNonGroupBase {
  public readonly type = 'frac';
  public readonly num: MqGroup;
  public readonly den: MqGroup;
  /** Depth including the fraction itself, so this is always at least one. */
  public mutable_fracDepth?: number;

  constructor({ num, den }: { num: MqGroup; den: MqGroup }) {
    super([num, den]);
    this.num = num;
    this.den = den;
  }
}

export class MqBinom extends MqNonGroupBase {
  public readonly type = 'binom';
  public readonly num: MqGroup;
  public readonly den: MqGroup;

  constructor({ num, den }: { num: MqGroup; den: MqGroup }) {
    super([num, den]);
    this.num = num;
    this.den = den;
  }
}

export class MqAns extends MqNonGroupBase {
  public readonly type = 'ans';

  constructor() {
    super([]);
  }
}

export class MqToken extends MqNonGroupBase {
  public readonly type = 'token';
  public readonly variant: 'token' | 'tokenName';
  public readonly id: string;

  constructor({ variant, id }: { variant: 'token' | 'tokenName'; id: string }) {
    super([]);
    this.variant = variant;
    this.id = id;
  }
}

export class MqSummation extends MqNonGroupBase {
  public readonly type = 'summation';
  public readonly kind: '\\int' | '\\sum' | '\\prod' | '\\coprod';
  public readonly sub: MqGroup;
  public readonly sup: MqGroup;

  constructor({
    kind,
    sub,
    sup
  }: {
    kind: '\\int' | '\\sum' | '\\prod' | '\\coprod';
    sub: MqGroup;
    sup: MqGroup;
  }) {
    const children = [];
    if (sub) children.push(sub);
    if (sup) children.push(sup);
    super(children);
    this.kind = kind;
    this.sub = sub;
    this.sup = sup;
  }
}

export class MqBrackets extends MqNonGroupBase {
  public readonly type = 'brackets';
  public readonly leftSymbol: string;
  public readonly rightSymbol: string;
  public readonly leftLatex: string;
  public readonly rightLatex: string;
  // TODO-mq-rewrite-cleanup: ghostSide is not readonly.
  public ghostSide: LeftOrRight | undefined;
  public readonly middle: MqGroup;

  constructor({
    leftSymbol,
    rightSymbol,
    leftLatex,
    rightLatex,
    ghostSide,
    middle
  }: {
    leftSymbol: string;
    rightSymbol: string;
    leftLatex: string;
    rightLatex: string;
    ghostSide: LeftOrRight | undefined;
    middle: MqGroup;
  }) {
    super([middle]);
    this.leftSymbol = leftSymbol;
    this.rightSymbol = rightSymbol;
    this.leftLatex = leftLatex;
    this.rightLatex = rightLatex;
    this.ghostSide = ghostSide;
    this.middle = middle;
  }
}

export function mqBracketWithGhostSide(
  brackets: MqBrackets,
  ghostSide: LeftOrRight | undefined
): MqBrackets {
  return new MqBrackets({
    leftSymbol: brackets.leftSymbol,
    rightSymbol: brackets.rightSymbol,
    leftLatex: brackets.leftLatex,
    rightLatex: brackets.rightLatex,
    ghostSide,
    middle: brackets.middle
  });
}

export function mqBracketWithMiddle(
  brackets: MqBrackets,
  middle: MqGroup
): MqBrackets {
  return new MqBrackets({
    leftSymbol: brackets.leftSymbol,
    rightSymbol: brackets.rightSymbol,
    leftLatex: brackets.leftLatex,
    rightLatex: brackets.rightLatex,
    ghostSide: brackets.ghostSide,
    middle: middle
  });
}

export function mqBracketWithSymbol(
  brackets: MqBrackets,
  side: LeftOrRight,
  symbol: string,
  latex: string
): MqBrackets {
  return new MqBrackets({
    leftSymbol: side === 'left' ? symbol : brackets.leftSymbol,
    rightSymbol: side === 'right' ? symbol : brackets.rightSymbol,
    leftLatex: side === 'left' ? latex : brackets.leftLatex,
    rightLatex: side === 'right' ? latex : brackets.rightLatex,
    ghostSide: undefined,
    middle: brackets.middle
  });
}

export function mqBracketSymbol(brackets: MqBrackets, side: LeftOrRight) {
  return side === 'left' ? brackets.leftSymbol : brackets.rightSymbol;
}

export function mqBracketLatex(brackets: MqBrackets, side: LeftOrRight) {
  return side === 'left' ? brackets.leftLatex : brackets.rightLatex;
}

export class MqPercentOf extends MqNonGroupBase {
  public readonly type = 'percentof';

  constructor() {
    super([]);
  }
}

export class MqStyleCmd extends MqNonGroupBase {
  public readonly type = 'style-cmd';
  public readonly val: StyleCmdVal;
  /**
   * Color for \textcolor, undefined otherwise.
   * `styleParam` is the raw un-parsed string which is the first argument.
   */
  public readonly styleParam: string | undefined;
  public readonly arg: MqGroup;

  constructor({
    val,
    styleParam,
    arg
  }: {
    val: StyleCmdVal;
    styleParam?: string;
    arg: MqGroup;
  }) {
    super([arg]);
    this.val = val;
    this.styleParam = styleParam;
    this.arg = arg;
  }
}

/**
 * Properties about `MQNode`s:
 * - If `node` is an `MQGroup`, then its children are not `MQGroup`s.
 *   (The exception is a selection, which is only temporary when emitting;
 *    a child could be an `MQGroup` with `isSelection = true`.)
 * - If `node` is not an `MQGroup`, then its children are `MQGroup`s.
 */
export type MqNode = MqGroup | MqNonGroup;

export type MqNonGroup = MqInteriorNode | MqLeafNode;

export type MqNonLeaf = MqInteriorNode | MqGroup;

/** A non-group node that can have children. We assume they each have at least one child group, which may be empty. */
export type MqInteriorNode =
  | MqFrac
  | MqBinom
  | MqSqrt
  | MqSupSub
  | MqSummation
  | MqBrackets
  | MqStyleCmd;

/** A node with no children. */
export type MqLeafNode = MqChar | MqPercentOf | MqAns | MqToken;

export function numChildren(node: MqNode) {
  switch (node.type) {
    case 'char':
    case 'percentof':
    case 'ans':
    case 'token':
      return 0;
    case 'brackets':
      return 1;
    case 'sqrt':
      return node.index ? 2 : 1;
    case 'frac':
    case 'binom':
      return 2;
    case 'supsub':
    case 'summation':
      return (node.sub ? 1 : 0) + (node.sup ? 1 : 0);
    case 'group':
      return node.children.length;
    case 'style-cmd':
      return 1;
    default:
      node satisfies never;
      throw new Error(`Invalid node: ${(node as any).type}`);
  }
}

export function isLeaf(node: MqNode): node is MqLeafNode {
  return numChildren(node) === 0;
}

export function nthChild(node: MqNode, n: number) {
  const child = _nthChild(node, n);
  if ((child.type === 'group') === (node.type === 'group')) {
    throw new Error(
      'Cannot put a group inside a group or non-group inside a non-group.'
    );
  }
  return child;
}

function allChildren(node: MqNode): MqNode[] {
  if (node.type === 'group') return node.children;
  const out: MqNode[] = [];
  for (let i = 0; i < node.numChildren(); i++) out.push(nthChild(node, i));
  return out;
}

/**
 * Calculate the maximum depth of nested groups in the tree.
 *
 * Depth is counted as the number of nested group nodes. Interior nodes and leaf nodes do not count.
 * Old mq only counted MathBlock's.
 *
 * Note: calculateTreeDepth, used to compare against config.maxDepth, is a different count than the MqNode.depth method
 */
export function calculateTreeDepth(node: MqNode): number {
  let maxChildDepth = 0;
  for (const child of allChildren(node)) {
    const depth = calculateTreeDepth(child);
    if (depth > maxChildDepth) maxChildDepth = depth;
  }
  return (node.type === 'group' ? 1 : 0) + maxChildDepth;
}

export function isMqSymbol(node: MqNode) {
  switch (node.type) {
    case 'char':
    case 'percentof':
    case 'ans':
    case 'token':
      return true;
    case 'group':
    case 'frac':
    case 'binom':
    case 'sqrt':
    case 'supsub':
    case 'summation':
    case 'brackets':
    case 'style-cmd':
      return false;
    default:
      node satisfies never;
      throw new Error(`Invalid node: ${(node as any).type}`);
  }
}

/** Must be in the order of latex. */
function _nthChild(node: MqNode, n: number) {
  switch (node.type) {
    case 'char':
    case 'percentof':
    case 'ans':
    case 'token':
      break;
    case 'brackets':
      if (n == 0) return node.middle;
      break;
    case 'sqrt':
      if (node.index) {
        if (n == 0) return node.index;
        if (n == 1) return node.radicand;
      } else {
        if (n == 0) return node.radicand;
      }
      break;
    case 'binom':
    case 'frac':
      if (n == 0) return node.num;
      if (n == 1) return node.den;
      break;
    case 'supsub':
    case 'summation':
      if (node.sub && node.sup) {
        if (n == 0) return node.sub;
        if (n == 1) return node.sup;
      } else if (node.sub) {
        if (n == 0) return node.sub;
      } else if (node.sup) {
        if (n == 0) return node.sup;
      } else {
        throw new Error('SupSub or Summation missing sup or sub.');
      }
      break;
    case 'group':
      if (0 <= n && n < node.children.length) return node.children[n];
      break;
    case 'style-cmd':
      if (n == 0) return node.arg;
      break;
    default:
      node satisfies never;
      throw new Error(`Invalid node: ${(node as any).type}`);
  }
  throw new Error(`Child not present with index ${n}.`);
}

export function sqrtPropName(node: MqSqrt, n: number): 'index' | 'radicand' {
  if (node.index) {
    if (n == 0) return 'index';
    if (n == 1) return 'radicand';
  } else {
    if (n == 0) return 'radicand';
  }
  throw new Error(`Child not present with index ${n}.`);
}

export function supsubPropName(
  node: MqSupSub | MqSummation,
  n: number
): 'sup' | 'sub' {
  if (node.sub && node.sup) {
    if (n == 0) return 'sub';
    if (n == 1) return 'sup';
  } else if (node.sub) {
    if (n == 0) return 'sub';
  } else if (node.sup) {
    if (n == 0) return 'sup';
  } else {
    throw new Error('SupSub or Summation missing sup or sub.');
  }
  throw new Error(`Child not present with index ${n}.`);
}

export function fracOrBinomPropName(
  _node: MqFrac | MqBinom,
  n: number
): 'num' | 'den' {
  if (n == 0) return 'num';
  if (n == 1) return 'den';
  throw new Error(`Child not present with index ${n}.`);
}

export function propNameOfNthChild(node: MqNonGroup, n: number): string {
  switch (node.type) {
    case 'char':
    case 'percentof':
    case 'ans':
    case 'token':
      break;
    case 'brackets':
      if (n == 0) return 'middle';
      break;
    case 'sqrt':
      return sqrtPropName(node, n);
    case 'binom':
    case 'frac':
      return fracOrBinomPropName(node, n);
    case 'supsub':
    case 'summation':
      return supsubPropName(node, n);
    case 'style-cmd':
      if (n == 0) return 'arg';
      break;
    default:
      node satisfies never;
      throw new Error(`Invalid node: ${(node as any).type}`);
  }
  throw new Error(`Child not present with index ${n}.`);
}

/** Passes stashed cursors through. */
export function withNthChildReplaced(
  node: MqNode,
  n: number,
  child: MqNode
): MqNode {
  if (node.type === 'group') {
    const newChildren = node.children
      .slice(0, n)
      .concat([child], node.children.slice(n + 1));
    const group = makeGroup(newChildren);
    group.mutable_cursorIndices = node.mutable_cursorIndices;
    return group;
  }
  if (child.type !== 'group') {
    throw new Error(
      'Invariant violation: A non-group should not have a group as child.'
    );
  }

  switch (node.type) {
    case 'char':
    case 'percentof':
    case 'ans':
    case 'token':
      throw new Error('Programming Error: leaves have no children.');
  }

  const prop = propNameOfNthChild(node, n);
  switch (node.type) {
    case 'frac':
      return new MqFrac({ ...node, [prop]: child });
    case 'binom':
      return new MqBinom({ ...node, [prop]: child });
    case 'sqrt':
      return new MqSqrt({ ...node, [prop]: child });
    case 'supsub':
      return new MqSupSub({ ...node, [prop]: child });
    case 'summation':
      return new MqSummation({ ...node, [prop]: child });
    case 'brackets':
      return new MqBrackets({ ...node, [prop]: child });
    case 'style-cmd':
      return new MqStyleCmd({ ...node, [prop]: child });
  }
}

export function nodeCount(node: MqNode) {
  let totalChildCount = 0;
  const n = numChildren(node);
  for (let i = 0; i < n; i++) {
    const child = nthChild(node, i);
    totalChildCount += nodeCount(child);
  }
  return 1 + totalChildCount;
}
