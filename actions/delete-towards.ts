import { Cursor, type LeftOrRight, swapDir } from '../cursor';
import {
  getAriaLabelForStyleCmd,
  getBareMathspeakForSelection,
  getMathspeakForBracketSide,
  summationMathspeakMap
} from '../mq-mathspeak';
import type { MqModel } from '../mq-model';
import {
  fracOrBinomPropName,
  isMqSymbol,
  makeGroup,
  MqBrackets,
  mqBracketWithMiddle,
  MqChar,
  type MqGroup,
  type MqInteriorNode,
  type MqNode,
  type MqNonGroup,
  MqSupSub,
  sqrtPropName,
  supsubPropName
} from '../mq-nodes';
import {
  getSelectionSide,
  isSelectionCollapsed,
  makePointSelection,
  makeSelection,
  sliceMqTree,
  spliceMqTree,
  spliceMqTreeSeveral,
  spliceMqTreeSingle,
  unwrapBracket
} from '../selection';
import { canCloseOpposing, closeOpposing, OPP_BRACKS } from './type-bracket';

const replaceMapIfDeletingLeftward: Record<string, string> = {
  '\\le': '<',
  '\\ge': '>',
  '\\approx': '\\sim',
  '\\to': '-'
};

export function deleteInDir(model: MqModel, dir: LeftOrRight): MqModel {
  const { autoOperatorNames, localize } = model.config;
  const opts = { autoOperatorNames, localize };
  const selection = model.selection;
  if (isSelectionCollapsed(selection)) {
    return collapsedCursorDeleteInDir(model, selection.anchor, dir);
  }
  // Delete the selection
  const deletedNodesMathspeak = getBareMathspeakForSelection(selection, opts);
  const { root, insertedSelection } = spliceMqTree(selection, []);
  return model
    .withRootAndSelection(root, insertedSelection)
    .withAriaQueueItem(deletedNodesMathspeak);
}

export function ctrlDeleteInDir(model: MqModel, dir: LeftOrRight): MqModel {
  const { autoOperatorNames, localize } = model.config;
  const opts = { autoOperatorNames, localize };
  const selection = model.selection;
  if (
    !isSelectionCollapsed(selection) ||
    selection.head.nodeInDirection(dir) === undefined
  ) {
    return deleteInDir(model, dir);
  }
  const cursor = selection.head;
  const farEnd = cursor.group.lastCursorInDir(dir);
  const deletedSelection = makeSelection(cursor, farEnd)!;
  const deletedNodesMathspeak = getBareMathspeakForSelection(
    deletedSelection,
    opts
  );
  const { root, insertedSelection } = spliceMqTree(deletedSelection, []);
  return model
    .withRootAndSelection(root, insertedSelection)
    .withAriaQueueItem(deletedNodesMathspeak);
}

function collapsedCursorDeleteInDir(
  model: MqModel,
  cursor: Cursor,
  dir: LeftOrRight
): MqModel {
  const nextNode = cursor.nodeInDirection(dir);
  if (!nextNode) {
    return deleteOutOf(model, cursor.group, dir);
  }
  return deleteTowards(model, nextNode, dir);
}

function allGroupsAreEmpty(node: MqNonGroup) {
  const n = node.numChildren();
  for (let i = 0; i < n; i++) {
    if (node.nthChild(i)!.children.length !== 0) {
      return false;
    }
  }
  return true;
}

/** Delete the given node, and place the cursor at the deleted portion. */
function deleteNode(model: MqModel, node: MqNonGroup): MqModel {
  const { autoOperatorNames, localize } = model.config;
  const opts = { autoOperatorNames, localize };
  const selection = node.containingSelection();
  const deletedNodesMathspeak = getBareMathspeakForSelection(selection, opts);
  const { root, insertedSelection } = spliceMqTree(selection, []);
  return model
    .withRootAndSelection(root, insertedSelection)
    .withAriaQueueItem(deletedNodesMathspeak);
}

/**
 * The cursor is on the `swapDir(dir)` side of `node` and moves in direction `dir`.
 * Enter the endpoint of the child group closer to where the cursor comes from.
 * E.g. if going "left", enter the rightmost point of the rightmost child of `node`.
 */
function moveInto(model: MqModel, node: MqInteriorNode, dir: LeftOrRight) {
  const end = swapDir(dir);
  const child = node.lastChildInDir(end);
  return model
    .withPointSelection(child.lastCursorInDir(end))
    .withAriaQueueDirEndOf(end, child);
}

/** The cursor is on the `swapDir(dir)` side of `node` and deletes in direction `dir`. */
function deleteTowards(
  model: MqModel,
  node: MqNonGroup,
  dir: LeftOrRight
): MqModel {
  const { autoOperatorNames, localize } = model.config;
  const opts = { autoOperatorNames, localize };
  switch (node.type) {
    case 'style-cmd': {
      if (allGroupsAreEmpty(node)) {
        return deleteNode(model, node);
      }
      return moveInto(model, node, dir);
    }

    case 'char': {
      // If deleting leftward from a non-strict inequality (\le or \ge), convert to strict form (< or >)
      // Likewise for `\approx` to `~` and `\to` to `-`
      if (dir === 'left') {
        const newChar = replaceMapIfDeletingLeftward[node.latex];
        if (newChar) {
          const deletedSelection = node.containingSelection();
          const { root, inserted } = spliceMqTreeSingle(
            deletedSelection,
            new MqChar(newChar)
          );

          const selection = makePointSelection(inserted.cursorOnSide('right'));
          return model
            .withRootAndSelection(root, selection)
            .withAriaQueueItem(
              getBareMathspeakForSelection(deletedSelection, opts)
            );
        }
      }

      return deleteNode(model, node);
    }
    case 'ans':
    case 'token':

    case 'percentof': {
      return deleteNode(model, node);
    }
    case 'binom':
    case 'frac':
    case 'summation': {
      if (allGroupsAreEmpty(node)) {
        return deleteNode(model, node);
      }

      return moveInto(model, node, dir);
    }
    case 'sqrt': {
      if (allGroupsAreEmpty(node)) {
        return deleteNode(model, node);
      }
      if (dir === 'right' && !node.index) {
        // Deleting right from the left, replace `\sqrt{radicand}` with 'radicand' and put cursor before 'radicand'
        const deletedSelection = node.containingSelection();
        const { root, insertedSelection } = spliceMqTree(
          deletedSelection,
          node.radicand.children
        );

        return model
          .withRootAndSelection(
            root,
            makePointSelection(insertedSelection.left)
          )
          .withAriaQueueItem(
            getBareMathspeakForSelection(deletedSelection, opts)
          );
      }

      return moveInto(model, node, dir);
    }
    case 'brackets': {
      return deleteSideOfBracket(model, node, swapDir(dir), false);
    }
    case 'supsub': {
      if (model.config.autoSubscriptNumerals && node.sub !== undefined) {
        // This is complex due to the `autoSubscriptNumerals` option
        const sub = node.sub;
        const lastChild = sub.lastChildInDir(swapDir(dir));
        let mappedSupSub: MqSupSub = node;
        if (lastChild !== undefined) {
          if (isMqSymbol(lastChild)) {
            // If the subscript is nonempty and the last node in the subscript is an MQSymbol (according to old MQ),
            // delete that node, and leave the cursor be.
            const { root, insertedSelection } = spliceMqTree(
              lastChild.containingSelection(),
              []
            );
            mappedSupSub = insertedSelection.head.group.parent() as MqSupSub;
            const cursor = mappedSupSub.cursorOnSide(swapDir(dir));

            model = model
              .withRootAndSelection(root, makePointSelection(cursor))
              .withAriaQueueNode(lastChild);
          } else {
            // If the subscript is nonempty but the last node is not an MQSymbol, then
            // (A) move the cursor into the start/end of the subscript, then
            // (B) delete in the appropriate direction (deleteInDir)
            model = model.withPointSelection(sub.lastCursorInDir(swapDir(dir)));

            model = deleteInDir(model, dir);
            // This is awkward because we deleted a child of the SupSub, so the SupSub got replaced.
            mappedSupSub = model.selection.head.group.parent() as MqSupSub;
          }
        } else {
          // No child was deleted, but we still want ARIA here to state that the empty subscript was deleted.
          model = model.withAriaQueueItem(
            localize('mq-narration-empty-subscript-was-deleted')
          );
        }
        const newNode = mappedSupSub;
        if (newNode.sub === undefined) {
          return model;
        } else if (newNode.sub.children.length === 0) {
          if (newNode.sup) {
            // We made the subscript empty, or the subscript was empty to begin with,
            // but there is still a superscript, so put the cursor before/after the superscript
            const newSupSub = new MqSupSub({
              sub: undefined,
              sup: newNode.sup
            });
            const { root, insertedSelection } = spliceMqTree(
              mappedSupSub.containingSelection(),
              [newSupSub]
            );
            // No aria alert needed here (its added above, in `if (lastChild !== undefined)` or its `else`);
            // this is just cleaning up an empty subscript and moving the cursor around.
            const point = getSelectionSide(insertedSelection, swapDir(dir));
            return model.withRootAndSelection(root, makePointSelection(point));
          } else {
            // We made the subscript empty, or the subscript was empty to begin with,
            // and there is no superscript, so put the cursor at the deleted position.
            const { root, insertedSelection } = spliceMqTree(
              mappedSupSub.containingSelection(),
              []
            );
            // No aria alert needed here (its added above, in `if (lastChild !== undefined)` or its `else`);
            // this is just cleaning up an empty subscript and moving the cursor around.
            return model.withRootAndSelection(root, insertedSelection);
          }
        } else {
          return model;
        }
      }

      if (allGroupsAreEmpty(node)) {
        return deleteNode(model, node);
      }

      return moveInto(model, node, dir);
    }
    default:
      node satisfies never;
      throw new Error(`Invalid node: ${(node as any).type}`);
  }
}

/** The cursor is at the start/end of group `group` and the user deletes in the direction `dir`. */
function deleteOutOf(
  model: MqModel,
  group: MqGroup,
  dir: LeftOrRight
): MqModel {
  const { localize } = model.config;
  const parent = group.parent();
  if (parent === undefined) {
    // deleting left from the leftmost point or right from the rightmost point.
    return model;
  }

  const node = parent;
  const index = group.getIndex()!;
  switch (node.type) {
    case 'binom':
    case 'frac': {
      // Replace `\frac{num}{den}` with `numden`, and put cursor
      // left/right of 'num' or left/right of 'den'.
      const prop = fracOrBinomPropName(node, index);
      const { root, insertedSelections } = spliceMqTreeSeveral(
        parent.containingSelection(),
        [node.num.children, node.den.children]
      );
      const selection =
        prop === 'num' ? insertedSelections[0] : insertedSelections[1];
      const point = getSelectionSide(selection, dir);
      // Here we just queue "Over" because only the fraction bar is deleted;
      // the numerator and denominator are left behind.
      const deleted = localize(
        node.type === 'frac' ? 'mq-narration-over' : 'mq-narration-choose'
      );
      return model
        .withRootAndSelection(root, makePointSelection(point))
        .withAriaQueueItem(deleted);
    }
    case 'style-cmd': {
      // Replace with arg
      const { root, insertedSelection } = spliceMqTree(
        parent.containingSelection(),
        node.arg.children
      );
      const point = getSelectionSide(insertedSelection, dir);
      const { autoOperatorNames, localize } = model.config;
      const opts = { autoOperatorNames, localize };
      return model
        .withRootAndSelection(root, makePointSelection(point))
        .withAriaQueueItem(
          localize('mq-narration-start') +
            getAriaLabelForStyleCmd(node, opts) +
            ','
        );
    }
    case 'sqrt': {
      const prop = sqrtPropName(node, index);
      // Replace `\sqrt[index]{radicand}` with `indexradicand`, and put
      // cursor left/right of 'index' or left/right of 'radicand'.
      const {
        root,
        insertedSelections: [indexSel, radicandSel]
      } = spliceMqTreeSeveral(parent.containingSelection(), [
        node.index?.children ?? [],
        node.radicand.children
      ]);
      const selection = prop === 'index' ? indexSel : radicandSel;
      const point = getSelectionSide(selection, dir);

      return (
        model
          .withRootAndSelection(root, makePointSelection(point))
          // Here we just queue "StartRoot," because only the root itself is deleted;
          // the index and radicand are left behind.
          .withAriaQueueItem(localize('mq-narration-start-root') + ',')
      );
    }
    case 'summation': {
      // Replace \sum_{sub}^{sup} with `subsup`, and put the cursor
      // left/right of sub or left/right of sup.
      const prop = supsubPropName(node, index);
      // Replace `\sqrt[index]{radicand}` with `indexradicand`, and put
      // cursor left/right of 'index' or left/right of 'radicand'.
      const {
        root,
        insertedSelections: [subSel, supSel]
      } = spliceMqTreeSeveral(parent.containingSelection(), [
        node.sub.children,
        node.sup.children
      ]);

      const selection = prop === 'sub' ? subSel : supSel;
      const point = getSelectionSide(selection, dir);
      // Here we just queue "sum" or "product" because only the summation itself is deleted;
      // the upper bound and lower bound are left behind.
      const deleted = model.config.localize(summationMathspeakMap[node.kind]);

      return model
        .withRootAndSelection(root, makePointSelection(point))
        .withAriaQueueItem(deleted);
    }
    case 'brackets':
      return deleteSideOfBracket(model, parent as MqBrackets, dir, true);
    case 'supsub': {
      const prop = supsubPropName(node, index);
      if (prop === 'sup') {
        if (node.sub) {
          // Replace `_{sub}^{sup}` with `_{sub}sup`, and put cursor left/right of 'sup'.
          const newSub = new MqSupSub({
            sub: node.sub,
            sup: undefined
          });
          const {
            root,
            insertedSelections: [_subSel, supSel]
          } = spliceMqTreeSeveral(parent.containingSelection(), [
            [newSub],
            node.sup!.children
          ]);
          const point = getSelectionSide(supSel, dir);
          return model
            .withRootAndSelection(root, makePointSelection(point))
            .withAriaQueueItem(localize('mq-narration-superscript'));
        } else {
          // Replace `^{sup}` with `sup`, and put cursor left/right of 'sup'.
          const { root, insertedSelection } = spliceMqTree(
            parent.containingSelection(),
            node.sup!.children
          );
          const point = getSelectionSide(insertedSelection, dir);
          return model
            .withRootAndSelection(root, makePointSelection(point))
            .withAriaQueueItem(localize('mq-narration-superscript'));
        }
      } else {
        prop satisfies 'sub';
        if (node.sup) {
          // Replace `_{sub}^{sup}` with `sub^{sup}`, and put cursor left/right of 'sub'
          const newSup = new MqSupSub({
            sub: undefined,
            sup: node.sup
          });
          const {
            root,
            insertedSelections: [subSel, _supSel]
          } = spliceMqTreeSeveral(parent.containingSelection(), [
            node.sub!.children,
            [newSup]
          ]);
          const point = getSelectionSide(subSel, dir);
          return model
            .withRootAndSelection(root, makePointSelection(point))
            .withAriaQueueItem(localize('mq-narration-subscript'));
        } else {
          // Replace `_{sub}` with `sub`, and put cursor left/right of 'sub'.
          const { root, insertedSelection } = spliceMqTree(
            parent.containingSelection(),
            node.sub!.children
          );
          const point = getSelectionSide(insertedSelection, dir);
          return model
            .withRootAndSelection(root, makePointSelection(point))
            .withAriaQueueItem(localize('mq-narration-subscript'));
        }
      }
    }
    default:
      node satisfies never;
      throw new Error(`Invalid node: ${(node as any).type}`);
  }
}

// Corresponds to Bracket.deleteSide from old MQ. This implementation is much longer,
// mostly due to needing to map nodes through transactions, but also because it repeats
// some logic by copy-paste that old MQ repeated with some unintuitive control flow.
// (That unintuitive control flow actually led to a quirk documented below).
function deleteSideOfBracket(
  model: MqModel,
  bracket: MqBrackets,
  side: LeftOrRight,
  outward: boolean
): MqModel {
  const otherSide = swapDir(side);
  const { localize, autoOperatorNames } = model.config;
  const opts = { localize, autoOperatorNames };
  const deletedBracketMathspeak = getMathspeakForBracketSide(
    bracket,
    side,
    opts
  );

  {
    // Deleting a bracket when the matching bracket is a ghost; unwrap the whole bracket.
    if (bracket.ghostSide === otherSide) {
      const { root, insertedSelection } = unwrapBracket(bracket);
      const point = getSelectionSide(insertedSelection, side);
      return model
        .withRootAndSelection(root, makePointSelection(point))
        .withAriaQueueItem(deletedBracketMathspeak);
    }
  }

  {
    // (Example if deleting side='right'): The leftmost child of `bracket` is also a bracket node,
    // and its left side is a ghost, and its right-side bracket matches `bracket`'s left-side bracket.
    // Set `endChild`'s left-side bracket to `bracket`'s left-side bracket, and un-ghost it, then unwrap `bracket`.
    // For example, deleting the outer close-bracket of `[(1+2)+3]<!>`, where the inner open-paren is ghost.
    // That becomes `[1+2)+3<!>` if `[` and `)` are allowed to match.
    // This doesn't seem too relevant with restrictMismatchedBrackets='none', but maybe it affects ghosting behavior.
    const endChild = bracket.middle.lastChildInDir(otherSide);
    if (endChild?.type === 'brackets' && endChild.ghostSide === otherSide) {
      if (canCloseOpposing(model.config, bracket, endChild, side)) {
        // Close the ghost paren with my left paren, e.g.
        // `[(1+2)+3]<!>` becomes `[[1+2)+3]<!>`
        const { inserted: innerBrackets } = spliceMqTreeSingle(
          endChild.containingSelection(),
          closeOpposing(endChild, bracket, otherSide)
        );
        const mappedBrackets = innerBrackets.parent().parent() as MqBrackets;
        // `mappedBrackets` is what `bracketNode` gets mapped to.
        if (mappedBrackets.type !== 'brackets') {
          throw new Error('Programming Error: Incorrect mapping');
        }
        // Unwrap the paren, e.g. `[[1+2)+3]<!>` becomes `[1+2)+3<!>`
        const { root, insertedSelection } = unwrapBracket(mappedBrackets);
        const point = getSelectionSide(insertedSelection, side);
        return model
          .withRootAndSelection(root, makePointSelection(point))
          .withAriaQueueItem(deletedBracketMathspeak);
      }
    }
  }

  {
    // (Example if deleting side='right'): The parent of `bracket` is also a bracket node,
    // and its left side is a ghost, and its right-side bracket matches `bracket`'s left-side bracket.
    // Set `parent`'s left-side bracket to `bracket`'s left-side bracket, and un-ghost it, then unwrap `bracket`.
    // For example, deleting the inner close-paren of `[4+(1+2)<!>+3]`, where the outer open-bracket is ghost.
    // That becomes `4+(1+2<!>+3] if `(` and `]` are allowed to match.
    // This is relevent even if restrictMismatchedBrackets='none', since it turns
    // `(4+(1+2)<!>+3)` with the outer open-paren ghost into `4+(1+2+3)` where otherwise it would turn
    // into `(4+(1+2)<!>+3)` with both the outer open-paren and inner close-paren being ghosts.
    const parent = bracket.parent()?.parent();
    if (parent?.type === 'brackets' && parent.ghostSide === otherSide) {
      if (canCloseOpposing(model.config, parent, bracket, otherSide)) {
        const middle = parent.middle;
        const nodesA = sliceMqTree(
          makeSelection(
            middle.lastCursorInDir(otherSide),
            bracket.cursorOnSide(otherSide)
          )!
        );
        const nodesB = bracket.middle.children;
        const nodesC = sliceMqTree(
          makeSelection(
            bracket.cursorOnSide(side),
            middle.lastCursorInDir(side)
          )!
        );

        if (side === 'right') {
          // side=='right': `[A(B)<!>C]` then backspace (where the `[` is ghost) becomes `A(B<!>C]`
          const innerParen = mqBracketWithMiddle(
            closeOpposing(bracket, parent, 'right'),
            makeGroup(nodesB.concat(nodesC))
          );
          const { root, insertedSelection } = spliceMqTree(
            parent.containingSelection(),
            nodesA.concat(innerParen)
          );
          let point;
          if (outward && nodesC.length === 0) {
            // Following a quirk of old Mathquill; when C is empty this becomes `A(B]<!>`
            point = insertedSelection.right;
          } else {
            // Otherwise the cursor goes between B and C: `A(B<!>C]`
            const mappedInnerParen = insertedSelection.right.nodeBefore();
            if (mappedInnerParen !== innerParen) {
              throw new Error(
                'Programming Error: mapping not tracked correctly.'
              );
            }
            const middle = mappedInnerParen.middle;
            point = new Cursor(middle, nodesB.length);
          }
          return model
            .withRootAndSelection(root, makePointSelection(point))
            .withAriaQueueItem(deletedBracketMathspeak);
        } else {
          // side=='left': `[C<!>(B)A]` then delete (where the `]` is ghost) becomes `[C<!>B)A`
          const innerParen = mqBracketWithMiddle(
            closeOpposing(bracket, parent, 'left'),
            makeGroup(nodesC.concat(nodesB))
          );
          const { root, insertedSelection } = spliceMqTree(
            parent.containingSelection(),
            [innerParen as MqNode].concat(nodesA)
          );
          let point;
          if (outward && nodesC.length === 0) {
            // Following a quirk of old Mathquill; when C is empty this becomes `<!>[B)A`
            point = insertedSelection.left;
          } else {
            // Otherwise the cursor goes between B and C: `[C<!>B)A`
            const mappedInnerParen = insertedSelection.left.nodeAfter();
            if (mappedInnerParen !== innerParen) {
              throw new Error(
                'Programming Error: mapping not tracked correctly.'
              );
            }
            const middle = mappedInnerParen.middle;
            point = new Cursor(middle, nodesC.length);
          }
          return model
            .withRootAndSelection(root, makePointSelection(point))
            .withAriaQueueItem(deletedBracketMathspeak);
        }
      }
    }
  }

  {
    // else if deleting outward from a solid pair, unwrap
    if (outward && bracket.ghostSide === undefined) {
      const { root, insertedSelection } = unwrapBracket(bracket);
      const point = getSelectionSide(insertedSelection, side);
      return model
        .withRootAndSelection(root, makePointSelection(point))
        .withAriaQueueItem(deletedBracketMathspeak);
    }
  }

  {
    // else deleting just one of a pair of brackets, become one-sided, and auto-expand.
    const nodesB = bracket.middle.children;
    const farEnd = bracket.parent().lastCursorInDir(side);
    const nodesC = sliceMqTree(
      makeSelection(bracket.cursorOnSide(side), farEnd)!
    );
    const replacedSelection = makeSelection(
      bracket.cursorOnSide(swapDir(side)),
      farEnd
    )!;
    if (side === 'right') {
      // side=='right': `(B)<!>C` backspace becomes `(B<!>C)` where the `)` is ghost.
      const rightLatex = OPP_BRACKS[bracket.leftLatex];
      const rightSymbol = OPP_BRACKS[bracket.leftSymbol];
      if (rightLatex === undefined || rightSymbol === undefined) {
        throw new Error(
          'Programming error: Bracket not included in OPP_BRACKS'
        );
      }
      const newBrackets = new MqBrackets({
        leftLatex: bracket.leftLatex,
        leftSymbol: bracket.leftSymbol,
        rightLatex,
        rightSymbol,
        ghostSide: 'right',
        middle: makeGroup(nodesB.concat(nodesC))
      });
      const { root, inserted } = spliceMqTreeSingle(
        replacedSelection,
        newBrackets
      );
      let point;
      if (outward && nodesC.length === 0) {
        point = inserted.cursorOnSide('right');
      } else {
        point = new Cursor(inserted.middle, nodesB.length);
      }
      // TODO-mq-rewrite-quirk: if the deleted paren is a ghost paren, then there's actually
      // nothing deleted, so this aria is a little surprising. It could be more clear
      // to give the same aria alert as if you arrow-keyed past the ghost paren.
      return model
        .withRootAndSelection(root, makePointSelection(point))
        .withAriaQueueItem(deletedBracketMathspeak);
    } else {
      // side=='left': `C<!>(B)` delete becomes `(C<!>B)` where the `(` is ghost.
      const leftLatex = OPP_BRACKS[bracket.rightLatex];
      const leftSymbol = OPP_BRACKS[bracket.rightSymbol];
      if (leftLatex === undefined || leftSymbol === undefined) {
        throw new Error(
          'Programming error: Bracket not included in OPP_BRACKS'
        );
      }
      const newBrackets = new MqBrackets({
        leftLatex,
        leftSymbol,
        rightLatex: bracket.rightLatex,
        rightSymbol: bracket.rightSymbol,
        ghostSide: 'left',
        middle: makeGroup(nodesC.concat(nodesB))
      });
      const { root, inserted } = spliceMqTreeSingle(
        replacedSelection,
        newBrackets
      );
      let point;
      if (outward && nodesC.length === 0) {
        point = inserted.cursorOnSide('left');
      } else {
        point = new Cursor(inserted.middle, nodesC.length);
      }
      // TODO-mq-rewrite-quirk: if the deleted paren is a ghost paren, then there's actually
      // nothing deleted, so this aria is a little surprising. It could be more clear
      // to give the same aria alert as if you arrow-keyed past the ghost paren.
      return model
        .withRootAndSelection(root, makePointSelection(point))
        .withAriaQueueItem(deletedBracketMathspeak);
    }
  }
}
