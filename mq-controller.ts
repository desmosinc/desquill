import { ctrlDeleteInDir, deleteInDir } from './actions/delete-towards';
import { moveLeftRight, moveOutOf } from './actions/move-left-right';
import { moveUpDown } from './actions/move-up-down';
import { domNodeToMqNode, seekCursorInTarget } from './actions/seek-cursor';
import {
  selectAll,
  selectCtrlHomeEnd,
  selectHomeEnd,
  selectLeftRight,
  selectUpDown
} from './actions/select-left-right';
import { typeChar } from './actions/type-char';
import { weldSupSubs } from './actions/weld-sup-subs';
import { parse } from './mathquill-parser';
import { actionAllowedForStatic, type MQAction } from './mq-actions';
import {
  computeFinalMathspeak,
  getMathspeak,
  getMathspeakForSelection
} from './mq-mathspeak';
import { MqModel } from './mq-model';
import {
  calculateTreeDepth,
  mqBracketWithGhostSide,
  type MqGroup
} from './mq-nodes';
import type { ExportedLatexSelection } from './mq-public-api';
import { fixParents } from './node-traversal-order';
import {
  cursorToLatexIndex,
  latexIndexToCursor,
  printLatex,
  printLatexRange
} from './print-latex';
import type { MqSelection } from './selection';
import {
  isSelectionCollapsed,
  makeLeastCommonAncestorSelection,
  makePointSelection,
  makeSelection,
  sliceMqTree,
  spliceMqTree
} from './selection';
import { clearStashedUpdownCursors } from './stash-cursors';
import { Dispatcher } from './vendor/flux';

export type FocusState = 'blurred' | 'unintentional-blurred' | 'focused';

export class MqController {
  private dispatcher: Dispatcher<MQAction>;
  private nextSubscription = 0;
  private subscriptions = new Map<number, () => void>();
  private model: MqModel;
  /**
   * Focused: selection appears blue, and point cursor blinks.
   * Unintentional blurred: selection appears gray, and point cursor is hidden.
   * Blurred: selection and point cursor are both hidden.
   */
  private focusState: FocusState;
  private mostRecentAriaMessage: string = '';
  private showGrouping: boolean = true;
  private showGroupingTimeout: undefined | number;
  private ariaAlertTimeout: undefined | number;
  /** Managed by scroll-horiz.ts */
  public cancelScrollHoriz: (() => void) | undefined;

  constructor() {
    this.model = MqModel.empty();
    this.dispatcher = new Dispatcher();
    this.dispatcher.register((action) => {
      this.onAction(action);
    });
  }

  private _queuedCallbacks: (() => void)[] = [];
  runAfterDispatch(cb: () => void) {
    this._queuedCallbacks.push(cb);
  }

  dispatch(action: MQAction) {
    /**
     * It's just too easy for blurs and focus changes to happen during a dispatch. We special case these
     * to be queued up to run after the dispatch if we are currently dispatching.
     *
     * For example, any action that creates a selection calls `.select()` on the textarea, which in turn
     * causes the field to be focused. That should only matter when calling API methods directly, since
     * keystrokes are only processed if the field is focused, and dragging has to be after mouse-down,
     * which focuses the field.
     */
    if (action.type === 'focus' && this.dispatcher.isDispatching()) {
      this.runAfterDispatch(() => {
        this.dispatch(action);
      });
      return;
    }
    this.dispatcher.dispatch(action);
    let cb: (() => void) | undefined;
    while ((cb = this._queuedCallbacks.shift())) {
      cb();
    }
  }

  private lastDepth: number | undefined;
  private onAction(action: MQAction) {
    const lastModel = this.model;

    this.handleAction(action);

    if (action.type !== 'arrow-up-down') {
      // Clear up/down before welding, since the cursors can affect SupSub welding.
      clearStashedUpdownCursors(this.model.root);
    }

    this.model = weldSupSubs(this.model);

    if (this.model.config.maxDepth !== undefined) {
      const newDepth = calculateTreeDepth(this.model.root);
      if (
        newDepth > this.model.config.maxDepth &&
        this.lastDepth !== undefined &&
        newDepth > this.lastDepth
      ) {
        // revert change because it will grow the tree depth even further past maxDepth. This is written the way it
        // is in order to allow an initial loadup to succeed even if the latex produces a tree with depth > maxDepth.
        // From testing, it doesn't appear old mq truncated trees on initial load. This will allow a tree that was too
        // large to load up and be edited. It just can't grow even deeper. It will one-way ratchet in depth downwards
        // to the maxDepth.
        this.model = lastModel;
        // Need to fix the parents since the action may have re-parented some nodes.
        fixParents(lastModel.root);
      } else {
        this.lastDepth = newDepth;
      }
    }

    // Always show grouping in static fields and on the initial update
    // (or any update from an empty field).
    const alwaysGroup =
      this.getConfig().static || lastModel.root.children.length === 0;
    if (alwaysGroup) {
      this.showGrouping = true;
    } else if (this.model.root !== lastModel.root) {
      // The root changed, so stop grouping.
      this.showGrouping = false;
      if (this.showGroupingTimeout !== undefined) {
        clearTimeout(this.showGroupingTimeout);
      }
      this.showGroupingTimeout = setTimeout(() => {
        this.showGroupingTimeout = undefined;
        this.dispatch({ type: 'show-grouping' });
      }, 1000);
    }

    this.updateViews();
  }

  /** Returns a function to cancel the subscription. */
  subscribeToChanges(fn: () => void): () => void {
    const token = this.nextSubscription;
    this.nextSubscription += 1;

    this.subscriptions.set(token, fn);

    return () => {
      this.subscriptions.delete(token);
    };
  }

  private updateViews() {
    for (const subscription of this.subscriptions.values()) {
      subscription();
    }
  }

  markAfterRender() {
    this.model.markAfterRender();
  }

  private handleAction(action: MQAction) {
    if (this.getConfig().static && !actionAllowedForStatic(action)) {
      return;
    }
    switch (action.type) {
      case 'show-grouping': {
        this.showGrouping = true;
        break;
      }
      case 'focus':
        this.focusState = 'focused';
        if (
          this.getConfig().static &&
          isSelectionCollapsed(this.model.selection)
        ) {
          this.model = selectAll(this.model);
        }
        break;
      case 'blur':
        if (action.intentional) {
          // Click/arrow/tab to focus a different element on the page.
          this.focusState = 'blurred';
          if (this.model.config.resetCursorOnBlur) {
            // reset cursor to end
            const selection = this.model.selection;
            this.model = this.model.withPointSelection(
              this.getRoot().lastCursor()
            );
            this.model.selectionBeforeBlur = selection;
          }
          while (true) {
            const bracket = this.model.root.find(
              (x) => x.type === 'brackets' && !!x.ghostSide
            );
            if (bracket?.type !== 'brackets') break;

            this.model = this.model.withSplicedMqTree(
              bracket.containingSelection(),
              () => [mqBracketWithGhostSide(bracket, undefined)]
            );
          }
        } else {
          // A different window was focused.
          this.focusState = 'unintentional-blurred';
        }
        break;
      case 'tick':
        // Do nothing; just update view.
        break;
      case 'set-config':
        this.model = this.model.withConfig(action.config);
        break;
      case 'api-set-latex': {
        // allow this write to bypass maxDepth check. We only enforce this on edits.
        this.lastDepth = undefined;
        const root = parse(action.latex, this.model.config);
        const rightCursor = root.lastCursor();
        const selection = makePointSelection(rightCursor);
        this.model = this.model.withRootAndSelection(root, selection);
        break;
      }
      case 'api-clear-selection': {
        this.model = this.model.withPointSelection(this.getSelection().head);
        break;
      }
      case 'api-set-selection': {
        const { startIndex, endIndex, latex } = action.selection;
        if (printLatex(this.getRoot()) !== latex) {
          // Ignore selection updates that don't have the right latex; indices are messed up.
          return;
        }
        if (startIndex > endIndex) {
          return;
        }
        // TODO-mq-rewrite-quirk: this seems backwards from what it should be (anchor on left, head on right).
        // Leaving it be to match existing mathquill.
        const anchor = latexIndexToCursor(this.getRoot(), endIndex);
        const head = latexIndexToCursor(this.getRoot(), startIndex);
        if (anchor === undefined || head === undefined) {
          return;
        }
        const selection = makeSelection(anchor, head);
        if (!selection) {
          return;
        }
        this.model = this.model.withSelection(selection);
        break;
      }
      case 'select-all': {
        this.model = selectAll(this.model);
        break;
      }
      case 'jump-to-field-end':
      case 'jump-to-field-start': {
        const dir = action.type === 'jump-to-field-end' ? 'right' : 'left';
        const root = this.getRoot();
        const end = root.lastCursorInDir(dir);
        const rootMathSpeak = getMathspeak(root, this.model.config);
        const expr = computeFinalMathspeak(
          this.model.getAriaLabel(),
          rootMathSpeak,
          this.model.getAriaPostLabel()
        );
        const aria = this.model.config.localize(
          dir === 'left' ? 'mq-narration-beginning-of' : 'mq-narration-end-of',
          { expr }
        );
        this.model = this.model.withPointSelection(end).withAriaQueueItem(aria);
        break;
      }
      case 'write-latex': {
        const insert = parse(action.latex, this.model.config);
        const { root, insertedSelection } = spliceMqTree(
          this.getSelection(),
          insert.children
        );
        const selection = makePointSelection(insertedSelection.right);
        this.model = this.model.withRootAndSelection(root, selection);

        if (action.fromPaste) {
          this.runAfterDispatch(() => {
            if (this.model.config.onPaste) {
              this.model.config.onPaste();
            }
          });
        }
        break;
      }
      case 'delete-in-direction': {
        this.model = deleteInDir(this.getModel(), action.direction);
        break;
      }
      case 'ctrl-delete-in-direction': {
        this.model = ctrlDeleteInDir(this.getModel(), action.direction);
        break;
      }
      case 'cut-selected': {
        // Delete the selection
        const { root, insertedSelection } = spliceMqTree(
          this.getSelection(),
          []
        );
        this.model = this.model.withRootAndSelection(root, insertedSelection);

        this.runAfterDispatch(() => {
          if (this.model.config.onCut) {
            this.model.config.onCut();
          }
        });
        break;
      }
      case 'arrow-left-right':
        this.model = moveLeftRight(this.model, action.dir);
        break;
      case 'shift-left-right': {
        const newSelection = selectLeftRight(this.model, action.dir);
        this.model = this.model.withSelection(newSelection);
        break;
      }
      case 'arrow-up-down': {
        this.model = moveUpDown(this.model, action.updown);
        break;
      }
      case 'shift-up-down': {
        this.model = selectUpDown(this.model, action.updown);
        break;
      }
      case 'home-end': {
        const group = this.model.selection.head.group;
        const point = group.lastCursorInDir(action.dir);
        this.model = this.model
          .withPointSelection(point)
          .withAriaQueueDirEndOf(action.dir, point.group);
        break;
      }
      case 'shift-home-end': {
        this.model = selectHomeEnd(this.model, action.dir);
        break;
      }
      case 'ctrl-shift-home-end': {
        this.model = selectCtrlHomeEnd(this.model, action.dir);
        break;
      }
      case 'escape-dir': {
        const headGroup = this.getSelection().head.group;
        if (headGroup.eq(headGroup.getRoot())) {
          // Cursor is at the root, so let the normal tab/escape handler work.
          return;
        }
        // Prevent default on the regular tab/etc action.
        action.evt?.preventDefault();
        this.model = moveOutOf(this.getModel(), headGroup, action.direction);
        break;
      }
      case 'mouse-down': {
        const cursor = seekCursorInTarget(
          this.model,
          action.target,
          action.clientX
        );
        this.model = this.model
          .withPointSelection(cursor)
          .withIsSelecting(true);
        break;
      }
      case 'mouse-move': {
        const minHead = seekCursorInTarget(
          this.model,
          action.target,
          action.clientX
        );
        if (
          this.model.config.resetCursorOnBlur &&
          this.getFocusState() !== 'focused' &&
          this.model.selectionBeforeBlur
        ) {
          // The field was blurred in the middle of a selection
          this.model = this.model.withSelection(this.model.selectionBeforeBlur);
        }
        // Maintain the existing anchor, and pick a new head.
        // The head is picked to minimize
        const newSelection = makeLeastCommonAncestorSelection(
          this.model.selection.anchor,
          minHead
        );
        const { autoOperatorNames, localize } = this.model.config;
        const opts = { autoOperatorNames, localize };
        this.model = this.model
          .withSelection(newSelection)
          .withIsSelecting(true);
        if (!isSelectionCollapsed(newSelection)) {
          this.model = this.model.withAriaQueueItem(
            getMathspeakForSelection(newSelection, opts)
          );
        }
        break;
      }
      case 'mouse-up': {
        this.model = this.model.withIsSelecting(false);
        if (
          !this.getConfig().static &&
          isSelectionCollapsed(this.model.selection)
        ) {
          this.model = this.model.withAriaQueueNode(
            this.model.selection.head.group
          );
        }
        if (
          this.getConfig().static &&
          isSelectionCollapsed(this.model.selection)
        ) {
          this.model = selectAll(this.model);
        }
        break;
      }

      case 'click-at': {
        const cursor = seekCursorInTarget(
          this.model,
          action.target,
          action.clientX
        );
        this.model = this.model.withPointSelection(cursor);
        break;
      }
      case 'type-char': {
        this.model = typeChar(this.model, action.char);
        break;
      }

      case 'set-aria-label':
        this.model = this.model.withAriaLabel(action.label);
        break;

      case 'set-aria-post-label':
        this.model = this.model.withAriaPostLabel(action.label);

        if (this.ariaAlertTimeout !== undefined) {
          clearTimeout(this.ariaAlertTimeout);
        }

        if (action.label !== '' && action.timeout !== undefined) {
          this.ariaAlertTimeout = setTimeout(() => {
            this.dispatch({ type: 'speak-aria-post-after-timeout' });
          }, action.timeout);
        }
        break;

      case 'speak-aria-post-after-timeout':
        if (this.getFocusState() === 'focused') {
          const { autoOperatorNames, localize } = this.model.config;
          const opts = { autoOperatorNames, localize };
          this.model = this.model.withAriaQueueItem(
            getMathspeak(this.getRoot(), opts).trim() +
              ' ' +
              this.model.getAriaPostLabel().trim()
          );
        }
        break;

      case 'speak-parent-block': {
        // Ctrl-Alt-Up: speak the parent node of the current group
        const parentOfContainingGroup =
          this.model.selection.head.group.parent();
        if (parentOfContainingGroup) {
          this.model = this.model.withAriaQueueNode(parentOfContainingGroup);
        } else {
          const aria = this.model.config.localize('mq-narration-nothing-above');
          this.model = this.model.withAriaQueueItem(aria);
        }
        break;
      }
      case 'speak-current-block': {
        // Ctrl-Alt-Down: speak current group
        const containingGroup = this.model.selection.head.group;
        if (containingGroup.numChildren() > 0) {
          this.model = this.model.withAriaQueueNode(containingGroup);
        } else {
          const { localize } = this.model.config;
          const aria = localize('mq-narration-block-is-empty');
          this.model = this.model.withAriaQueueItem(aria);
        }
        break;
      }
      case 'speak-block-dir': {
        // Ctrl-Alt-Left: speak left-adjacent block
        // Ctrl-Alt-Right: speak right-adjacent block
        const parentOfContainingGroup =
          this.model.selection.head.group.parent();
        const sibling = parentOfContainingGroup?.nextSiblingInDir(action.dir);
        const { localize } = this.model.config;
        if (sibling) {
          this.model = this.model.withAriaQueueNode(sibling);
        } else if (action.dir === 'right') {
          const aria = localize('mq-narration-nothing-to-the-right');
          this.model = this.model.withAriaQueueItem(aria);
        } else {
          const aria = localize('mq-narration-nothing-to-the-left');
          this.model = this.model.withAriaQueueItem(aria);
        }
        break;
      }
      case 'speak-selection': {
        const { autoOperatorNames, localize } = this.model.config;
        const opts = { autoOperatorNames, localize };
        this.model = this.model.withAriaQueueItem(
          getMathspeakForSelection(this.model.selection, opts)
        );
        break;
      }
      case 'speak-aria-post': {
        const ariaPostLabel = this.model.getAriaPostLabel();
        if (ariaPostLabel.length > 0) {
          this.model = this.model.withAriaQueueItem(ariaPostLabel);
        } else {
          const aria = this.model.config.localize('mq-narration-no-answer');
          this.model = this.model.withAriaQueueItem(aria);
        }
        break;
      }

      default:
        action satisfies never;
        throw new Error(`Invalid action type: ${(action as any).type}`);
    }
  }

  /** Returns the balanced selection, converted to latex indices. */
  getLatexSelection(): ExportedLatexSelection {
    const { left, right } = this.getSelection();
    return {
      latex: this.getLatex(),
      startIndex: cursorToLatexIndex(left),
      endIndex: cursorToLatexIndex(right)
    };
  }

  domNodeToSpan(dom: Element): ExportedLatexSelection | undefined {
    const node = domNodeToMqNode(this.model, dom);
    if (!node) return undefined;
    let left, right;

    if (node.type === 'group') {
      left = node.firstCursor();
      right = node.lastCursor();
    } else {
      ({ left, right } = node.containingSelection());
    }
    return {
      latex: this.getLatex(),
      startIndex: cursorToLatexIndex(left),
      endIndex: cursorToLatexIndex(right)
    };
  }

  debugGetCursorSelection(): MqSelection {
    return this.getSelection();
  }

  getSelection(): MqSelection {
    return this.model.selection;
  }

  getRoot(): MqGroup {
    return this.model.root;
  }

  isSelecting(): boolean {
    return this.model.isSelecting;
  }

  getFocusState(): FocusState {
    return this.focusState;
  }

  selectedLatex(): string {
    return printLatexRange(sliceMqTree(this.getSelection()));
  }

  getLatex(): string {
    return printLatex(this.getRoot());
  }

  getModel(): MqModel {
    return this.model;
  }

  getConfig() {
    return this.model.config;
  }

  getAriaLabel() {
    return this.model.getAriaLabel();
  }

  getAriaPostLabel() {
    return this.model.getAriaPostLabel();
  }

  setMostRecentAriaMessage(msg: string) {
    this.mostRecentAriaMessage = msg;
  }

  getMostRecentAriaMessage(): string {
    return this.mostRecentAriaMessage;
  }

  getShowGrouping() {
    return this.showGrouping;
  }
}
