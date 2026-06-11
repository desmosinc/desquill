import { shouldDisplayAsBinaryOperator } from './binary-operators.ts';
import { computeDigitGroupingClasses } from './digit-grouping.ts';
import { affectsRenderProps, type MqRenderConfig } from './mq-config.ts';
import type { FocusState } from './mq-controller.ts';
import {
  doesMarkEndAtNode,
  doesMarkSetContainNode,
  doesMarkStartAtNode
} from './mq-marks.ts';
import type { MqModel } from './mq-model.ts';
import type {
  GroupMarks,
  MqBinom,
  MqBrackets,
  MqFrac,
  MqGroup,
  MqNode,
  MqSqrt,
  MqStyleCmd,
  MqSummation,
  MqSupSub,
  MqToken
} from './mq-nodes.ts';
import { isSelectionCollapsed, type MqSelection } from './selection.ts';
import { createStyleContainerNode } from './style-commands.ts';
import {
  mapSymbolToClassName,
  mapSymbolToDOMTag,
  mapSymbolToStyle,
  mapSymbolToText,
  stringReplace
} from './symbol-render-table.ts';
import { isEqual, pick } from './vendor/underscore.js';

export type MQRenderContext = {
  config: MqRenderConfig;
  digitGroupingMap: Map<MqNode, string | undefined>;
  /** Depth including the fraction itself. */
  mathspeakFracDepth: number;
  /** Tokens from the previous render. */
  previousTokenNodes: ReadonlyMap<MqNode, HTMLElement>;
  /** Tokens from the current render. */
  currentTokenNodes: Map<MqNode, HTMLElement>;
};

type SVGSymbol = {
  width: string;
  html: string;
};

const SVGSymbols: { [key: string]: SVGSymbol } = {
  sqrt: {
    width: '',
    html: `<svg preserveAspectRatio="none" viewBox="0 0 32 54"><path d="M0 33 L7 27 L12.5 47 L13 47 L30 0 L32 0 L13 54 L11 54 L4.5 31 L0 33" /></svg>`
  },
  '|': {
    width: '.4em',
    html: `<svg preserveAspectRatio="none" viewBox="0 0 10 54"><path d="M4.4 0 L4.4 54 L5.6 54 L5.6 0" /></svg>`
  },
  '[': {
    width: '.55em',
    html: `<svg preserveAspectRatio="none" viewBox="0 0 11 24"><path d="M8 0 L3 0 L3 24 L8 24 L8 23 L4 23 L4 1 L8 1" /></svg>`
  },
  ']': {
    width: '.55em',
    html: `<svg preserveAspectRatio="none" viewBox="0 0 11 24"><path d="M3 0 L8 0 L8 24 L3 24 L3 23 L7 23 L7 1 L3 1" /></svg>`
  },
  '(': {
    width: '.55em',
    html: `<svg preserveAspectRatio="none" viewBox="3 0 106 186"><path d="M85 0 A61 101 0 0 0 85 186 L75 186 A75 101 0 0 1 75 0" /></svg>`
  },
  ')': {
    width: '.55em',
    html: `<svg preserveAspectRatio="none" viewBox="3 0 106 186"><path d="M24 0 A61 101 0 0 1 24 186 L34 186 A75 101 0 0 0 34 0" /></svg>`
  },
  '{': {
    width: '.7em',
    html: `<svg preserveAspectRatio="none" viewBox="10 0 210 350"><path d="M170 0 L170 6 A47 52 0 0 0 123 60 L123 127 A35 48 0 0 1 88 175 A35 48 0 0 1 123 223 L123 290 A47 52 0 0 0 170 344 L170 350 L160 350 A58 49 0 0 1 102 301 L103 220 A45 40 0 0 0 58 180 L58 170 A45 40 0 0 0 103 130 L103 49 A58 49 0 0 1 161 0" /></svg>`
  },
  '}': {
    width: '.7em',
    html: `<svg preserveAspectRatio="none" viewBox="10 0 210 350"><path d="M60 0 L60 6 A47 52 0 0 1 107 60 L107 127 A35 48 0 0 0 142 175 A35 48 0 0 0 107 223 L107 290 A47 52 0 0 1 60 344 L60 350 L70 350 A58 49 0 0 0 128 301 L127 220 A45 40 0 0 1 172 180 L172 170 A45 40 0 0 1 127 130 L127 49 A58 49 0 0 0 70 0" /></svg>`
  },
  lVert: {
    width: '.7em',
    html: `<svg preserveAspectRatio="none" viewBox="0 0 10 54"><path d="M3.2 0 L3.2 54 L4 54 L4 0 M6.8 0 L6.8 54 L6 54 L6 0" /></svg>`
  },
  rVert: {
    width: '.7em',
    html: `<svg preserveAspectRatio="none" viewBox="0 0 10 54"><path d="M3.2 0 L3.2 54 L4 54 L4 0 M6.8 0 L6.8 54 L6 54 L6 0" /></svg>`
  },
  langle: {
    width: '.55em',
    html: `<svg preserveAspectRatio="none" viewBox="0 0 10 54"><path d="M6.8 0 L3.2 27 L6.8 54 L7.8 54 L4.2 27 L7.8 0" /></svg>`
  },
  rangle: {
    width: '.55em',
    html: `<svg preserveAspectRatio="none" viewBox="0 0 10 54"><path d="M3.2 0 L6.8 27 L3.2 54 L2.2 54 L5.8 27 L2.2 0" /></svg>`
  }
};

export function createNode(
  parent: HTMLElement,
  type: 'div' | 'span' | 'var' | 'sup' | 'big' | 'i' | 'b',
  text: string,
  opts?: {
    className?: string;
    style?: string;
  }
) {
  const node = document.createElement(type);
  if (text[0] === '&' && text[text.length - 1] === ';') {
    node.innerHTML = text;
  } else {
    node.textContent = text;
  }

  parent.appendChild(node);

  if (opts?.style) {
    node.setAttribute('style', opts.style);
  }

  const className = opts?.className;
  if (className) node.className = className;
  return node;
}

function createBaselineSpacer(parent: HTMLElement) {
  createNode(parent, 'span', '&#8203;', {
    style: 'display:inline-block;width:0'
  });
}

function renderGroupOrShowEmpty(
  ctx: MQRenderContext,
  parent: HTMLElement,
  group: MqGroup | undefined
) {
  if (!group || group.children.length === 0) {
    parent.className += ' dcg-mq-empty';
    if (group) {
      group.mutable_domNode = parent;
      group.mutable_domChildren = [];
    }
  } else {
    renderGroup(ctx, group, parent);
  }
}

function renderGroup(
  ctx: MQRenderContext,
  group: MqGroup,
  groupParent: HTMLElement
) {
  // This is another type of mark. I think it probably is 100% render-only so
  // I'm implementing that during the render pass. We should eventually think about the role of marks
  // and where they should be computed. It seems like we keep finding new types of marks that are unique
  // in some way and we aren't converging on a definite answer.
  // This could be moved to `computeEllipsisMarks`.
  computeDigitGroupingClasses(ctx, group.children);

  group.mutable_domNode = groupParent;
  group.mutable_domChildren = group.children.map((child, i) =>
    // Note renderGroupChild has side effects, specifically mutating `ctx` and adding children
    // to `groupParent`, so this relies on the .map going from first child to last child.
    renderGroupChild(ctx, groupParent, group, child, i)
  );

  return;
}

function renderGroupChild(
  ctx: MQRenderContext,
  parent: HTMLElement,
  group: MqGroup,
  child: MqNode,
  i: number
): HTMLElement {
  switch (child.type) {
    case 'char':
      let className = '';

      const isBinaryOperator = shouldDisplayAsBinaryOperator(child);
      if (isBinaryOperator) {
        className += ' dcg-mq-binary-operator';
      }

      const digitGroupingClassName = ctx.digitGroupingMap.get(child);
      if (digitGroupingClassName) {
        className += ' ' + digitGroupingClassName;
      }

      if (doesMarkStartAtNode(group.marks.ellipsis, i)) {
        className += ' dcg-mq-ellipsis-start';
      } else if (doesMarkEndAtNode(group.marks.ellipsis, i)) {
        className += ' dcg-mq-ellipsis-end';
      } else if (doesMarkSetContainNode(group.marks.ellipsis, i)) {
        className += ' dcg-mq-ellipsis-middle';
      }

      if (doesMarkStartAtNode(group.marks.mutable_operatorName, i)) {
        className += ' dcg-mq-operator-name';
        if (!shouldOmitPadding(group.children[i - 1])) {
          className += ' dcg-mq-first';
        }
      } else if (doesMarkEndAtNode(group.marks.mutable_operatorName, i)) {
        className += ' dcg-mq-operator-name';
        const nextChild = group.children[i + 1];
        if (!shouldOmitPadding(nextChild)) {
          if (nextChild?.type === 'supsub') {
            // do nothing here. The supsub will deal with this
          } else if (nextChild.type !== 'brackets') {
            className += ' dcg-mq-last';
          }
        }
      } else if (doesMarkSetContainNode(group.marks.mutable_operatorName, i)) {
        className += ' dcg-mq-operator-name';
      }

      const tag = mapSymbolToDOMTag(child.latex);
      const text = mapSymbolToText(child.latex) || child.latex;
      const style = mapSymbolToStyle(child.latex);
      const extraClassName = mapSymbolToClassName(child.latex);

      if (extraClassName) {
        if (text === 'f' && className) {
          // don't overwrite the explicit className for "f" is one is supplied.
        } else {
          className += ' ' + extraClassName;
        }
      }

      return createNode(parent, tag, text, {
        className,
        style
      });

    case 'ans':
      return createNode(parent, 'span', 'ans', {
        className: 'dcg-mq-ans'
      });

    case 'token':
      return renderToken(ctx, parent, child);

    case 'supsub':
      return renderSupSub(
        ctx,
        parent,
        child,
        i,
        group.marks,
        group.children[i + 1]
      );

    case 'brackets':
      return renderBrackets(ctx, parent, child);

    case 'sqrt':
      return renderSquareRoot(ctx, parent, child);

    case 'frac':
      return renderFraction(ctx, parent, child);

    case 'binom':
      return renderBinom(ctx, parent, child);

    case 'summation':
      return renderSummation(ctx, parent, child);

    case 'group':
      throw new Error('should not have MQGroup as child of MQGroup');

    case 'percentof':
      return createNode(parent, 'span', '% of ', {
        className: 'dcg-mq-nonSymbola dcg-mq-operator-name'
      });

    case 'style-cmd':
      return renderStyleCmd(ctx, parent, child);

    default:
      const _exhaustiveCheck: never = child;
      return _exhaustiveCheck;
  }
}

function renderFraction(
  ctx: MQRenderContext,
  parent: HTMLElement,
  frac: MqFrac
) {
  ctx.mathspeakFracDepth += 1;
  frac.mutable_fracDepth = ctx.mathspeakFracDepth;
  const node = createNode(parent, 'span', '', {
    className: 'dcg-mq-fraction dcg-mq-non-leaf'
  });
  const numerator = createNode(node, 'span', '', {
    className: 'dcg-mq-numerator'
  });
  const denominator = createNode(node, 'span', '', {
    className: 'dcg-mq-denominator'
  });
  createBaselineSpacer(node);

  renderGroupOrShowEmpty(ctx, numerator, frac.num);
  renderGroupOrShowEmpty(ctx, denominator, frac.den);
  ctx.mathspeakFracDepth -= 1;
  return node;
}

function renderBinom(
  ctx: MQRenderContext,
  parent: HTMLElement,
  binom: MqBinom
) {
  const node = createNode(parent, 'span', '', {
    className: 'dcg-mq-bracket-container dcg-mq-non-leaf'
  });

  const leftSymbol = SVGSymbols['('];
  const rightSymbol = SVGSymbols[')'];

  createSVGSymbolNode(node, leftSymbol, 'dcg-mq-bracket-l dcg-mq-paren');
  const middle = createNode(node, 'span', '', {
    className: 'dcg-mq-bracket-middle dcg-mq-non-leaf',
    style: `margin-left:${leftSymbol.width}; margin-right:${rightSymbol.width}`
  });

  const array = createNode(middle, 'span', '', {
    className: 'dcg-mq-array dcg-mq-non-leaf'
  });

  const num = createNode(array, 'span', '');
  const den = createNode(array, 'span', '');

  renderGroupOrShowEmpty(ctx, num, binom.num);
  renderGroupOrShowEmpty(ctx, den, binom.den);
  createSVGSymbolNode(node, rightSymbol, 'dcg-mq-bracket-r dcg-mq-paren');
  return node;
}

function renderStyleCmd(
  ctx: MQRenderContext,
  parent: HTMLElement,
  styleCmd: MqStyleCmd
): HTMLElement {
  return createStyleContainerNode(parent, styleCmd, (parent) => {
    // this is a bummer. The \overarrow commands render content directly to the left or right
    // of the main conent. There is no container supplied to render into. So we need to call
    // this render method exactly at the right time
    renderGroupOrShowEmpty(ctx, parent, styleCmd.arg);
  });
}

function renderSupSub(
  ctx: MQRenderContext,
  parent: HTMLElement,
  supSub: MqSupSub,
  /** The index of the SupSub node in its group. */
  index: number,
  /** Marks on the group that is the parent of the `supSub` */
  groupMarks: GroupMarks,
  siblingRight: MqNode | undefined
) {
  const isAfterOperatorName = doesMarkEndAtNode(
    groupMarks.mutable_operatorName,
    index - 1
  );

  const shouldAddAfterOperatorNameClass =
    isAfterOperatorName &&
    !shouldOmitPadding(supSub) &&
    siblingRight?.type !== 'brackets';

  const node = createNode(parent, 'span', '', {
    className:
      'dcg-mq-supsub dcg-mq-non-leaf' +
      (shouldAddAfterOperatorNameClass ? ' dcg-mq-after-operator-name' : '')
  });
  if (supSub.sup) {
    const sup = createNode(node, 'span', '', { className: 'dcg-mq-sup' });
    renderGroupOrShowEmpty(ctx, sup, supSub.sup);

    if (!supSub.sub) {
      node.className += ' dcg-mq-sup-only';
    }
  }
  if (supSub.sub) {
    const sub = createNode(node, 'span', '', { className: 'dcg-mq-sub' });
    renderGroupOrShowEmpty(ctx, sub, supSub.sub);
  }

  if (supSub.sub) {
    createBaselineSpacer(node);
  }
  return node;
}

function createSVGSymbolNode(
  parent: HTMLElement,
  svgSymbol: SVGSymbol,
  className: string = ''
) {
  const node = createNode(parent, 'span', '', {
    className: 'dcg-mq-scaled ' + className,
    style: svgSymbol.width ? `width:${svgSymbol.width}` : undefined
  });
  node.innerHTML = svgSymbol.html;
  return node;
}

function renderSquareRoot(
  ctx: MQRenderContext,
  parent: HTMLElement,
  sqrt: MqSqrt
) {
  let node;
  if (sqrt.index) {
    node = parent = createNode(parent, 'span', '', {
      className: 'dcg-mq-nthroot-container dcg-mq-non-leaf'
    });

    const index = createNode(parent, 'sup', '', {
      className: 'dcg-mq-nthroot dcg-mq-non-leaf'
    });
    renderGroupOrShowEmpty(ctx, index, sqrt.index);
  }

  const sqrtDom = createNode(parent, 'span', '', {
    className:
      'dcg-mq-sqrt-container ' +
      (sqrt.index ? 'dcg-mq-scaled' : 'dcg-mq-non-leaf')
  });
  node ??= sqrtDom;

  createSVGSymbolNode(sqrtDom, SVGSymbols.sqrt, 'dcg-mq-sqrt-prefix');

  const stem = createNode(sqrtDom, 'span', '', {
    className: 'dcg-mq-non-leaf dcg-mq-sqrt-stem'
  });

  renderGroupOrShowEmpty(ctx, stem, sqrt.radicand);
  return node;
}

function renderSummation(
  ctx: MQRenderContext,
  parent: HTMLElement,
  summation: MqSummation
) {
  const symbol = stringReplace[summation.kind];
  if (!symbol) {
    throw new Error('could not find summation symbol: ' + summation.kind);
  }

  if (summation.kind === '\\int') {
    // symbol
    const node = createNode(parent, 'span', '', {
      className: 'dcg-mq-int dcg-mq-non-leaf'
    });
    createNode(node, 'big', symbol);

    // supsub
    const limits = createNode(node, 'span', '', {
      className: 'dcg-mq-supsub dcg-mq-non-leaf'
    });

    // sup
    let upperLimit = createNode(limits, 'span', '', {
      className: 'dcg-mq-sup'
    });
    upperLimit = createNode(upperLimit, 'span', '', {
      className: 'dcg-mq-sup-inner'
    });
    renderGroupOrShowEmpty(ctx, upperLimit, summation.sup);

    // sub
    const lowerLimit = createNode(limits, 'span', '', {
      className: 'dcg-mq-sub'
    });
    renderGroupOrShowEmpty(ctx, lowerLimit, summation.sub);

    createBaselineSpacer(limits);

    return node;
  } else {
    const node = createNode(parent, 'span', '', {
      className: 'dcg-mq-large-operator dcg-mq-non-leaf'
    });

    // sup
    let upperLimit = createNode(node, 'span', '', { className: 'dcg-mq-to' });
    upperLimit = createNode(upperLimit, 'span', '');
    renderGroupOrShowEmpty(ctx, upperLimit, summation.sup);

    // symbol
    createNode(node, 'big', symbol);

    // sub
    let lowerLimit = createNode(node, 'span', '', {
      className: 'dcg-mq-from'
    });
    lowerLimit = createNode(lowerLimit, 'span', '');
    renderGroupOrShowEmpty(ctx, lowerLimit, summation.sub);

    return node;
  }
}

export function renderToken(
  ctx: MQRenderContext,
  parent: HTMLElement,
  token: MqToken
) {
  const existing = ctx.previousTokenNodes.get(token);
  if (existing) {
    parent.appendChild(existing);
    ctx.currentTokenNodes.set(token, existing);
    return existing;
  }
  const node = createNode(parent, 'span', '', {
    className: 'dcg-mq-ignore-mousedown dcg-mq-token'
  });
  node.setAttribute('data-dcg-mq-token', token.id);
  ctx.currentTokenNodes.set(token, node);
  return node;
}

export function renderBrackets(
  ctx: MQRenderContext,
  parent: HTMLElement,
  brackets: MqBrackets
) {
  const leftSymbol = SVGSymbols[brackets.leftSymbol];
  const rightSymbol = SVGSymbols[brackets.rightSymbol];
  const maybeLeftGhost = brackets.ghostSide === 'left' ? ' dcg-mq-ghost' : '';
  const maybeRightGhost = brackets.ghostSide === 'right' ? ' dcg-mq-ghost' : '';

  const node = createNode(parent, 'span', '', {
    className: 'dcg-mq-non-leaf dcg-mq-bracket-container'
  });
  createSVGSymbolNode(
    node,
    leftSymbol,
    'dcg-mq-bracket-l dcg-mq-paren' + maybeLeftGhost
  );

  let className = 'dcg-mq-bracket-middle dcg-mq-non-leaf';
  if (
    brackets.middle.children.length === 0 &&
    ctx.config.quietEmptyDelimeters.has(brackets.leftSymbol)
  ) {
    className += ' dcg-mq-quiet-delimiter';
  }
  const middle = createNode(node, 'span', '', {
    className,
    style: `margin-left:${leftSymbol.width};margin-right:${rightSymbol.width}`
  });

  createSVGSymbolNode(
    node,
    rightSymbol,
    'dcg-mq-bracket-r dcg-mq-paren' + maybeRightGhost
  );

  renderGroupOrShowEmpty(ctx, middle, brackets.middle);
  return node;
}

function insertSelection(
  selection: MqSelection,
  isSelecting: boolean,
  selectionIsGray: boolean
) {
  const { left, right } = selection;
  const groupNode = left.group;
  const groupDom = groupNode.mutable_domNode;
  const groupDomChildren = groupNode.mutable_domChildren;
  if (!groupDom || !groupDomChildren) {
    throw new Error(
      "Programming Error: We just rendered. Where's the DOM pointers?"
    );
  }
  if (!groupDomChildren.every((child) => child.parentNode === groupDom)) {
    throw new Error(
      'Programming Error: Group child dom is not child of group dom.'
    );
  }
  if (left.eq(right)) {
    // Point cursor
    let className = 'dcg-mq-cursor';
    if (!isSelecting) {
      className += ' dcg-mq-should-blink';
    }
    const cursorDom = createNode(groupDom, 'span', '&#8203;', { className });
    const domAfter = groupDomChildren[left.index];
    if (domAfter) {
      groupDom.insertBefore(cursorDom, domAfter);
    } else {
      groupDom.appendChild(cursorDom);
    }
    // Remove class name dcg-mq-empty from group with selection
    const isEmpty = groupNode.children.length === 0;
    if (isEmpty) {
      groupDom.classList.remove('dcg-mq-empty');
    }
    const unSelect = () => {
      cursorDom.remove();
      if (isEmpty) {
        groupDom.classList.add('dcg-mq-empty');
      }
    };
    return { unSelect };
  } else {
    // Selection range
    let className = 'dcg-mq-selection';
    if (selectionIsGray) {
      className += ' dcg-mq-blur';
    }
    const newSelectionDom = createNode(groupDom, 'span', '', { className });
    groupDom.insertBefore(newSelectionDom, groupDomChildren[left.index]);
    for (let i = left.index; i < right.index; i++) {
      newSelectionDom.appendChild(groupDomChildren[i]);
    }
    const unSelect = () => {
      // This is equivalent to `newSelectionDom.replaceWith(...newSelectionDom.childNodes);`
      // but avoids a spread (which could cause stack overflow).
      const children = Array.from(newSelectionDom.childNodes);
      const last = children[children.length - 1];
      newSelectionDom.replaceWith(last);
      for (let i = 0; i < children.length - 1; i++) {
        groupDom.insertBefore(children[i], last);
      }
    };
    return { unSelect };
  }
}

export class MqRenderer {
  container: HTMLElement;
  lastConfig: MqRenderConfig | undefined;
  previousTokenNodes: ReadonlyMap<MqNode, HTMLElement> | undefined;
  unSelect: (() => void) | undefined;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(model: MqModel, focusState: FocusState) {
    const { root } = model;
    const config = pick(model.config, affectsRenderProps);
    const needsRenderFromScratch =
      root.mutable_domNode === undefined || !isEqual(config, this.lastConfig);
    if (needsRenderFromScratch) {
      this.renderFromScratch(model, config);
      this.unSelect = this.insertSelection(model, focusState);
    } else {
      this.unSelect?.();
      this.unSelect = this.insertSelection(model, focusState);
    }
    this.lastConfig = config;
  }

  private renderFromScratch(model: MqModel, config: MqRenderConfig) {
    const { root } = model;

    // If focus is inside a token (or anywhere else under `container`), the
    // upcoming `innerHTML = ''` will detach it and the browser will blur it.
    // We swallow the corresponding focus events at capture phase so observers
    // don't see a focus change, then re-focus the element after the render
    // (it will be reattached as long as its containing token is reused).
    const { unsuppressBlurs } = suppressBlurs(this.container);

    // Render from scratch with no selection
    this.container.innerHTML = '';
    const ctx: MQRenderContext = {
      config,
      digitGroupingMap: new Map(),
      mathspeakFracDepth: 0,
      previousTokenNodes: this.previousTokenNodes ?? new Map(),
      currentTokenNodes: new Map()
    };

    renderGroup(ctx, root, this.container);

    this.previousTokenNodes = ctx.currentTokenNodes;

    unsuppressBlurs();
  }

  private insertSelection(model: MqModel, focusState: FocusState) {
    const { config, selection, isSelecting } = model;
    const hidePoint =
      (focusState !== 'focused' || config.static) &&
      isSelectionCollapsed(selection);
    const selectionIsGray = focusState === 'unintentional-blurred';

    if (selection && !hidePoint) {
      const { unSelect } = insertSelection(
        selection,
        isSelecting,
        selectionIsGray
      );
      return unSelect;
    }
    return () => {};
  }
}

/**
 * Return true if the left padding should not be added on the node to the right of `node`.
 */
function shouldOmitPadding(node: MqNode | undefined) {
  // omit padding if no node
  if (!node) return true;

  // do not add padding between letter and '.'
  if (node.type === 'char' && node.latex === '.') return true;

  // do not add padding between letter and binary operator. The
  // binary operator already has padding
  if (shouldDisplayAsBinaryOperator(node)) return true;

  if (node.type === 'summation') return true;

  return false;
}

/** Suppress all blur events. Call `unsuppressBlurs` to cancel. */
function suppressBlurs(container: HTMLElement) {
  const previouslyFocused =
    document.activeElement instanceof HTMLElement &&
    container.contains(document.activeElement)
      ? document.activeElement
      : null;
  const stopEvent = (e: Event) => e.stopImmediatePropagation();
  const focusEvents = ['blur', 'focusout', 'focus', 'focusin'] as const;
  if (previouslyFocused) {
    for (const evt of focusEvents) {
      document.addEventListener(evt, stopEvent, true);
    }
  }

  function unsuppressBlurs() {
    if (previouslyFocused) {
      if (previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
      for (const evt of focusEvents) {
        document.removeEventListener(evt, stopEvent, true);
      }
    }
  }
  return { unsuppressBlurs };
}
