import { doesMarkEndAtNode } from './mq-marks';
import type { MqChar, MqGroup, MqNode, MqStyleCmd } from './mq-nodes';

const disallowNextBinaryOperator: { [key: string]: true | undefined } = {
  ',': true,
  ';': true,
  ':': true
};

const maybeUnaryOperator: { [key: string]: true | undefined } = {
  '+': true,
  '-': true,
  '\\pm': true,
  '\\mp': true
};

const binaryOperator: { [key: string]: true | undefined } = {
  '+': true,
  '-': true,
  '=': true,
  '<': true,
  '>': true,

  '\\ge': true,
  '\\le': true,

  '\\sim': true,
  '\\approx': true,
  '\\to': true,
  '\\ne': true,
  '\\cong': true,
  '\\ncong': true,
  '\\pm': true,
  '\\mp': true,
  '\\times': true,
  '\\div': true,

  '\\cdot': true
};

/**
 * Return true if:
 * - node is BinaryOperator (+, ×, -, etc), including PlusMinus which could
 *   sometimes be interpreted as unary, or
 * - node ends an infix word like "for" specified in `infixOperatorNames`
 */
export function nodeEndsBinaryOperator(
  node: MqNode,
  group: MqGroup,
  index: number
): boolean {
  if (node.type !== 'char') return false;

  if (binaryOperator[node.latex]) return true;

  if (doesMarkEndAtNode(group.marks.mutable_infixOperatorName, index)) {
    return true;
  }

  return false;
}

function getGroupAndNodeIndex(node: MqNode) {
  const group = node.parent();
  if (group?.type === 'group') {
    const index = node.getIndex();
    if (index !== -1) return { group, index };
  }
  throw new Error('could not find groupAndIndex');
}

// Binary operator determination is used in several contexts for PlusMinus nodes and their descendants.
// For instance, we set the item's class name based on this factor, and also assign different mathspeak values (plus vs positive, negative vs minus).
function plusMinusIsBinaryOperator(node: MqChar | MqStyleCmd): boolean {
  const nodeL = node.prevSibling();
  if (nodeL) {
    const { group, index } = getGroupAndNodeIndex(nodeL);
    // If the left sibling is a binary operator or a separator (comma, semicolon, colon, space),
    // consider the operator to be unary
    if (
      nodeEndsBinaryOperator(nodeL, group, index) ||
      doesMarkEndAtNode(group.marks.mutable_prefixOperatorName, index) ||
      (nodeL.type !== 'brackets' &&
        nodeL.type === 'char' &&
        /^(\\ )|[,;:\(\[]$/.test(nodeL.latex))
    ) {
      return false;
    }
    return true;
  }

  const nodePP = node.parent()?.parent();
  if (nodePP && nodePP.type === 'style-cmd' && nodePP.val === '\\textcolor') {
    //if we are in a style block at the leftmost edge, determine unary/binary based on
    //the style block
    //this allows style blocks to be transparent for unary/binary purposes
    return plusMinusIsBinaryOperator(nodePP);
  } else {
    // This is reached when `node` is the first element in the MathBlock, for
    // example `node` is after an open bracket. E.g. `node` is "-" inside "(-5)".
    // Then `nodeL` is undefined since `node` is the start of the block.
    return false;
  }
}

export function shouldDisplayAsBinaryOperator(node: MqNode) {
  if (node.type !== 'char') return false;

  const val = node.latex;
  if (val === '+' || val === '-' || val === '\\pm' || val === '\\mp')
    return plusMinusIsBinaryOperator(node);

  // must decide if unary or binary operator
  if (maybeUnaryOperator[val]) {
    const nodeL = node.prevSibling();
    if (nodeL && nodeL.type === 'char') {
      const prevChar = nodeL.latex;
      if (!binaryOperator[prevChar] && !disallowNextBinaryOperator[prevChar]) {
        return true;
      }
    }

    return false;
  }

  return !!binaryOperator[val];
}
