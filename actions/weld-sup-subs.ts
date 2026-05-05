import { type MqModel } from '../mq-model';
import { concatGroups, type MqGroup, MqSupSub } from '../mq-nodes';
import { allGroupsInOrder } from '../node-traversal-order';
import { makeSameParentSelection } from '../selection';
import { someCursorSatisfies } from '../stash-cursors';

/** Weld together consecutive SupSubs, unless the cursor is between the SupSubs. */
export function weldSupSubs(model: MqModel): MqModel {
  while (true) {
    let didWeld = false;
    const selection = model.selection;

    outer: for (const group of allGroupsInOrder(model.root)) {
      const n = group.numChildren();
      for (let i = 0; i < n - 1; i++) {
        const aNode = group.nthChild(i)!;
        const bNode = group.nthChild(i + 1)!;

        if (aNode.type !== 'supsub') continue;
        if (bNode.type !== 'supsub') continue;

        if (
          [selection.left, selection.right, selection.anchor].some((cursor) =>
            aNode.cursorOnSide('right').eq(cursor)
          )
        ) {
          // Do not weld, since the cursor is between the two sup-subs.
          // E.g. the selection was `x^{2}y<!>^{3}` then the user did backspace
          // to get to `x^{2}<!>^{3}`. They intend to write `z` to get to `x^{2}z^{3}`.
          continue;
        }

        if (someCursorSatisfies(group, (index) => index === i + 1)) {
          // Do not weld, since some stashed cursor is here. At time of writing,
          // this could only be an `upDown` stashed cursor, such as when
          // the selection was `\frac{x^{2}y<!>^{3}}{abc}`, then the user did
          // backspace to get to `\frac{x^{2}<!>^{3}}{abc}`, then down to get to
          // `\frac{x^{2}^{3}}{ab<!>c}`
          continue;
        }

        model = model.withSplicedMqTree(
          makeSameParentSelection(group, i, i + 2),
          () => [weldSupSubPair(aNode, bNode)]
        );

        didWeld = true;
        break outer;
      }
    }
    if (!didWeld) {
      return model;
    }
  }
}

/** Passes stashed cursors through. */
export function weldSupSubPair(left: MqSupSub, right: MqSupSub): MqSupSub {
  return new MqSupSub({
    sub: weldMaybeGroupPair(left.sub, right.sub),
    sup: weldMaybeGroupPair(left.sup, right.sup)
  });
}

/** Passes stashed cursors through. */
function weldMaybeGroupPair(
  left: MqGroup | undefined,
  right: MqGroup | undefined
) {
  if (left && right) {
    return concatGroups(left, right);
  } else {
    return left ?? right ?? undefined;
  }
}
