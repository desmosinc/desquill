import type { Cursor, LeftOrRight } from './cursor';
import { updateMutableMarksOnGroup } from './mathquill-parser';
import {
  getDefaultMqConfig,
  type MqConfig,
  mutableMarksProps
} from './mq-config';
import { ariaLabelOfNthChild, getMathspeak } from './mq-mathspeak';
import {
  clearDerivedStateOnGroup,
  makeGroup,
  type MqGroup,
  type MqNode
} from './mq-nodes';
import { allGroupsInOrder } from './node-traversal-order';
import {
  makePointSelection,
  type MqSelection,
  spliceMqTree
} from './selection';
import {
  clearStashedSelectionCursors,
  stashSelectionCursors,
  unstashSelectionCursors
} from './stash-cursors';
import { isEqual, pick } from './vendor/underscore';

export class MqModel {
  readonly root: MqGroup;
  readonly selection: MqSelection;
  readonly config: MqConfig;
  readonly isSelecting: boolean;
  private readonly ariaLabel: string = '';
  private readonly ariaPostLabel: string = '';

  ariaQueue: string[] = [];
  domToMqNode: Map<HTMLElement, MqNode> | undefined;
  /**
   * Used to continue selecting from where you left off, when
   * the field is blurred while the mouse is still held down.
   */
  selectionBeforeBlur: MqSelection | undefined;

  private constructor(
    root: MqGroup,
    selection: MqSelection,
    options: MqConfig,
    isSelecting: boolean,
    ariaLabel: string,
    ariaPostLabel: string,
    queuedAriaItems: string[]
  ) {
    this.root = root;
    this.selection = selection;
    this.config = options;
    this.isSelecting = isSelecting;
    this.ariaLabel = ariaLabel;
    this.ariaPostLabel = ariaPostLabel;
    this.ariaQueue = queuedAriaItems;

    if (selection.left.group.getRoot() !== root) {
      throw new Error('Programming Error: selection must be inside root');
    }

    updateMutableMarksOnGroup(root, this.config);
  }

  static empty() {
    const root: MqGroup = makeGroup([]);
    const selection = makePointSelection(root.lastCursor());
    return new MqModel(
      root,
      selection,
      getDefaultMqConfig(),
      false,
      '',
      '',
      []
    );
  }

  withConfig(newConfig: MqConfig) {
    const configIsSameForRendering = isEqual(
      pick(newConfig, mutableMarksProps),
      pick(this.config, mutableMarksProps)
    );
    if (!configIsSameForRendering) {
      clearDerivedStateOnRoot(this.root);
    }
    return new MqModel(
      this.root,
      this.selection,
      newConfig,
      this.isSelecting,
      this.ariaLabel,
      this.ariaPostLabel,
      this.ariaQueue
    );
  }

  withRootAndSelection(root: MqGroup, selection: MqSelection): MqModel {
    return new MqModel(
      root,
      selection,
      this.config,
      this.isSelecting,
      this.ariaLabel,
      this.ariaPostLabel,
      this.ariaQueue
    );
  }

  withSelection(selection: MqSelection): MqModel {
    return new MqModel(
      this.root,
      selection,
      this.config,
      this.isSelecting,
      this.ariaLabel,
      this.ariaPostLabel,
      this.ariaQueue
    );
  }

  withPointSelection(point: Cursor): MqModel {
    const selection = makePointSelection(point);
    return this.withSelection(selection);
  }

  withIsSelecting(isSelecting: boolean): MqModel {
    return new MqModel(
      this.root,
      this.selection,
      this.config,
      isSelecting,
      this.ariaLabel,
      this.ariaPostLabel,
      this.ariaQueue
    );
  }

  withAriaLabel(ariaLabel: string): MqModel {
    return new MqModel(
      this.root,
      this.selection,
      this.config,
      this.isSelecting,
      ariaLabel,
      this.ariaPostLabel,
      this.ariaQueue
    );
  }

  withAriaPostLabel(ariaPostLabel: string): MqModel {
    return new MqModel(
      this.root,
      this.selection,
      this.config,
      this.isSelecting,
      this.ariaLabel,
      ariaPostLabel,
      this.ariaQueue
    );
  }

  private withAriaQueue(queuedAriaItems: string[]): MqModel {
    return new MqModel(
      this.root,
      this.selection,
      this.config,
      this.isSelecting,
      this.ariaLabel,
      this.ariaPostLabel,
      queuedAriaItems
    );
  }

  withAriaQueueItem(queuedAriaItem: string): MqModel {
    return this.withAriaQueue(this.ariaQueue.concat(queuedAriaItem));
  }

  withAriaQueueNode(
    node: MqNode,
    {
      shouldDescribe = false,
      ignoreShorthand = false
    }: {
      /** If `shouldDescribe = true`, also speak the aria label of the parent group. */
      shouldDescribe?: boolean;
      /**
       * At time of writing, we set "ignoreShorthand" true after calls to `withQueueDirOf`,
       * to avoid speaking "before squared", since doing so may be confusing.
       */
      ignoreShorthand?: boolean;
    } = {}
  ): MqModel {
    // Some constructs include verbal shorthand (such as simple fractions and exponents).
    // Since ARIA alerts relate to moving through interactive content, we don't want to use that shorthand if it exists
    // since doing so may be ambiguous or confusing.
    // For example, `x^2` normally has mathspeak '"x" squared', but when moving the cursor before the exponent,
    // it speaks 'before Superscript, 2 , Baseline' since the alternative is 'before squared'.
    const { autoOperatorNames, localize } = this.config;
    let output = getMathspeak(node, {
      ignoreShorthand,
      autoOperatorNames,
      localize
    });

    if (shouldDescribe && node.type === 'group') {
      output = getAriaLabel(this, node) + ' ' + output;
    }
    return this.withAriaQueueItem(output);
  }

  withAriaQueueDirOf(dir: LeftOrRight, node: MqNode) {
    const { autoOperatorNames, localize } = this.config;
    const opts = { ignoreShorthand: true, autoOperatorNames, localize };
    const expr = getMathspeak(node, opts);
    return this.withAriaQueueItem(
      this.config.localize(
        dir === 'left' ? 'mq-narration-before' : 'mq-narration-after',
        { expr }
      )
    );
  }

  withAriaQueueDirEndOf(dir: LeftOrRight, node: MqNode) {
    const { autoOperatorNames, localize } = this.config;
    const opts = { autoOperatorNames, localize };
    let expr = getMathspeak(node, opts);
    if (node.type === 'group') {
      expr = getAriaLabel(this, node) + ' ' + expr;
    }
    return this.withAriaQueueItem(
      this.config.localize(
        dir === 'left' ? 'mq-narration-beginning-of' : 'mq-narration-end-of',
        { expr }
      )
    );
  }

  withSplicedMqTree(deleteRange: MqSelection, insert: () => MqNode[]) {
    stashSelectionCursors(this.selection);
    const { root: newRoot } = spliceMqTree(deleteRange, insert());
    const newSelection = unstashSelectionCursors(newRoot);
    clearStashedSelectionCursors(this.root);
    return this.withRootAndSelection(newRoot, newSelection);
  }

  /** Mark that we have just rendered. */
  markAfterRender() {
    this.ariaQueue = [];
    this.domToMqNode = new Map();
    for (const group of allGroupsInOrder(this.root)) {
      if (group.mutable_domNode) {
        this.domToMqNode.set(group.mutable_domNode, group);
      }
      if (group.mutable_domChildren) {
        for (let i = 0; i < group.mutable_domChildren.length; i++) {
          const domNode = group.mutable_domChildren[i];
          const child = group.nthChild(i);
          if (!child) {
            throw new Error(
              "Programming error: mutable_domChildren length doesn't match group child count."
            );
          }
          this.domToMqNode.set(domNode, child);
        }
      }
    }
  }

  getRawAriaLabel() {
    return this.ariaLabel;
  }

  getAriaLabel() {
    if (!this.ariaLabel && !this.config.static) {
      return this.config.localize('mq-narration-math-input');
    }
    return this.ariaLabel;
  }

  getAriaPostLabel() {
    return this.ariaPostLabel;
  }
}

export function clearDerivedStateOnRoot(root: MqGroup) {
  for (const group of allGroupsInOrder(root)) {
    clearDerivedStateOnGroup(group);
  }
}

function getAriaLabel(model: MqModel, group: MqGroup) {
  const parent = group.parent();
  if (!parent) {
    // Root group has aria label given by API methods.
    return model.getAriaLabel();
  }
  // Other groups have aria labels like "numerator" or "superscript".
  const { autoOperatorNames, localize } = model.config;
  const opts = { autoOperatorNames, localize };
  return ariaLabelOfNthChild(parent, group.getIndex()!, opts);
}
