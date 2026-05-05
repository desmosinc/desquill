import { nodeEndsBinaryOperator } from '../binary-operators';
import type { Cursor } from '../cursor';
import { doesMarkSetContainNode } from '../mq-marks';
import type { MqModel } from '../mq-model';
import {
  makeGroup,
  MqBinom,
  MqFrac,
  type MqGroup,
  type MqNode,
  nthChild,
  numChildren
} from '../mq-nodes';
import {
  isSelectionCollapsed,
  makePointSelection,
  makeSelection,
  sliceMqTree,
  spliceMqTreeSingle
} from '../selection';

type FractionMode = 'frac' | 'binom';

export function typeFractionSlash(model: MqModel, mode: FractionMode): MqModel {
  const overMathspeak = model.config.localize(
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
  // TODO-mq-rewrite-quirk: this says "over" even it there is nothing in the numerator,
  // like typing `/` from `\left(<!>\right)`
  return collapsedCursorTypeSlash(
    model,
    model.selection.head,
    mode
  ).withAriaQueueItem(overMathspeak);
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

export function removeGhosts(nodes: MqNode[]) {
  for (const node of nodes) {
    if (node.type === 'brackets') node.ghostSide = undefined;
    for (let i = 0; i < numChildren(node); i++) {
      removeGhosts([nthChild(node, i)]);
    }
  }
  return nodes;
}

function makeFractionAndPutCursorInDenom(
  model: MqModel,
  mode: FractionMode
): MqModel {
  const selected = removeGhosts(sliceMqTree(model.selection));
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
