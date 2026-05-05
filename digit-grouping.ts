import type { MQRenderContext } from './mathquill-renderer';
import type { MqNode } from './mq-nodes';

function isDigitGroupingChar(node: MqNode | undefined) {
  return node?.type === 'char' && /^(\\ )|[0-9.]$/.test(node.latex);
}

function isSpace(node: MqNode | undefined) {
  return node?.type === 'char' && node.latex === '\\ ';
}

function isDot(node: MqNode | undefined) {
  return node?.type === 'char' && node.latex === '.';
}

export function computeDigitGroupingClasses(
  ctx: MQRenderContext,
  children: MqNode[]
) {
  // TODO-mq-rewrite-perf -- I think we could optimize / simplify this algorithm. I think one reason it's easier to
  // simplify is that we aren't trying to do incremental updates to a tree. We always start with a fresh render
  // without needing to figure out how to remove old digit separators in case of an edit.
  // Ref. `computeEllipsisMarks`
  //
  // work from right to left collecting a contiguous region of DigitGroupingChars
  let groupRight: number | undefined;
  for (let i = children.length - 1; i >= 0; i--) {
    if (isDigitGroupingChar(children[i])) {
      if (!groupRight) {
        groupRight = i;
      }
    } else if (groupRight !== undefined) {
      // we found the contiguous group
      computeDigitGroupingInRegion(ctx, children, i + 1, groupRight);
      groupRight = undefined;
    }
  }

  if (groupRight !== undefined) {
    computeDigitGroupingInRegion(ctx, children, 0, groupRight);
  }
}

function computeDigitGroupingInRegion(
  ctx: MQRenderContext,
  children: MqNode[],
  left: number,
  right: number
) {
  // trim off leading spaces
  while (isSpace(children[left])) {
    left += 1;
  }

  // trim off trailing spaces
  while (isSpace(children[right])) {
    right -= 1;
  }

  // it was only spaces
  if (left > right) return;

  let spacesFound = 0;
  let dotStreak = 0;
  const dots = [];

  // traverse right as far as possible (starting to right of this char)
  for (let i = left; i <= right; i++) {
    const char = children[i];
    if (isSpace(char)) {
      spacesFound += 1;
      dotStreak = 0;
    } else if (isDot(char)) {
      dots.push(i);
      dotStreak += 1;
    } else {
      dotStreak = 0;
    }

    if (dotStreak === 3) {
      break;
    }
  }

  // Exited the loop for one of two reasons:
  // 1. `dotStreak == 3`. In this case, trim off the three trailing dots,
  // and continue again from the character after the ellipsis.
  if (dotStreak === 3) {
    const rightDot = dots.pop()!;
    dots.pop();
    const leftDot = dots.pop()!;

    // TODO-mq-rewrite-perf -- I updated this algorithm to recurse on the left side. That's slightly
    // less efficient but I think if we care about efficiency there's a good chance we can make
    // this entire algorithm more efficient.
    computeDigitGroupingInRegion(ctx, children, left, leftDot - 1);
    computeDigitGroupingInRegion(ctx, children, rightDot + 1, right);
    return;
  }

  const disableFormatting = spacesFound > 0 || dots.length > 1;
  if (!disableFormatting) {
    if (dots.length) {
      if (dots[0] !== left) {
        addGroupingBetween(ctx, children, left, dots[0] - 1);
      }
    } else {
      addGroupingBetween(ctx, children, left, right);
    }
  }
}

function addGroupingBetween(
  ctx: MQRenderContext,
  children: MqNode[],
  left: number,
  right: number
) {
  let count = 0;
  let totalDigits = 0;

  for (let i = right; i >= left; i--) {
    totalDigits += 1;
  }

  let numDigitsInFirstGroup = totalDigits % 3;
  if (numDigitsInFirstGroup === 0) numDigitsInFirstGroup = 3;

  for (let i = right; i >= left; i--) {
    count += 1;
    let cls: string | undefined;

    if (totalDigits >= 4) {
      if (count === totalDigits) {
        if (numDigitsInFirstGroup === 1) {
          cls = 'dcg-mq-group-leading-1';
        } else if (numDigitsInFirstGroup === 2) {
          cls = 'dcg-mq-group-leading-2';
        } else {
          cls = 'dcg-mq-group-leading-3';
        }
      } else if (count % 3 === 0) {
        if (count !== totalDigits) {
          cls = 'dcg-mq-group-start';
        }
      }

      if (!cls) {
        cls = 'dcg-mq-group-other';
      }
    }

    ctx.digitGroupingMap.set(children[i], cls);
  }
}
