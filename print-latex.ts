import { type Cursor } from './cursor';
import { BuiltInOpNames } from './mq-config';
import { doesMarkEndAtNode, doesMarkStartAtNode } from './mq-marks';
import { type MqGroup, type MqNode } from './mq-nodes';
import { allCursorsInOrder } from './node-traversal-order';

type PrintLatexOpts = {
  emitCursorAtEveryPosition?: boolean;
  emitCursor?: {
    group: MqGroup;
    index: number;
  };
};

export function printLatex(node: MqNode, opts: PrintLatexOpts = {}): string {
  const output = printLatexUnclean(node, opts);
  return output.replace(
    /(\\(?:[a-z](?:\{\{cursor\}\})?)+) (?!(?:\{\{cursor\}\})?[a-z])/gi,
    '$1'
  );
}

// copying a selection via `selectedLatex` generates LaTex for the selected range
// Calling printLatexUncleanForGroup ensures spaces, for exampe 'a\to b'
export function printLatexRange(range: MqNode[]) {
  if (range.length == 0) return '';
  const parent = range[0].parent();
  if (parent?.type !== 'group') return '';
  return printLatexUncleanForGroup(parent, range);
}

function maybeAddEagerSpace(cmd: string) {
  if (/^\\[a-z]+$/i.test(cmd)) {
    return cmd + ' ';
  } else {
    return cmd;
  }
}

function singleSpaceIfEmpty(str: string) {
  if (str === '') return ' ';
  return str;
}

const CURSOR = '{{cursor}}';

function printLatexUncleanForGroup(
  node: MqGroup,
  children: MqNode[],
  opts: PrintLatexOpts = {}
) {
  let out = '';
  let partialOperatorName = '';
  for (const child of children) {
    const i = child.getIndex();
    const childLatex = printLatexUnclean(child, opts);

    if (
      opts.emitCursor?.group === node &&
      opts.emitCursor.index === i &&
      !partialOperatorName
    ) {
      out += CURSOR;
    }

    if (doesMarkStartAtNode(node.marks.mutable_operatorName, i)) {
      partialOperatorName += childLatex;
    } else if (doesMarkEndAtNode(node.marks.mutable_operatorName, i)) {
      partialOperatorName += childLatex;

      if (opts.emitCursorAtEveryPosition) {
        out += CURSOR;
      }

      let operatorNameWithCursors = partialOperatorName;

      if (opts.emitCursorAtEveryPosition) {
        operatorNameWithCursors = partialOperatorName.split('').join(CURSOR);
      } else if (opts.emitCursor?.group === node) {
        // check if the cursor is in the middle of this operatorName. We don't care about just left or just
        // just right because those are already handled.
        const wordStartI = i - partialOperatorName.length + 2;
        const wordEndI = i;
        if (
          opts.emitCursor.index >= wordStartI &&
          opts.emitCursor.index <= wordEndI
        ) {
          const indexRelativeToString = opts.emitCursor.index - wordStartI + 1;
          operatorNameWithCursors =
            partialOperatorName.slice(0, indexRelativeToString) +
            CURSOR +
            partialOperatorName.slice(indexRelativeToString);
        }
      }
      if (BuiltInOpNames.has(partialOperatorName)) {
        out += '\\' + operatorNameWithCursors + ' ';
      } else {
        out += '\\operatorname{' + operatorNameWithCursors + '}';
      }
      partialOperatorName = '';
    } else if (partialOperatorName) {
      partialOperatorName += childLatex;
    } else {
      if (opts.emitCursorAtEveryPosition) {
        out += CURSOR;
      }

      out += childLatex;
    }
  }
  return out;
}

/** For groups, printLatex does not include wrapping curly braces. */
function printLatexUnclean(node: MqNode, opts: PrintLatexOpts): string {
  switch (node.type) {
    case 'char':
      return maybeAddEagerSpace(node.latex);
    case 'percentof':
      return '\\%\\operatorname{of}';
    case 'ans':
      return '\\operatorname{ans}';
    case 'token':
      return `\\${node.variant}{` + node.id + '}';
    case 'brackets': {
      const middle = printLatexUnclean(node.middle, opts);
      return `\\left${node.leftLatex}${middle}\\right${node.rightLatex}`;
    }
    case 'sqrt': {
      // mq outputs index if defined even if empty
      const index = node.index
        ? `[${printLatexUnclean(node.index, opts)}]`
        : '';

      let radicand = printLatexUnclean(node.radicand, opts);
      if (!node.index) {
        radicand = singleSpaceIfEmpty(radicand);
      }

      return `\\sqrt${index}{${radicand}}`;
    }
    case 'frac': {
      const num = singleSpaceIfEmpty(printLatexUnclean(node.num, opts));
      const den = singleSpaceIfEmpty(printLatexUnclean(node.den, opts));
      return `\\frac{${num}}{${den}}`;
    }
    case 'binom': {
      const num = singleSpaceIfEmpty(printLatexUnclean(node.num, opts));
      const den = singleSpaceIfEmpty(printLatexUnclean(node.den, opts));
      return `\\binom{${num}}{${den}}`;
    }
    case 'supsub':
      // mq outputs .sub and .sup as empty if it was originally defined
      const sub = node.sub
        ? `_{${singleSpaceIfEmpty(printLatexUnclean(node.sub, opts))}}`
        : '';
      const sup = node.sup
        ? `^{${singleSpaceIfEmpty(printLatexUnclean(node.sup, opts))}}`
        : '';
      return sub + sup;

    case 'summation': {
      // mq outputs .sub and .sup in summations even if they were not originally defined.
      const prefix = node.kind;
      const sub = printLatexUnclean(node.sub, opts);
      const sup = printLatexUnclean(node.sup, opts);
      // ensure copy/paste of \sum_{n=1}^{2}{}^{3} round trips intact
      const bugfix = node.nextSibling()?.type === 'supsub' ? '{}' : '';
      return (
        prefix +
        `_{${singleSpaceIfEmpty(sub)}}^{${singleSpaceIfEmpty(sup)}}` +
        bugfix
      );
    }
    case 'group': {
      let out = printLatexUncleanForGroup(node, node.children, opts);
      if (opts.emitCursorAtEveryPosition) {
        out += CURSOR;
      } else if (
        opts.emitCursor?.group === node &&
        opts.emitCursor.index === node.children.length
      ) {
        out += CURSOR;
      }
      return out;
    }

    case 'style-cmd':
      let out = node.val;
      if (node.styleParam !== undefined) {
        out += '{' + node.styleParam + '}';
      }

      let argLatex = printLatexUnclean(node.arg, opts);
      if (node.val !== '\\textcolor') {
        argLatex = singleSpaceIfEmpty(argLatex);
      }

      out += '{' + argLatex + '}';
      return out;

    default:
      node satisfies never;
      throw new Error(`Invalid node: ${(node as any).type}`);
  }
}

export function cursorToLatexIndex(cursor: Cursor): number {
  const root = cursor.group.getRoot();
  // Find the index
  const latex = printLatex(root, {
    emitCursor: {
      group: cursor.group,
      index: cursor.index
    }
  });

  const out = latex.indexOf(CURSOR);
  return out;
}

export function latexIndexToCursor(
  root: MqGroup,
  index: number
): Cursor | undefined {
  const latexWithCursors = printLatex(root, {
    emitCursorAtEveryPosition: true
  });
  const cursorIndex = indexOfCursorAtLatexIndex(latexWithCursors, index);
  if (cursorIndex === undefined) {
    return undefined;
  }
  let i = 0;
  for (const cursor of allCursorsInOrder(root)) {
    if (i === cursorIndex) {
      return cursor;
    }
    i += 1;
  }
  return undefined;
}

/**
 * If the root group with all cursors inserted has latex `latexWithCursors`,
 * and the root group with one cursor inserted has a cursor at index `latexIndex`,
 * return `n` where the `n`th cursor (in left-to-right order of latex) is that cursor, at `latexIndex`.
 */
function indexOfCursorAtLatexIndex(
  latexWithCursors: string,
  latexIndex: number
): number | undefined {
  let totalLen = 0;
  let cursorIndex = 0;
  for (const match of latexWithCursors.matchAll(/\{\{cursor\}\}/g)) {
    // match.index points to the start of the matched string.
    // totalLen is the total length of cursors matched before then.
    const realIndex = match.index - totalLen;
    if (realIndex === latexIndex) {
      return cursorIndex;
    }
    cursorIndex += 1;
    totalLen += match[0].length;
  }
  return undefined;
}
