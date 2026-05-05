import { shouldDisplayAsBinaryOperator } from './binary-operators';
import type { LeftOrRight } from './cursor';
import type { KeysWithNoVariables } from './dictionary-types-generated';
import type { AutoOperatorNames } from './mq-config';
import { localizableNumericValue, type LocalizeFunction } from './mq-i18n';
import { doesMarkEndAtNode, doesMarkStartAtNode } from './mq-marks';
import {
  fracOrBinomPropName,
  type MqBrackets,
  mqBracketSymbol,
  type MqFrac,
  type MqGroup,
  type MqNode,
  type MqNonGroup,
  type MqSqrt,
  type MqStyleCmd,
  type MqSummation,
  type MqSupSub,
  sqrtPropName,
  supsubPropName
} from './mq-nodes';
import { isSelectionCollapsed, type MqSelection } from './selection';
import { isTextBlock } from './style-commands';

interface MathspeakOptions {
  readonly ignoreShorthand?: boolean;
  readonly autoOperatorNames: AutoOperatorNames;
  readonly localize: LocalizeFunction;
}

const mathspeakMap: { [key: string]: KeysWithNoVariables | '' | undefined } = {
  '-': 'mq-narration-minus',
  '+': 'mq-narration-plus',
  '?': 'mq-narration-question-mark',
  '<': 'mq-narration-less-than',
  '>': 'mq-narration-greater-than',
  '\\ge': 'mq-narration-greater-than-or-equal-to',
  '\\le': 'mq-narration-less-than-or-equal-to',
  '\\sim': 'mq-narration-tilde',
  '=': 'mq-narration-equals',
  '\\approx': 'mq-narration-approximately-equal',
  '\\ne': 'mq-narration-not-equal',
  '\\ ': '',
  "'": 'mq-narration-prime',
  '″': 'mq-narration-double-prime',
  '\\pm': 'mq-narration-plus-or-minus',
  '\\mp': 'mq-narration-minus-or-plus',
  '\\cdot': 'mq-narration-times',
  '\\infty': 'mq-narration-infinity',
  '\\degree': 'mq-narration-degrees',
  '\\cong': 'mq-narration-congruent',
  '\\ncong': 'mq-narration-not-congruent',
  '\\$': 'mq-narration-dollar',
  '\\nparallel': 'mq-narration-not-parallel',
  '\\perp': 'mq-narration-perpendicular',
  '\\div': 'mq-narration-divided-by',
  '\\bigcirc': 'mq-narration-circle',
  '\\measuredangle': 'mq-narration-measured-angle',
  '\\nsim': 'mq-narration-not-similar',
  '\\Upsilon': 'mq-narration-capital-upsilon',

  // This is specifically for mapping \tildeNbsp back to an empty string. The real outputted ~ would be a `\sim` here.
  '~': ''
};

function mapSymbolToMathSpeak(symbol: string, localize: LocalizeFunction) {
  const mapped = mathspeakMap[symbol];
  if (mapped === '') return '';
  if (mapped !== undefined) return localize(mapped);

  if (symbol.startsWith('\\')) {
    return symbol.slice(1);
  }

  return symbol;
}

function cleanupMathSpeak(mathspeak: string) {
  // condense multiple spaces
  mathspeak = mathspeak.replace(/ +/g, ' ');

  // For Apple devices in particular, split out digits after a decimal point so they aren't read aloud as whole words.
  // Not doing so makes 123.456 potentially spoken as "one hundred twenty-three point four hundred fifty-six."
  // Instead, add spaces so it is spoken as "one hundred twenty-three point four five six."
  mathspeak = mathspeak.replace(/(\.)([0-9]+)/g, (_match, p1, p2) => {
    return p1 + p2.split('').join(' ').trim();
  });

  return mathspeak.trim();
}

export function computeFinalMathspeak(
  ariaLabel: string,
  rootMathspeak: string,
  ariaPostLabel: string
) {
  const labelWithSuffix = /[A-Za-z0-9]$/.test(ariaLabel)
    ? ariaLabel + ':'
    : ariaLabel;

  const mathspeak = labelWithSuffix + ' ' + rootMathspeak + ' ' + ariaPostLabel;

  return mathspeak.trim();
}

export function getMathspeak(node: MqNode, opts: MathspeakOptions) {
  const mathspeak =
    node.type === 'group'
      ? getMathspeakForGroup(node, opts)
      : getMathspeakForNonGroup(node, opts);
  // For Apple devices in particular, split out digits after a decimal point so they aren't read aloud as whole words.
  // Not doing so makes 123.456 potentially spoken as "one hundred twenty-three point four hundred fifty-six."
  // Instead, add spaces so it is spoken as "one hundred twenty-three point four five six."
  return cleanupMathSpeak(mathspeak);
}

export function getBareMathspeakForSelection(
  selection: MqSelection,
  opts: MathspeakOptions
) {
  if (isSelectionCollapsed(selection)) {
    return '';
  }
  let str = '';
  for (let i = selection.left.index; i < selection.right.index; i++) {
    const node = selection.left.group.nthChild(i)!;
    str += getMathspeak(node, opts) + ' ';
  }
  return str.trim();
}

export function getMathspeakForSelection(
  selection: MqSelection,
  opts: MathspeakOptions
) {
  const mathSpeak = getBareMathspeakForSelection(selection, opts);
  return mathSpeak === ''
    ? opts.localize('mq-narration-nothing-selected')
    : mathSpeak + ' ' + opts.localize('mq-narration-selected');
}

function getMathspeakForGroup(group: MqGroup, opts: MathspeakOptions) {
  let out = '';
  let partialOperatorName = '';
  const numChildren = group.numChildren();
  for (let i = 0; i < numChildren; i++) {
    const child = group.nthChild(i)!;
    if (child.type === 'char') {
      if (doesMarkStartAtNode(group.marks.mutable_operatorName, i)) {
        partialOperatorName += child.latex;
        continue;
      } else if (doesMarkEndAtNode(group.marks.mutable_operatorName, i)) {
        partialOperatorName += child.latex;
        // TODO-mq-rewrite-quirk -- we actually want to put a space between these operatornames but old mathquill does not
        // do that. We are concatenating them all together only for comparison purposes.
        if (!doesMarkStartAtNode(group.marks.mutable_operatorName, i + 1)) {
          // This will convert things like "cos" to "cosine" by looking up the mathspeak for the autoOperatorName.
          let operatorNameMathspeak = '';
          const key = opts.autoOperatorNames?.get(partialOperatorName);
          if (typeof key == 'string' && key.startsWith('mq-narration-op')) {
            operatorNameMathspeak = opts.localize(key as KeysWithNoVariables);
          } else if (typeof key == 'string' && key != '') {
            operatorNameMathspeak = key;
          }
          out += operatorNameMathspeak || partialOperatorName;
          out += ' ';
          partialOperatorName = '';
        }
        continue;
      } else if (partialOperatorName) {
        partialOperatorName += child.latex;
        continue;
      }
    }

    const childMathspeak = getMathspeakForNonGroup(child, opts);
    const cmdText = child.type === 'char' ? child.latex : '';

    if (
      cmdText.length !== 1 ||
      (!/^[0-9.]$/.test(cmdText) && !isParentTextBlock(group))
    ) {
      out += ' ' + childMathspeak + ' ';
    } else {
      out += childMathspeak;
    }
  }
  return out;
}

function isParentTextBlock(group: MqGroup) {
  const groupPP = group.parent();
  return groupPP && isTextBlock(groupPP);
}

function getMathspeakForNonGroup(
  node: MqNonGroup,
  opts: MathspeakOptions
): string {
  switch (node.type) {
    case 'ans':
      return ' ans';

    case 'percentof':
      return ' ' + opts.localize('mq-narration-percent-of') + ' ';

    case 'style-cmd':
      return getMathspeakForStyleCmd(node, opts);

    case 'summation':
      return getMathspeakForSummation(node, opts);

    case 'token': {
      // If the caller responsible for creating this token has set an aria-label attribute
      // for the inner children, use them in the mathspeak calculation.
      const domNode = node.getDomNode();
      if (domNode) {
        const labels = [];
        for (const el of domNode.children) {
          const label = el.getAttribute('aria-label');
          if (typeof label === 'string' && label !== '') {
            labels.push(label.trim());
          }
        }
        if (labels.length > 0) {
          return labels.join(' ');
        }
      }
      return ' ' + opts.localize('mq-narration-token') + ' ' + node.id;
    }

    case 'brackets':
      return getMathspeakForBrackets(node, opts);

    case 'sqrt':
      return getMathspeakForSqrt(node, opts);

    case 'binom': {
      const num = getMathspeakForGroup(node.num, opts);
      const den = getMathspeakForGroup(node.den, opts);
      return opts.localize('mq-narration-binomial', { num, den });
    }

    case 'frac':
      return getMathspeakForFrac(node, opts);

    case 'supsub':
      return getMathspeakForSupSub(node, opts);

    case 'char':
      const isBinaryOperator = shouldDisplayAsBinaryOperator(node);
      if (node.latex === '-' && !isBinaryOperator) {
        return ' ' + opts.localize('mq-narration-negative');
      } else if (node.latex === '+' && !isBinaryOperator) {
        return ' ' + opts.localize('mq-narration-positive');
      }

      if (/^[a-z]$/i.test(node.latex)) {
        return !isParentTextBlock(node.parent())
          ? `"${node.latex}"`
          : node.latex;
      }

      return mapSymbolToMathSpeak(node.latex, opts.localize);

    default:
      node satisfies never;
      return '';
  }
}

export const summationMathspeakMap = {
  '\\int': 'mq-narration-integral',
  '\\sum': 'mq-narration-sum',
  '\\prod': 'mq-narration-product',
  '\\coprod': 'mq-narration-co-product'
} as const;
function getMathspeakForSummation(
  summation: MqSummation,
  opts: MathspeakOptions
) {
  const kind = opts.localize(summationMathspeakMap[summation.kind]);
  const start = getMathspeakForGroup(summation.sub, opts);
  const end = getMathspeakForGroup(summation.sup, opts);
  return opts.localize('mq-narration-summation', { kind, start, end });
}

const bracketMathspeakMap: { [key: string]: KeysWithNoVariables } = {
  '(': 'mq-narration-parenthesis',
  ')': 'mq-narration-parenthesis',
  '|': 'mq-narration-pipe',
  '{': 'mq-narration-brace',
  '}': 'mq-narration-brace',
  '[': 'mq-narration-bracket',
  ']': 'mq-narration-bracket',
  langle: 'mq-narration-angle-bracket',
  rangle: 'mq-narration-angle-bracket',
  lVert: 'mq-narration-double-vertical-line',
  rVert: 'mq-narration-double-vertical-line'
} as const;

export function getMathspeakForBracketSide(
  brackets: MqBrackets,
  side: LeftOrRight,
  opts: MathspeakOptions
) {
  const symbol = mqBracketSymbol(brackets, side);
  const bracketKey = bracketMathspeakMap[symbol];
  if (!bracketKey) return '';
  const bracket = opts.localize(bracketKey);

  const { leftSymbol, rightSymbol } = brackets;
  if (leftSymbol === '|' && rightSymbol === '|') {
    return opts.localize(
      side === 'left'
        ? 'mq-narration-absolute-value-start'
        : 'mq-narration-absolute-value-end'
    );
  }

  return side === 'left'
    ? opts.localize('mq-narration-left', { bracket })
    : opts.localize('mq-narration-right', { bracket });
}

function getMathspeakForBrackets(brackets: MqBrackets, opts: MathspeakOptions) {
  const { leftSymbol, rightSymbol } = brackets;
  const leftMathspeak = opts.localize(bracketMathspeakMap[leftSymbol]);
  const rightMathspeak = opts.localize(bracketMathspeakMap[rightSymbol]);

  if (leftSymbol === '|' && rightSymbol === '|') {
    return [
      '',
      opts.localize('mq-narration-absolute-value-start') + ',',
      getMathspeakForGroup(brackets.middle, opts) + ',',
      opts.localize('mq-narration-absolute-value-end')
    ].join(' ');
  }

  return [
    '',
    opts.localize('mq-narration-left', { bracket: leftMathspeak ?? '' }) + ',',
    getMathspeakForGroup(brackets.middle, opts) + ' ,',
    opts.localize('mq-narration-right', { bracket: rightMathspeak ?? '' })
  ].join(' ');
}

function getMathspeakForSqrt(sqrt: MqSqrt, opts: MathspeakOptions) {
  const radicand = getMathspeakForGroup(sqrt.radicand, opts);
  if (sqrt.index) {
    if (
      sqrt.index.children.length === 1 &&
      sqrt.index.children[0].type === 'char' &&
      sqrt.index.children[0].latex === '3'
    ) {
      return ' ' + opts.localize('mq-narration-cube-root', { radicand });
    } else {
      const index = getMathspeakForGroup(sqrt.index, opts);
      return ' ' + opts.localize('mq-narration-nth-root', { index, radicand });
    }
  }
  return ' ' + opts.localize('mq-narration-square-root', { radicand });
}

function getMathspeakForIntegerPower(group: MqGroup, opts: MathspeakOptions) {
  const innerText = maybeReadOnlyCharsFromGroup(group);
  if (!intRgx.test(innerText)) return undefined;
  if (opts?.ignoreShorthand) return undefined;

  if (innerText === '0') {
    return opts.localize('mq-narration-power-0');
  } else if (innerText === '2') {
    return opts.localize('mq-narration-power-squared');
  } else if (innerText === '3') {
    return opts.localize('mq-narration-power-cubed');
  }

  // Limit ordinal-suffix shorthand to exponents whose magnitude fits in 3 digits;
  // anything larger or non-numeric falls through to the long-form `power` message.
  const ordinalMatch = /^([+-]?)(\d{1,3})$/.exec(innerText);
  if (ordinalMatch) {
    const [, sign, magnitudeText] = ordinalMatch;
    const magnitude = parseInt(magnitudeText, 10);
    // @fluent/bundle 0.19 silently drops `NUMBER(x, type: "ordinal")`, so we drive the
    // selector on a plain CLDR ordinal category string computed by the localize function
    // (which is bound to the active language).
    const category = opts.localize.ordinalCategory(magnitude);
    const power = `${magnitude}`;
    return sign === '-'
      ? opts.localize('mq-narration-power-negative-ordinal', {
          power,
          category
        })
      : opts.localize('mq-narration-power-ordinal', { power, category });
  }

  const power = getMathspeakForGroup(group, opts);
  return opts.localize('mq-narration-power', { power });
}

function getMathspeakForSupSub(supsub: MqSupSub, opts: MathspeakOptions) {
  let out = '';

  if (supsub.sub) {
    const sub = getMathspeakForGroup(supsub.sub, opts);
    out += ' ' + opts.localize('mq-narration-sub', { sub }) + ' ';
  }

  if (supsub.sup) {
    const integerMathspeak = getMathspeakForIntegerPower(supsub.sup, opts);
    if (integerMathspeak) {
      out += integerMathspeak;
    } else {
      const sup = getMathspeakForGroup(supsub.sup, opts);
      out += ' ' + opts.localize('mq-narration-sup', { sup }) + ' ';
    }
  }

  return out;
}

export function getAriaLabelForStyleCmd(
  styleCmd: MqStyleCmd,
  opts: MathspeakOptions
) {
  switch (styleCmd.val) {
    case '\\textcolor':
      return ' ' + styleCmd.styleParam;

    case '\\mathbf':
      return opts.localize('mq-narration-bold-font');

    case '\\mathit':
      return opts.localize('mq-narration-italic-font');

    case '\\mathrm':
      // intentionally no wrapper for this one
      return '';

    case '\\mathsf':
      return opts.localize('mq-narration-serif-font');

    case '\\mathtt':
      return opts.localize('mq-narration-math-text');

    case '\\overarc':
      return opts.localize('mq-narration-over-arc');

    case '\\overleftarrow':
      return opts.localize('mq-narration-over-left-arrow');

    case '\\overleftrightarrow':
      return opts.localize('mq-narration-over-left-and-right-arrow');

    case '\\overline':
      return opts.localize('mq-narration-overline');

    case '\\overrightarrow':
      return opts.localize('mq-narration-over-right-arrow');

    case '\\underline':
      return opts.localize('mq-narration-underline');

    case '\\dot':
    case '\\tilde':
    case '\\hat':
    case '\\vec':
      // TODO-mq-localize: this is just raw '\vec' right now.
      // Not relevant to Desmos, but Amplify may be using these latexes.
      return styleCmd.val;

    default:
      styleCmd.val satisfies never;
      return '';
  }
}

function getMathspeakForStyleCmd(styleCmd: MqStyleCmd, opts: MathspeakOptions) {
  const middleMathspeak = getMathspeakForGroup(styleCmd.arg, opts);

  const wrapper = getAriaLabelForStyleCmd(styleCmd, opts);

  const startWrapper =
    wrapper === styleCmd.val ? 'Start' + wrapper : 'Start' + wrapper + ',';
  // TODO-mq-rewrite-quirk -- reproduce a bug in old mq
  const endWrapper = wrapper === styleCmd.val ? 'undefined' : 'End' + wrapper;

  if (wrapper) {
    return startWrapper + ' ' + middleMathspeak + ' ' + endWrapper;
  } else {
    return middleMathspeak;
  }
}

function maybeReadOnlyCharsFromGroup(group: MqGroup) {
  let charText = '';

  for (const child of group.children) {
    if (child.type !== 'char') return '';
    charText += child.latex;
  }

  return charText;
}

// This test is used to determine whether an item may be treated as a whole number
// for shortening the verbalized (mathspeak) forms of some fractions and superscripts.
const intRgx = /^[\+\-]?[\d]+$/;

function getMathspeakForFrac(frac: MqFrac, opts: MathspeakOptions) {
  const numText = maybeReadOnlyCharsFromGroup(frac.num);
  const denText = maybeReadOnlyCharsFromGroup(frac.den);
  const num = getMathspeakForGroup(frac.num, opts);
  const den = getMathspeakForGroup(frac.den, opts);
  let fraction =
    frac.mutable_fracDepth && frac.mutable_fracDepth > 1
      ? opts.localize('mq-narration-fraction-nested', { num, den })
      : opts.localize('mq-narration-fraction', { num, den });

  // Shorten mathspeak value for whole number fractions whose denominator has a special spoken form.
  if (!opts?.ignoreShorthand && intRgx.test(numText) && intRgx.test(denText)) {
    let numPrefix = '';
    if (numText[0] == '-') numPrefix = opts.localize('mq-narration-negative');
    if (numText[0] == '+') numPrefix = opts.localize('mq-narration-positive');
    fraction = opts.localize('mq-narration-fraction-shorthand', {
      num: localizableNumericValue(Math.abs(parseInt(numText))),
      den: localizableNumericValue(parseInt(denText)),
      numPrefix,
      full: fraction
    });
  }
  // Handle the case of an integer followed by a simplified fraction such as 1\frac{1}{2}.
  // Such combinations should be spoken aloud as "1 and 1 half."
  // Start at the left sibling of the fraction and continue leftward until something other than a digit or whitespace is found.
  let sawDigit = false;

  let sibling;
  // Scan until you see something other than a digit or space
  for (
    sibling = frac.prevSibling();
    sibling?.type === 'char' &&
    (sibling.latex === '\\ ' || intRgx.test(sibling.latex));
    sibling = sibling.prevSibling()
  ) {
    if (intRgx.test(sibling.latex)) {
      sawDigit = true;
    }
  }
  const lastNodeSeen = sibling;

  // `precededByInteger` is true if everything we saw while scanning is digits and spaces, and
  // we saw at least one digit.
  const precededByInteger =
    sawDigit && !(lastNodeSeen?.type === 'char' && lastNodeSeen.latex === '.');
  return precededByInteger
    ? ' ' + opts.localize('mq-narration-fraction-and') + ' ' + fraction
    : fraction;
}

/**
 * ARIA label of a block can be found by putting the cursor in the block,
 * then doing Home or End to jump to an end of the block.
 * E.g. Home/End in the denominator of `\frac{1}{2}` says
 * "beginning of denominator 2" rather than "beginning of 2".
 * The ARIA label is "denominator".
 */
export function ariaLabelOfNthChild(
  node: MqNonGroup,
  n: number,
  opts: MathspeakOptions
): string {
  switch (node.type) {
    case 'char':
    case 'percentof':
    case 'ans':
    case 'token':
      return '';
    case 'brackets':
      if (node.leftLatex === '|' && node.rightLatex === '|') {
        return opts.localize('mq-narration-absolute-value');
      }
      const bracket = opts.localize(bracketMathspeakMap[node.leftLatex]);
      return opts.localize('mq-narration-block', { bracket });
    case 'sqrt':
      if (node.index === undefined) {
        return opts.localize('mq-narration-root');
      }
      return opts.localize(
        sqrtPropName(node, n) === 'index'
          ? 'mq-narration-index'
          : 'mq-narration-radicand'
      );
    case 'binom':
      return opts.localize(
        fracOrBinomPropName(node, n) === 'num'
          ? 'mq-narration-index-upper'
          : 'mq-narration-index-lower'
      );
    case 'frac':
      return opts.localize(
        fracOrBinomPropName(node, n) === 'num'
          ? 'mq-narration-numerator'
          : 'mq-narration-denominator'
      );
    case 'supsub':
      return opts.localize(
        supsubPropName(node, n) === 'sub'
          ? 'mq-narration-subscript'
          : 'mq-narration-superscript'
      );
    case 'summation':
      return opts.localize(
        supsubPropName(node, n) === 'sub'
          ? 'mq-narration-bound-lower'
          : 'mq-narration-bound-upper'
      );
    case 'style-cmd':
      return getAriaLabelForStyleCmd(node, opts);
    default:
      node satisfies never;
      throw new Error(`Invalid node: ${(node as any).type}`);
  }
}
