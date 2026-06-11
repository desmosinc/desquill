import { nodeEndsBinaryOperator } from '../binary-operators.ts';
import type { Cursor } from '../cursor.ts';
import { doesMarkSetContainNode } from '../mq-marks.ts';
import type { MqModel } from '../mq-model.ts';
import {
  makeGroup,
  MqBinom,
  MqFrac,
  type MqGroup,
  type MqNode
} from '../mq-nodes.ts';
import {
  isSelectionCollapsed,
  makePointSelection,
  makeSelection,
  removeGhostsFromSelection,
  sliceMqTree,
  spliceMqTreeSingle
} from '../selection.ts';

export type FractionMode = 'frac' | 'binom';

export function typeFractionSlash(model: MqModel, mode: FractionMode): MqModel {
  const overMathspeak = model.s(
    mode === 'frac' ? 'mq-narration-over' : 'mq-narration-choose'
  );
  if (!isSelectionCollapsed(model.selection)) {
    // There's a selection; put in the numerator of a fraction
    // Put the cursor in the denominator
    return makeFractionAndPutCursorInDenom(model, mode).withAriaQueueItem(
      overMathspeak
    );
  }
  // Collapsed selection. Scan left then make a fraction.
  model = collapsedCursorTypeSlash(model, model.selection.head, mode);
  const frac = model.selection.head.group.parent();
  return frac?.type === 'frac' && frac.num.numChildren() === 0
    ? model.withAriaQueueItem(model.s('mq-narration-start-fraction'))
    : model.withAriaQueueItem(overMathspeak);
}

function collapsedCursorTypeSlash(
  model: MqModel,
  cursor: Cursor,
  mode: FractionMode
): MqModel {
  const right = cursor;
  let leftCursor = model.selection.left;
  while (true) {
    const left = leftCursor.nodeBefore();
    if (
      !left ||
      shouldBreakFractionScanning(left, left.getIndex(), left.parent())
    ) {
      break;
    }
    leftCursor = left.cursorOnSide('left');
  }
  const sel = makeSelection(leftCursor, right);
  if (sel === undefined) {
    throw new Error(
      'Programming Error: selection should be valid because left and right have the same parent.'
    );
  }
  const selectedLeftModel = model.withSelection(sel);
  return makeFractionAndPutCursorInDenom(selectedLeftModel, mode);
}

function makeFractionAndPutCursorInDenom(
  model: MqModel,
  mode: FractionMode
): MqModel {
  model = removeGhostsFromSelection(model);
  const selected = sliceMqTree(model.selection);
  const fracConstructor = mode === 'frac' ? MqFrac : MqBinom;
  const insert = new fracConstructor({
    num: makeGroup(selected),
    den: makeGroup([])
  });
  const { root, inserted } = spliceMqTreeSingle(model.selection, insert);
  // Put cursor in the numerator if it is empty, otherwise the denominator (which is always empty here)
  const num = inserted.num;
  const den = inserted.den;
  const groupForCursor = num.children.length === 0 ? num : den;
  const selection = makePointSelection(groupForCursor.firstCursor());
  return model.withRootAndSelection(root, selection);
}

/** The node is the `index`th node in `group`. */
function shouldBreakFractionScanning(
  node: MqNode,
  index: number,
  group: MqGroup
) {
  switch (node.type) {
    case 'summation':
      return true;
    case 'group':
    case 'frac':
    case 'binom':
    case 'percentof':
    case 'ans':
    case 'token':

    case 'sqrt':
    case 'supsub':
    case 'brackets':
    case 'style-cmd':
      return false;
    case 'char':
      if (node.latex === '.') {
        // Break on ellipsis.
        return doesMarkSetContainNode(group.marks.ellipsis, index);
      }
      return (
        node.latex === '\\ ' ||
        node.latex === ';' ||
        node.latex === ',' ||
        node.latex === ':' ||
        nodeEndsBinaryOperator(node, group, index)
      );
  }
}
