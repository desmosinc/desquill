import type {
  AutoOperatorNames,
  MqMutableMarksConfig,
  TrieNode
} from './mq-config';
import type { MqGroup, MqNode } from './mq-nodes';

/**
 * The indices range from 0 to children.length.
 * They are indices to the gaps before/after the nodes, so
 * left=0, right=1 contains the first node, and
 * left=1, right=1 is the collapsed point after the first node.
 *
 * Every range should have `left <= right`.
 */
export interface MarkRange {
  left: number;
  right: number;
  word: string;
}

export function markContainsNode(mark: MarkRange, nodeIndex: number) {
  return mark.left <= nodeIndex && nodeIndex < mark.right;
}

/**
 * Ranges do not overlap, but they may touch (rangeA.right === rangeB.left),
 * as long as they are not empty.
 */
export type MarkSet = MarkRange[];

export function findMarkContainingNode(
  markSet: MarkSet,
  nodeIndex: number
): MarkRange | undefined {
  // Binary search since marks are non-overlapping and sorted by left position
  let left = 0;
  let right = markSet.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const mark = markSet[mid];

    if (markContainsNode(mark, nodeIndex)) {
      return mark;
    } else if (nodeIndex < mark.left) {
      // Search left half
      right = mid - 1;
    } else {
      // nodeIndex >= mark.right, search right half
      left = mid + 1;
    }
  }

  return undefined;
}

export function doesMarkSetContainNode(markSet: MarkSet, nodeIndex: number) {
  return !!findMarkContainingNode(markSet, nodeIndex);
}

export function doesMarkEndAtNode(markSet: MarkSet, nodeIndex: number) {
  return findMarkContainingNode(markSet, nodeIndex)?.right === nodeIndex + 1;
}

export function doesMarkStartAtNode(markSet: MarkSet, nodeIndex: number) {
  return findMarkContainingNode(markSet, nodeIndex)?.left === nodeIndex;
}

/**
 * Return the longest operator name starting at the `startIndex`'th node of `children`,
 * or `undefined` if none exist.
 */
function scanForEntireOperatorName(
  children: MqNode[],
  startIndex: number,
  autoOperatorNames: AutoOperatorNames
): string | undefined {
  let longestWord: string | undefined = undefined;

  let trieNode: TrieNode | undefined = autoOperatorNames.getTrieRoot();
  for (let i = startIndex; trieNode && i < children.length; i++) {
    const child = children[i];
    if (child.type !== 'char') break;
    trieNode = trieNode.followPath(child.latex);

    if (trieNode?.endWord) {
      longestWord = trieNode.endWord;
    }
  }

  return longestWord;
}

export function updateOperatorNameMarks(
  group: MqGroup,
  config: MqMutableMarksConfig,
  disableMarks: boolean
) {
  const { children, marks } = group;

  marks.mutable_operatorName = [];
  marks.mutable_infixOperatorName = [];
  marks.mutable_prefixOperatorName = [];
  if (disableMarks) return;

  for (let i = 0; i < children.length; i++) {
    const word = scanForEntireOperatorName(
      children,
      i,
      config.autoOperatorNames
    );
    if (word) {
      const mark = { left: i, right: i + word.length, word };
      marks.mutable_operatorName.push(mark);

      if (config.infixOperatorNames.has(word)) {
        marks.mutable_infixOperatorName.push(mark);
      } else if (config.prefixOperatorNames.has(word)) {
        marks.mutable_prefixOperatorName.push(mark);
      }

      i += word.length - 1;
    }
  }
  return marks;
}

export function computeEllipsisMarks(children: MqNode[]): MarkSet {
  const marks: MarkSet = [];
  let consecutiveDots = 0;
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.type === 'char' && node.latex === '.') {
      consecutiveDots += 1;
    } else {
      consecutiveDots = 0;
    }
    if (consecutiveDots === 3) {
      marks.push({ left: i - 2, right: i + 1, word: '...' });
      consecutiveDots = 0;
    }
  }
  return marks;
}
