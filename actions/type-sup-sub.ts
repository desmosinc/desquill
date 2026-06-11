import type { MqModel } from '../mq-model.ts';
import { makeGroup, type MqNode, MqSupSub } from '../mq-nodes.ts';
import {
  isSelectionCollapsed,
  makePointSelection,
  removeGhostsFromSelection,
  sliceMqTree,
  spliceMqTree,
  spliceMqTreeSingle
} from '../selection.ts';

export function typeSupSub(model: MqModel, supsub: 'sup' | 'sub'): MqModel {
  // Put the entire selection (if any) in a superscript,
  // then put the cursor at the end of that group
  model = removeGhostsFromSelection(model);
  const selected = sliceMqTree(model.selection);

  // Try to weld with SupSub on left.
  const left = model.selection.left.nodeBefore();
  if (left?.type === 'supsub') {
    // Delete the selected text
    spliceMqTree(model.selection, []);
    // `left` gets re-parented automatically since it's a direct child of the group.

    const supOrSub = ensureSupsub(left, supsub);
    // Insert the selected text at the end of the sup/sub.
    const endCursor = supOrSub.lastCursor();
    const { root, insertedSelection } = spliceMqTree(
      makePointSelection(endCursor),
      selected
    );
    const selection = makePointSelection(insertedSelection.right);
    model = model.withRootAndSelection(root, selection);
    return model.withAriaQueueDirEndOf('right', supOrSub);
  }

  // Give up if the cursor is at the start of the group, and supSubsRequireOperand is true
  // Note this is _before_ the below checks, so typing `^` on `<!>^{a}` does not
  // move the cursor into `^{<!>a}`.
  if (
    left === undefined &&
    model.config.supSubsRequireOperand &&
    isSelectionCollapsed(model.selection)
  ) {
    return model;
  }

  // Try to weld with SupSub on right.
  const right = model.selection.right.nodeAfter();
  if (right?.type === 'supsub') {
    // Delete the selected text
    spliceMqTree(model.selection, []);
    // `right` gets re-parented automatically since it's a direct child of the group.

    const supOrSub = ensureSupsub(right, supsub);
    // Insert the selected text at the end of the sup/sub.
    const endCursor = supOrSub.firstCursor();
    const { root, insertedSelection } = spliceMqTree(
      makePointSelection(endCursor),
      selected
    );
    const selection = makePointSelection(insertedSelection.right);
    model = model.withRootAndSelection(root, selection);
    return model.withAriaQueueDirEndOf('left', supOrSub);
  }

  // No SupSub to weld with, so make a new one, and put cursor at end.
  const insert: MqSupSub = supsub === 'sup' ? sup(selected) : sub(selected);
  const { root, inserted } = spliceMqTreeSingle(model.selection, insert);
  const insertedGroup = inserted.sup ?? inserted.sub!;
  const selection = makePointSelection(insertedGroup.lastCursor());
  model = model.withRootAndSelection(root, selection);
  const aria = model.s(
    supsub === 'sup' ? 'mq-narration-superscript' : 'mq-narration-subscript'
  );
  return model.withAriaQueueItem(aria);
}

function ensureSupsub(node: MqSupSub, supsub: 'sup' | 'sub') {
  return supsub === 'sup' ? ensureSup(node) : ensureSub(node);
}

function ensureSub(node: MqSupSub) {
  if (node.sub === undefined) {
    const newNode = new MqSupSub({
      sup: node.sup,
      sub: makeGroup([])
    });
    node = node.replacedWith(newNode);
  }
  return node.sub!;
}

function ensureSup(node: MqSupSub) {
  if (node.sup === undefined) {
    const newNode = new MqSupSub({
      sup: makeGroup([]),
      sub: node.sub
    });
    node = node.replacedWith(newNode);
  }
  return node.sup!;
}

function sub(children: MqNode[]): MqSupSub {
  return new MqSupSub({
    sup: undefined,
    sub: makeGroup(children)
  });
}

function sup(children: MqNode[]): MqSupSub {
  return new MqSupSub({
    sup: makeGroup(children),
    sub: undefined
  });
}
