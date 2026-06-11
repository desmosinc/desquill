import { type Cursor, type LeftOrRight, swapDir } from '../cursor.ts';
import type { MqConfig } from '../mq-config.ts';
import type { MqModel } from '../mq-model.ts';
import {
  makeGroup,
  mqBracketLatex,
  MqBrackets,
  mqBracketSymbol,
  mqBracketWithMiddle,
  mqBracketWithSymbol,
  type MqGroup
} from '../mq-nodes.ts';
import {
  getSelectionSide,
  isSelectionCollapsed,
  makePointSelection,
  makeSelection,
  sliceMqTree,
  spliceMqTree,
  spliceMqTreeSingle
} from '../selection.ts';

// This mapping works for both symbol and latex.
export const OPP_BRACKS: { [key in string]?: string } = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '\\{': '\\}',
  '\\}': '\\{',
  '&lang;': '&rang;',
  '&rang;': '&lang;',
  '\\langle ': '\\rangle ',
  '\\rangle ': '\\langle ',
  '|': '|',
  '\\lVert ': '\\rVert ',
  '\\rVert ': '\\lVert '
};

/**
 * After a bracket is typed, return the new model, together with the formed bracket node,
 * for the purpose of printing it in the case of absolute value.
 */
interface TypedBracket {
  model: MqModel;
  inserted: MqBrackets;
}

export function typeBracket(
  model: MqModel,
  /** sideTyped is 'left' for left brackets, 'right' for right brackets, and 'either' for `|` */
  sideTyped: LeftOrRight | 'either',
  leftSymbol: string,
  leftLatex: string,
  rightSymbol: string,
  rightLatex: string
): TypedBracket {
  // `(` and `|` always put themselves on the left when initially typed, and `)` always on the right.
  const sideTypedIfNew: LeftOrRight =
    sideTyped === 'either' ? 'left' : sideTyped;

  if (!isSelectionCollapsed(model.selection)) {
    // There's a selection; put that in the middle of the bracket,
    // and make nothing ghost
    return makeBracketAndPutCursorAfterSideTyped(
      model,
      leftSymbol,
      rightSymbol,
      leftLatex,
      rightLatex,
      sideTypedIfNew,
      undefined
    );
  }

  // Collapsed selection.
  const cursor = model.selection.head;

  // If before a Bracket, then try to fill in the ghost.
  if (sideTyped === 'left' || sideTyped === 'either') {
    const adjacentBracket = cursor.nodeAfter();
    if (adjacentBracket?.type === 'brackets') {
      // Try converting `<!>(wrapped)` to `(<!>wrapped)`
      const out = tryReplaceGhost(
        model,
        adjacentBracket,
        adjacentBracket.middle.firstCursor(),
        'left',
        leftSymbol,
        leftLatex
      );
      if (out) return out;
    }
  }

  // If after a Bracket, then try to fill in the ghost.
  if (sideTyped === 'right' || sideTyped === 'either') {
    const adjacentBracket = cursor.nodeBefore();
    if (adjacentBracket?.type === 'brackets') {
      // Try converting `(wrapped)<!>` to `(wrapped<!>)`
      const out = tryReplaceGhost(
        model,
        adjacentBracket,
        adjacentBracket.middle.lastCursor(),
        'right',
        rightSymbol,
        rightLatex
      );
      if (out) return out;
    }
  }

  // If inside a Bracket, then try to fill in the ghost.
  const parentBracket = cursor.group.parent();
  if (parentBracket?.type === 'brackets') {
    // Inside a bracket
    if (sideTyped === 'left' || sideTyped === 'either') {
      // Try converting `(unwrapped<!>wrapped)` to `unwrapped(<!>wrapped)`
      const out = tryReplaceGhost(
        model,
        parentBracket,
        cursor,
        'left',
        leftSymbol,
        leftLatex
      );
      if (out) return out;
    }
    if (sideTyped === 'right' || sideTyped === 'either') {
      // Try converting `(wrapped<!>unwrapped)` to `(wrapped)unwrapped`
      const out = tryReplaceGhost(
        model,
        parentBracket,
        cursor,
        'right',
        rightSymbol,
        rightLatex
      );
      if (out) return out;
    }
  }

  // There is no bracket to fill in the ghost for. Create an entirely new bracket node.
  // Auto-expand so ghost is at far end
  const farEndCursor = cursor.group.lastCursorInDir(swapDir(sideTypedIfNew));
  const replacedSelection = makeSelection(cursor, farEndCursor)!;
  model = model.withSelection(replacedSelection);
  return makeBracketAndPutCursorAfterSideTyped(
    model,
    leftSymbol,
    rightSymbol,
    leftLatex,
    rightLatex,
    sideTypedIfNew,
    swapDir(sideTypedIfNew)
  );
}

/**
 * Try filling in a left/right ghost, and putting the cursor after it.
 *
 * If sideTyped === 'left', this is converting `(unwrapped<!>wrapped)` to `unwrapped(<!>wrapped)`,
 * where the `(` was a ghost, and a `(` is typed.
 *
 * If sideTyped === 'right', this is converting `(wrapped<!>unwrapped)` to `(wrapped)unwrapped`,
 * where the `)` was a ghost, and a `)` is tyepd.
 */
function tryReplaceGhost(
  model: MqModel,
  bracketNode: MqBrackets,
  /** The typedCursor must be inside the bracketNode. */
  typedCursor: Cursor,
  sideTyped: LeftOrRight,
  typedSymbol: string,
  typedLatex: string
): TypedBracket | undefined {
  if (!typedCursor.group.eq(bracketNode.firstChild()!)) {
    throw new Error('Programming Error: typedCursor not inside bracketNode');
  }

  if (bracketNode.ghostSide !== sideTyped) {
    // If the `)` is not a ghost, you can't fill in a `)`.
    return undefined;
  }

  const leftSymbol =
    sideTyped === 'left' ? typedSymbol : bracketNode.leftSymbol;
  const rightSymbol =
    sideTyped === 'right' ? typedSymbol : bracketNode.rightSymbol;
  if (!matchBracket(model.config, leftSymbol, rightSymbol)) {
    // You can't fill in a `{` to match a `)`, typically.
    return undefined;
  }

  const sel = bracketNode.containingSelection();
  const middle = bracketNode.firstChild()!;
  const unwrapped = sliceMqTree(
    makeSelection(middle.lastCursorInDir(sideTyped), typedCursor)!
  );
  const wrapped = sliceMqTree(
    makeSelection(middle.lastCursorInDir(swapDir(sideTyped)), typedCursor)!
  );

  const { insertedSelection: unwrappedSelection } = spliceMqTree(
    sel,
    unwrapped
  );
  const { root, inserted: insertedBracket } = spliceMqTreeSingle(
    makePointSelection(
      getSelectionSide(unwrappedSelection, swapDir(sideTyped))
    ),
    mqBracketWithSymbol(
      mqBracketWithMiddle(bracketNode, makeGroup(wrapped)),
      sideTyped,
      typedSymbol,
      typedLatex
    )
  );
  let newPoint: Cursor;
  if (sideTyped === 'left') {
    const newMiddle = insertedBracket.middle;
    newPoint = newMiddle.firstCursor();
  } else {
    newPoint = insertedBracket.containingSelection().right;
  }
  model = model.withRootAndSelection(root, makePointSelection(newPoint));
  return { model, inserted: insertedBracket };
}

/**
 * Can `leftSymbol` be matched with `rightSymbol`?
 */
export function matchBracket(
  config: MqConfig,
  leftSymbol: string,
  rightSymbol: string
) {
  if (OPP_BRACKS[leftSymbol] == rightSymbol) {
    return true;
  }

  switch (config.restrictMismatchedBrackets) {
    case 'none':
      return false;
    case false:
    default:
      return true;
    case true:
      return (
        (leftSymbol === '(' && rightSymbol === ']') ||
        (leftSymbol === '[' && rightSymbol === ')')
      );
  }
}

/**
 * Can side `side` of the given `bracket` node be replaced with
 * side `side` of the given `newBracket` node?
 */
export function canCloseOpposing(
  config: MqConfig,
  bracket: MqBrackets,
  newBracket: MqBrackets,
  side: LeftOrRight
) {
  const leftSymbol =
    side === 'right' ? bracket.leftSymbol : newBracket.leftSymbol;
  const rightSymbol =
    side === 'right' ? newBracket.rightSymbol : bracket.rightSymbol;
  return matchBracket(config, leftSymbol, rightSymbol);
}

/**
 * Replace side `side` of the given `bracket` node with
 * side `side` of the given `newBracket` node
 */
export function closeOpposing(
  bracket: MqBrackets,
  newBracket: MqBrackets,
  side: LeftOrRight
) {
  return mqBracketWithSymbol(
    bracket,
    side,
    mqBracketSymbol(newBracket, side),
    mqBracketLatex(newBracket, side)
  );
}

export function fillBracketSide(
  bracket: MqBrackets,
  middle: MqGroup,
  side: LeftOrRight,
  symbol: string,
  latex: string
): MqBrackets {
  const newBrackets = {
    leftLatex: bracket.leftLatex,
    leftSymbol: bracket.leftSymbol,
    rightLatex: bracket.rightLatex,
    rightSymbol: bracket.rightSymbol,
    ghostSide: undefined,
    middle
  };
  if (side === 'left') {
    newBrackets.leftSymbol = symbol;
    newBrackets.leftLatex = latex;
  } else {
    newBrackets.rightSymbol = symbol;
    newBrackets.rightLatex = latex;
  }
  return new MqBrackets(newBrackets);
}

/** Wrap the model selection in parentheses, and put cursor after either the left bracket or the right bracket. */
function makeBracketAndPutCursorAfterSideTyped(
  model: MqModel,
  leftSymbol: string,
  rightSymbol: string,
  leftLatex: string,
  rightLatex: string,
  sideTyped: LeftOrRight,
  ghostSide: LeftOrRight | undefined
): TypedBracket {
  const selected = sliceMqTree(model.selection);
  const insert = new MqBrackets({
    leftLatex,
    leftSymbol,
    rightLatex,
    rightSymbol,
    ghostSide,
    middle: makeGroup(selected)
  });
  const { root, inserted } = spliceMqTreeSingle(model.selection, insert);
  if (sideTyped === 'right') {
    // Place cursor after the close paren.
    const point = inserted.cursorOnSide('right');
    model = model.withRootAndSelection(root, makePointSelection(point));
  } else {
    // Place cursor after the open paren.
    const middle = inserted.middle;
    const point = middle.firstCursor();
    model = model.withRootAndSelection(root, makePointSelection(point));
  }
  return { model, inserted };
}
