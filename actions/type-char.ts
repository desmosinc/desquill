import type { Cursor } from '../cursor';
import { parse } from '../mathquill-parser';
import type { AutoCommandNames, TrieNode } from '../mq-config';
import { doesMarkSetContainNode, findMarkContainingNode } from '../mq-marks';
import { getMathspeakForBracketSide } from '../mq-mathspeak';
import { type MqModel } from '../mq-model';
import {
  makeGroup,
  MqAns,
  MqChar,
  MqFrac,
  type MqGroup,
  type MqNonGroup,
  MqPercentOf,
  MqSqrt,
  MqSummation,
  MqSupSub
} from '../mq-nodes';
import {
  isMqVariable,
  mapCtrlSeqAlias,
  mapSymbolToLatex
} from '../parser/cmd-to-latex';
import { getFragmentReplacement } from '../parser/cmds';
import {
  isSelectionCollapsed,
  makePointSelection,
  makeSameParentSelection,
  type MqSelection,
  spliceMqTree,
  spliceMqTreeSingle
} from '../selection';
import { typeBracket } from './type-bracket';
import { typeFractionSlash } from './type-fraction-slash';
import { typeSupSub } from './type-sup-sub';

/**
 * Replace the selection with the given node, put the cursor after,
 * and speak what was just inserted.
 */
function spliceIn(
  model: MqModel,
  deleteSelection: MqSelection,
  newNode: MqNonGroup
) {
  const { root, inserted } = spliceMqTreeSingle(deleteSelection, newNode);
  const point = inserted.cursorOnSide('right');
  return model
    .withRootAndSelection(root, makePointSelection(point))
    .withAriaQueueNode(inserted);
}

// "√" isn't included in the regular `aliases` map because it has a special entry
// in `fragments` in `cmds.ts`.
const extraAliases: Record<string, string | undefined> = {
  '√': 'sqrt',
  '*': 'cdot'
};

function replaceLeftIfEquals(
  model: MqModel,
  needle: string,
  replacement: string
) {
  const cursor = model.selection.head;
  const nodeBefore = cursor.nodeBefore();
  if (!nodeBefore) return undefined;

  if (nodeBefore.type !== 'char') return undefined;

  if (nodeBefore.latex !== needle) return undefined;

  const replaceSelection = nodeBefore.containingSelection();
  return spliceIn(model, replaceSelection, new MqChar(replacement));
}

function breakOutOfSupSubIfAppropriate(model: MqModel, char: string) {
  // Check if we should break out of a superscript/subscript
  if (
    model.config.charsThatBreakOutOfSupSub.indexOf(char) > -1 &&
    isSelectionCollapsed(model.selection)
  ) {
    const cursor = model.selection.head;
    const nodeBefore = cursor.nodeBefore();
    const nodeAfter = cursor.nodeAfter();

    // Check if we're at the end of a sup/sub and something is to the left.
    if (nodeBefore && !nodeAfter) {
      const cursorGroup = cursor.group;
      const parent = cursorGroup.parent();

      // Check if the parent is a SupSub and the current group is the sup or sub
      if (parent) {
        if (parent.type === 'supsub') {
          // Move cursor to right of the SupSub node before inserting the character
          const newCursor = parent.cursorOnSide('right');
          model = model.withPointSelection(newCursor);
        }
      }
    }
  }

  return model;
}

function autoSubscriptIfAppropriate(model: MqModel, char: string) {
  if (
    !model.config.autoSubscriptNumerals ||
    !char.match(/^[0-9]$/) ||
    !isSelectionCollapsed(model.selection)
  ) {
    return undefined;
  }

  const cursor = model.selection.head;
  const nodeBefore = cursor.nodeBefore();
  if (!nodeBefore) return undefined;

  // we are already directly in a subscript. Do not autosubscript here
  const cursorGroup = cursor.group;
  const parent = cursorGroup.parent();
  if (parent?.type === 'supsub' && parent.sub === cursorGroup) {
    return undefined;
  }

  let nodeSupSubBefore;
  let nodeVariableBefore;

  // look for a variable before the cursor OR a variable before a supSub before the cursor
  if (nodeBefore?.type === 'supsub') {
    nodeSupSubBefore = nodeBefore;
    nodeVariableBefore = nodeSupSubBefore.prevSibling();
  } else {
    nodeVariableBefore = nodeBefore;
  }

  if (!nodeVariableBefore) return undefined;

  // make sure there is a variable before the cursor
  if (!isMqVariable(nodeVariableBefore)) {
    return undefined;
  }

  // make sure that variable is not part of an operatorName
  const variableGroupNode = nodeVariableBefore?.parent();
  const variableNodeIndex = nodeVariableBefore?.getIndex();
  if (
    doesMarkSetContainNode(
      variableGroupNode.marks.mutable_operatorName,
      variableNodeIndex
    )
  )
    return undefined;

  if (!nodeSupSubBefore) {
    // We need to create the SupSub because it doesn't exist
    return finalizeAutoSubscript(
      model,
      makePointSelection(cursor),
      new MqSupSub({
        sup: undefined,
        sub: makeGroup([new MqChar(char)])
      })
    );
  }

  const existingSubChildren = nodeSupSubBefore.sub
    ? nodeSupSubBefore.sub.children
    : [];
  return finalizeAutoSubscript(
    model,
    nodeBefore.containingSelection(),
    new MqSupSub({
      sup: nodeSupSubBefore.sup,
      sub: makeGroup(existingSubChildren.concat(new MqChar(char)))
    })
  );
}

function finalizeAutoSubscript(
  model: MqModel,
  deleteRange: MqSelection,
  insert: MqSupSub
) {
  const { root, inserted } = spliceMqTreeSingle(deleteRange, insert);
  // Keep cursor to the right of the subscript (not inside)
  const newCursor = inserted.cursorOnSide('right');
  return model.withRootAndSelection(root, makePointSelection(newCursor));
}

export function typeChar(model: MqModel, char: string): MqModel {
  const { localize } = model.config;
  const autoSubscriptedModel = autoSubscriptIfAppropriate(model, char);
  if (autoSubscriptedModel) return autoSubscriptedModel;

  model = breakOutOfSupSubIfAppropriate(model, char);

  if (char.match(/^[a-zA-Z0-9]$/)) {
    model = spliceIn(model, model.selection, new MqChar(char));
    // Check for autoCommands. If there is no autoCommand ending at the typed letter, the `model` is
    // returned as-is. Otherwise, the autoCommand letters are replaced with the right command.
    model = checkForAutoCommand(model, model.selection.right);
    return model;
  } else if (model.config.typingSlashWritesDivisionSymbol && char === '/') {
    return spliceIn(model, model.selection, new MqChar('\\div'));
  } else if (model.config.typingAsteriskWritesTimesSymbol && char === '*') {
    return spliceIn(model, model.selection, new MqChar('\\times'));
  }
  switch (char) {
    case '/':
      return typeFractionSlash(model, 'frac');
    case '^':
      return typeSupSub(model, 'sup');
    case '_':
      return typeSupSub(model, 'sub');
    case '(':
    case ')': {
      const sideTyped = char === '(' ? 'left' : 'right';
      ({ model } = typeBracket(model, sideTyped, '(', '(', ')', ')'));
      const aria = localize(
        sideTyped === 'left' ? 'mq-narration-left' : 'mq-narration-right',
        { bracket: localize('mq-narration-parenthesis') }
      );
      return model.withAriaQueueItem(aria);
    }
    case '[':
    case ']': {
      const sideTyped = char === '[' ? 'left' : 'right';
      ({ model } = typeBracket(model, sideTyped, '[', '[', ']', ']'));

      const aria = localize(
        sideTyped === 'left' ? 'mq-narration-left' : 'mq-narration-right',
        { bracket: localize('mq-narration-bracket') }
      );
      return model.withAriaQueueItem(aria);
    }
    case '{':
    case '}': {
      const sideTyped = char === '{' ? 'left' : 'right';
      ({ model } = typeBracket(model, sideTyped, '{', '\\{', '}', '\\}'));
      const aria = localize(
        sideTyped === 'left' ? 'mq-narration-left' : 'mq-narration-right',
        { bracket: localize('mq-narration-brace') }
      );
      return model.withAriaQueueItem(aria);
    }
    case '|': {
      ({ model } = typeBracket(model, 'either', '|', '|', '|', '|'));
      const { localize, autoOperatorNames } = model.config;
      const opts = { localize, autoOperatorNames };
      const { head } = model.selection;
      const nodeBefore = head.nodeBefore();
      const bracket = nodeBefore ?? head.group.parent();
      if (bracket?.type !== 'brackets')
        throw new Error('Programming error: bracket expected');
      const side = nodeBefore ? 'right' : 'left';
      const aria = getMathspeakForBracketSide(bracket, side, opts);
      return model.withAriaQueueItem(aria);
    }
    case '=': {
      let replaced = replaceLeftIfEquals(model, '>', '\\ge');
      if (replaced) return replaced;

      replaced = replaceLeftIfEquals(model, '<', '\\le');
      if (replaced) return replaced;
      break;
    }
    case '>': {
      const replaced = replaceLeftIfEquals(model, '-', '\\to');
      if (replaced) return replaced;
      break;
    }
    case '~': {
      const replaced = replaceLeftIfEquals(model, '\\sim', '\\approx');
      if (replaced) return replaced;
      break;
    }
    default: {
      const replaced = getFragmentReplacement(char);
      if (replaced.match(/^\^[0-9]$/)) {
        const exponent = replaced[1];
        model = typeSupSub(model, 'sup');
        return spliceIn(model, model.selection, new MqChar(exponent));
      } else if (replaced && !extraAliases[char]) {
        const insert = parse(replaced, model.config);
        const splice = spliceMqTree(model.selection, insert.children);
        const selection = makePointSelection(splice.insertedSelection.right);
        return model.withRootAndSelection(splice.root, selection);
      }
    }
  }
  // Vanilla symbols (i.e. stuff not handled by Mathquill, like '#' or `⌹`, gets
  // unchanged in `mapCtrlSeqAlias` and `mapSymbolToLatex`)
  // A handled symbol like `≈` becomes `charOrCmdName == 'approx'` then `latex == '\\approx'`
  // Similarly, `√` becomes `charOrCmdName == 'sqrt'`
  let charOrCmdName = extraAliases[char] || mapCtrlSeqAlias(char);
  if (char === '%' && model.config.typingPercentWritesPercentOf) {
    charOrCmdName = 'percent';
  }

  // In the case of something like '∑' replace the selection with a serious node,
  // and be careful about where the selection goes.
  const modelAfterSpecial = maybeTypeSpecial(
    model,
    model.selection,
    charOrCmdName
  );
  if (modelAfterSpecial) {
    return modelAfterSpecial;
  }

  // Otherwise (something like ' ', just insert a char like '\ ')
  const latex = mapSymbolToLatex(charOrCmdName);
  return spliceIn(model, model.selection, new MqChar(latex));
}

function checkForAutoCommand(
  model: MqModel,
  cursorAfterTypedLetter: Cursor
): MqModel {
  // Skip in subscripts (except for log)
  const supSub = cursorAfterTypedLetter.group.parent();
  if (supSub?.type === 'supsub') {
    const parentGroup = supSub.parent();
    const index = supSub.getIndex();
    const opName = parentGroup.marks.mutable_operatorName;
    const inSubscript = cursorAfterTypedLetter.group === supSub.sub;
    const isLog = findMarkContainingNode(opName, index - 1)?.word === 'log';
    if (inSubscript && !isLog) return model;
  }
  const lastLetterIndex = cursorAfterTypedLetter.nodeBefore()?.getIndex();
  if (lastLetterIndex === undefined) return model;

  const group = cursorAfterTypedLetter.group;
  const rawCommandName = commandNameEndingAt(
    group,
    lastLetterIndex,
    model.config.autoCommands
  );
  if (rawCommandName === undefined) return model;

  const firstLetterIndex = lastLetterIndex - rawCommandName.length + 1;
  const commandNameSelection = makeSameParentSelection(
    group,
    firstLetterIndex,
    lastLetterIndex + 1
  );
  const commandName = mapCtrlSeqAlias(rawCommandName);

  // In the case of something like 'sum', replace the selection with a summation,
  // and be careful about where the selection goes.
  const modelAfterSpecial = maybeTypeSpecial(
    model,
    commandNameSelection,
    commandName
  );
  if (modelAfterSpecial) {
    return modelAfterSpecial;
  }

  // Otherwise, this is a name like 'alpha' that just becomes a char like '\alpha'
  const latex = mapSymbolToLatex(commandName);
  return spliceIn(model, commandNameSelection, new MqChar(latex));
}

const specialCommands = [
  'sqrt',
  'nthroot',
  'cbrt',
  'sum',
  'prod',
  'coprod',
  'int',
  'percent',
  'ans',
  'frac',
  'binom'
] as const;

type SpecialCommand = (typeof specialCommands)[number];

export function isSpecialCommand(
  commandName: string
): commandName is SpecialCommand {
  return (specialCommands as any).includes(commandName);
}

/**
 * If `commandName` is handled specially, delete `deleteRange` and replace with with the special handling,
 * and return the new model. Otherwise return undefined.
 */
function maybeTypeSpecial(
  model: MqModel,
  deleteRange: MqSelection,
  commandName: string
) {
  if (!isSpecialCommand(commandName)) return undefined;
  switch (commandName) {
    case 'sqrt':
    case 'nthroot': {
      // Sqrt can also be aliased from "√".
      const sqrt = new MqSqrt({
        radicand: makeGroup([]),
        index: commandName === 'nthroot' ? makeGroup([]) : undefined
      });
      const { root, inserted } = spliceMqTreeSingle(deleteRange, sqrt);
      const selection = makePointSelection(
        // Go into index for nthroot and radicand for sqrt.
        inserted.firstChild()!.firstCursor()
      );
      return model.withRootAndSelection(root, selection);
    }
    case 'cbrt': {
      const sqrt = new MqSqrt({
        radicand: makeGroup([]),
        index: makeGroup([new MqChar('3')])
      });
      const { root, inserted } = spliceMqTreeSingle(deleteRange, sqrt);
      const selection = makePointSelection(inserted.radicand.firstCursor());
      return model.withRootAndSelection(root, selection);
    }
    case 'sum':
    case 'prod':
    case 'coprod':
    case 'int': {
      // Sum can also be aliased from "∑" and "summation"
      // Prod can also be aliased from "product"
      // Int can also be aliased from "∫" and "integral"
      const sum = new MqSummation({
        kind: ('\\' + commandName) as `\\${typeof commandName}`,
        sub:
          commandName !== 'int' && model.config.sumStartsWithNEquals
            ? makeGroup([new MqChar('n'), new MqChar('=')])
            : makeGroup([]),
        sup: makeGroup([])
      });
      const { root, inserted } = spliceMqTreeSingle(deleteRange, sum);
      const selection = makePointSelection(inserted.sub.lastCursor());
      return model.withRootAndSelection(root, selection);
    }
    case 'percent': {
      // Percent can also be aliased from "%" with typingPercentWritesPercentOf on.
      return spliceIn(model, deleteRange, new MqPercentOf());
    }
    case 'ans': {
      return spliceIn(model, deleteRange, new MqAns());
    }
    case 'frac': {
      const frac = new MqFrac({
        num: makeGroup([]),
        den: makeGroup([])
      });
      const { root, inserted } = spliceMqTreeSingle(deleteRange, frac);
      const selection = makePointSelection(inserted.num.firstCursor());
      return model.withRootAndSelection(root, selection);
    }
    case 'binom': {
      const { root, insertedSelection } = spliceMqTree(deleteRange, []);
      model = model.withRootAndSelection(root, insertedSelection);
      return typeFractionSlash(model, 'binom');
    }
    default:
      commandName satisfies never;
      return undefined;
  }
}

/**
 * Return the longest command name ending at the `endIndex`'th child of `group`,
 * or `undefined` if none exists.
 */
function commandNameEndingAt(
  group: MqGroup,
  endIndex: number,
  autoCommandNames: AutoCommandNames
): string | undefined {
  let longestCommandName: string | undefined = undefined;

  let trieNode: TrieNode | undefined = autoCommandNames.getReverseTrieRoot();
  for (let i = endIndex; trieNode && i >= 0; i--) {
    const child = group.children[i];
    if (child.type !== 'char') break;
    if (doesMarkSetContainNode(group.marks.mutable_operatorName, i)) {
      // Don't scan through operator names, so e.g. "cosum" stays as
      // `\cos um` rather than becoming `co\sum`.
      break;
    }

    trieNode = trieNode.followPath(child.latex);
    if (trieNode?.endWord) {
      longestCommandName = trieNode.endWord;
    }
  }

  return longestCommandName;
}
