import { type AutoOperatorNames } from '../mq-config';
import type { StyleCmdVal } from '../style-commands';
import { mapCtrlSeqAlias } from './cmd-to-latex';
import { getFragmentReplacement, getParserForCmd } from './cmds';

type MQFragment = MQNode[];

type MQLetter = {
  type: 'letter';
  content: string;
};

type MQDigit = {
  type: 'digit';
  content: string;
};

type MQSymbol = {
  type: 'symbol';
  content: string;
};

type MQSqrt = {
  type: 'sqrt';
  radicand: MQBlock;
  index: MQBlock | undefined;
};

type MQAns = {
  type: 'ans';
};

type MQPercentOf = {
  type: 'percentof';
};

type MQBrackets = {
  type: 'brackets';
  leftSymbol: string;
  leftLatex: string;
  rightSymbol: string;
  rightLatex: string;
  ghostSide?: 'left' | 'right';
  middle: MQBlock;
};

type MQSummation = {
  type: 'summation';
  kind: '\\int' | '\\sum' | '\\prod' | '\\coprod';
  sub: MQBlock;
  sup: MQBlock;
};

type MQCommand = {
  type: 'command';
  ctrlSeq: string;
  blocks: MQBlock[];
};

type MQStyleCmd = {
  type: 'style-cmd';
  ctrlSeq: StyleCmdVal;
  styleParam: string;
  arg: MQBlock;
};

export type MQBlock = {
  type: 'block';
  children: MQNode[];
};

type MQSupSub = {
  type: 'supsub';
  sup: MQBlock | undefined;
  sub: MQBlock | undefined;
};

export type MQAtom =
  | MQBlock
  | MQSymbol
  | MQLetter
  | MQDigit
  | MQSqrt
  | MQAns
  | MQPercentOf
  | MQBrackets
  | MQSummation
  | MQCommand
  | MQSupSub
  | MQStyleCmd;

type MQNode = MQAtom | MQBlock;

type ParserState = {
  stream: string;
};

function peek(state: ParserState) {
  return state.stream[0];
}

function advance(state: ParserState) {
  return {
    ...state,
    stream: state.stream.slice(1)
  };
}

function isAtEnd(state: ParserState) {
  return peek(state) === undefined;
}

function eatString(state: ParserState, string: string) {
  if (state.stream.startsWith(string)) {
    return {
      val: string,
      state: {
        stream: state.stream.slice(string.length)
      }
    };
  } else {
    return undefined;
  }
}

function makeState(latex: string) {
  return {
    stream: latex
  };
}

function eatAny(state: ParserState) {
  if (isAtEnd(state)) return undefined;

  const val = peek(state);
  return {
    val,
    state: advance(state)
  };
}

function eatRegex(state: ParserState, re: RegExp) {
  const match = re.exec(state.stream);
  if (match) {
    const val = match[0];
    return {
      val: match[0],
      state: {
        stream: state.stream.slice(val.length)
      }
    };
  } else {
    return undefined;
  }
}

interface ParseResult<T extends MQNode | MQFragment> {
  state: ParserState;
  tree: T;
}

function ParseResult<T extends MQNode | MQFragment>(
  state: ParserState,
  tree: T
): ParseResult<T> {
  return { state, tree };
}

function eatCtrlSeq(state: ParserState) {
  {
    // look for a backslash
    const r = eatString(state, '\\');
    if (!r) {
      // we did not find a backslash. Look for a single symbol
      return eatRegex(state, /^[^\\a-z]/i);
    }

    state = r.state;
  }

  {
    // try to eat letters
    const r = eatRegex(state, /^[a-z]+/i);
    if (r) return r;
  }

  {
    // try to eat whitespace. Normalize to a single normal space
    const r = eatRegex(state, /^\s+/);
    if (r)
      return {
        val: ' ',
        state: r.state
      };
  }

  {
    // if all else fails try to consume a single character
    const r = eatAny(state);
    if (r) return r;
  }

  return undefined;
}

function parseCtrlSeq(
  state: ParserState,
  _isOptArg?: boolean
): ParseResult<MQNode | MQFragment> | undefined {
  const r = eatCtrlSeq(state);
  if (!r) return undefined;
  state = r.state;

  const ctrlSeq = mapCtrlSeqAlias(r.val);
  return parseCustom(state, ctrlSeq);
}

function parseCustom(
  state: ParserState,
  ctrlSeq: string
): ParseResult<MQNode | MQFragment> | undefined {
  const subParser = getParserForCmd(ctrlSeq);
  if (!subParser) return undefined;

  switch (subParser) {
    case 'cmd-operatorname': {
      return ParseResult(
        state,
        ctrlSeq.split('').map((letter) => {
          return {
            type: 'letter',
            content: letter,
            latex: letter
          };
        })
      );
    }
    case 'fragment': {
      // TODO-mq-rewrite-behavior -- currently a bug in MQ for latex `\sum⁶`. This expands to `\sum_{ }^{ }^{6}` but only AFTER
      // the \sum has been finalized. So the 6 does not go into the superscript of the sum. If you copy that expanded
      // latex and paste it back in it then becomes: `\sum_{ }^{6}`

      const replacement = getFragmentReplacement(ctrlSeq);
      if (!replacement) return undefined;

      const r = parseMathSequence(makeState(replacement));
      if (!r) return undefined;

      return ParseResult(state, r.tree.children);
    }

    case 'left': {
      state = skipWhitespace(state);
      let leftSymbol = '';
      let leftLatex = '';
      {
        // We just ate `\left`, Try to eat `(`, `[`, `|`, `\{`, `\langle`, or `\lVert`.
        const r = eatRegex(
          state,
          /^(?:[([|]|\\\{|\\langle(?![a-zA-Z])|\\lVert(?![a-zA-Z]))/
        );
        if (!r) return undefined;
        state = r.state;

        leftLatex = r.val;
        leftSymbol = leftLatex.replace('\\', '');
        if (leftLatex === '\\langle') leftLatex += ' ';
        else if (leftLatex === '\\lVert') leftLatex += ' ';
      }

      let middle;
      {
        const r = parseMathSequence(state);
        if (!r) return undefined;
        state = r.state;
        middle = r.tree;
      }

      {
        const r = eatString(state, '\\right');
        if (!r) return undefined;
        state = r.state;
        state = skipWhitespace(state);
      }

      let rightSymbol = '';
      let rightLatex = '';
      {
        // We just ate `\right`, Try to eat `)`, `]`, `|`, `\}`, `\rangle`, or `\rVert`.
        const r = eatRegex(
          state,
          /^(?:[\])|]|\\\}|\\rangle(?![a-zA-Z])|\\rVert(?![a-zA-Z]))/
        );
        if (!r) return undefined;
        state = r.state;
        rightLatex = r.val;
        rightSymbol = rightLatex.replace('\\', '');
        if (rightLatex === '\\rangle') rightLatex += ' ';
        else if (rightLatex === '\\rVert') rightLatex += ' ';
      }

      return ParseResult(state, {
        type: 'brackets',
        leftSymbol,
        leftLatex,
        rightSymbol,
        rightLatex,
        middle
      });
    }
    case 'right':
      // The only time you should reach a \right is after a \left. The \left will consume
      // this token. If ou ever reach a \right outside of a \left then we'll get stuck here.
      // That will eventually result in not reach the EOF and will end up showing a blank
      // mathquill
      return undefined;

    // supposed to have \left\langle{...}\right\rangle but can have
    // something like \langle{...}
    case 'solo-bracket':
      {
        const r = parseMathBlock(state);
        if (!r) return undefined;
        state = r.state;

        if (ctrlSeq === 'langle' || ctrlSeq === 'rangle') {
          return ParseResult(state, {
            type: 'brackets',
            leftSymbol: 'langle',
            leftLatex: '\\langle ',
            rightSymbol: 'rangle',
            rightLatex: '\\rangle',
            ghostSide: ctrlSeq === 'langle' ? 'right' : 'left',
            middle: r.tree
          });
        } else if (ctrlSeq === 'lVert' || ctrlSeq === 'rVert') {
          return ParseResult(state, {
            type: 'brackets',
            leftSymbol: 'lVert',
            leftLatex: '\\lVert ',
            rightSymbol: 'rVert',
            rightLatex: '\\rVert',
            ghostSide: ctrlSeq === 'lVert' ? 'right' : 'left',
            middle: r.tree
          });
        } else {
          throw new Error('unrecognized. solo-bracket ctrlSeq: ' + ctrlSeq);
        }
      }
      break;

    case 'math-command':
    case 'math-command-2': {
      const numBlocks = subParser === 'math-command-2' ? 2 : 1;

      const blocks = [];
      for (let i = 0; i < numBlocks; i++) {
        const r = parseMathBlock(state);
        if (!r) return undefined;
        state = r.state;
        blocks.push(r.tree);
      }
      return ParseResult(state, {
        type: 'command',
        ctrlSeq,
        blocks
      });
    }
    case 'operatorname': {
      const r = parseMathBlock(state);
      if (!r) return undefined;

      let opName = '';
      for (const child of r.tree.children) {
        if (child.type !== 'letter') {
          opName = '';
          break;
        } else {
          opName += child.content;
        }
      }

      if (opName === 'ans') {
        return ParseResult(r.state, {
          type: 'ans'
        });
      }

      return ParseResult(r.state, r.tree.children);
    }
    case 'percent': {
      state = skipWhitespace(state);
      const r = eatString(state, '\\operatorname{of}');
      if (!r) {
        return ParseResult(state, {
          type: 'symbol',
          content: '%',
          latex: '\\%'
        });
      }

      return ParseResult(r.state, {
        type: 'percentof'
      });
    }
    case 'sqrt': {
      const indexR = parseOptMathBlock(state);
      if (indexR) {
        state = indexR.state;
      }

      const radicandR = parseMathBlock(state);
      if (!radicandR) return undefined;
      state = radicandR.state;

      return ParseResult(state, {
        type: 'sqrt',
        index: indexR?.tree,
        radicand: radicandR.tree
      });
    }
    case 'cbrt': {
      const radicandR = parseMathBlock(state);
      if (!radicandR) return undefined;
      state = radicandR.state;

      return ParseResult(state, {
        type: 'sqrt',
        index: {
          type: 'block',
          children: [{ type: 'digit', content: '3' }]
        },
        radicand: radicandR.tree
      });
    }
    case 'summation': {
      const sub: MQBlock = { type: 'block', children: [] };
      const sup: MQBlock = { type: 'block', children: [] };

      while (true) {
        state = skipWhitespace(state);

        let which: 'sub' | 'sup';
        {
          const r = eatRegex(state, /^[_^]/);
          if (!r) break;
          state = r.state;

          which = r.val === '_' ? 'sub' : 'sup';
        }

        {
          const r = parseMathBlock(state);
          if (!r) return undefined;
          state = r.state;

          const block = which === 'sub' ? sub.children : sup.children;
          for (const child of r.tree.children) {
            block.push(child);
          }
        }
      }

      switch (ctrlSeq) {
        case 'int':
        case 'sum':
        case 'prod':
        case 'coprod':
          return ParseResult(state, {
            type: 'summation',
            kind: ('\\' + ctrlSeq) as `\\${typeof ctrlSeq}`,
            sub,
            sup
          });
        default:
          throw new Error('Programming Error: summation sub-parser incorrect.');
      }
    }
    case 'symbol':
      return ParseResult(state, {
        type: 'symbol',
        latex: ctrlSeq,
        content: ctrlSeq
      });

    case 'textcolor': {
      state = skipWhitespace(state);

      {
        const r = eatString(state, '{');
        if (!r) return undefined;
        state = r.state;
      }

      let styleParam: string;
      {
        const r = eatRegex(state, /^[#\w\s.,()%-]*/);
        if (!r) return undefined;
        state = r.state;
        styleParam = r.val;
      }

      {
        const r = eatString(state, '}');
        if (!r) return undefined;
        state = r.state;
      }

      {
        const r = parseMathBlock(state);
        if (!r) return undefined;
        state = r.state;

        return ParseResult(state, {
          type: 'style-cmd',
          ctrlSeq: '\\textcolor',
          styleParam,
          arg: r.tree
        });
      }
    }

    default:
      subParser satisfies never;
      return undefined;
  }
}

function skipWhitespace(state: ParserState) {
  const r = eatRegex(state, /^\s*/);
  if (r) return r.state;
  return state;
}

function parseLetter(state: ParserState) {
  const r = eatRegex(state, /^[a-z]/i);
  if (r?.val) {
    return ParseResult(r.state, {
      type: 'letter',
      latex: r.val,
      content: r.val
    });
  }

  return undefined;
}

function parseNumber(state: ParserState) {
  const r = eatRegex(state, /^[0-9]/);
  if (r?.val) {
    return ParseResult(r.state, {
      type: 'digit',
      latex: r.val,
      content: r.val
    });
  }

  return undefined;
}

function parseSymbol(state: ParserState): ParseResult<MQSymbol> | undefined {
  const r = eatRegex(state, /^[^${}\\_^]/);
  if (r?.val) {
    return ParseResult(r.state, {
      type: 'symbol',
      latex: r.val,
      content: r.val
    });
  }

  return undefined;
}

function parseCommand(
  state: ParserState
): ParseResult<MQNode | MQFragment> | undefined {
  let r = parseCtrlSeq(state);
  if (r) return r;

  r = parseLetter(state);
  if (r) return r;

  r = parseNumber(state);
  if (r) return r;

  r = parseSymbol(state);
  if (r) return r;

  return undefined;
}

function parseMathSequence(
  state: ParserState
): ParseResult<MQBlock> | undefined {
  const out: MQBlock = {
    type: 'block',
    children: []
  };

  let r;
  while ((r = parseMathBlock(state))) {
    state = r.state;
    for (const child of r.tree.children) {
      out.children.push(child);
    }
  }

  state = skipWhitespace(state);

  return ParseResult(state, out);
}

function parseMathGroup(startState: ParserState) {
  let state = startState;

  {
    const r = eatString(state, '{');
    if (!r) return undefined;
    state = r.state;
  }

  let group;
  {
    const r = parseMathSequence(state);
    if (!r) return undefined;
    state = r.state;
    group = r.tree;
  }

  {
    const r = eatString(state, '}');
    if (!r) return undefined;
    state = r.state;
  }

  return ParseResult(state, group);
}

function parseMathBlock(state: ParserState): ParseResult<MQBlock> | undefined {
  state = skipWhitespace(state);
  const r = parseMathGroup(state);
  if (r) return r;

  const r2 = parseCommand(state);
  if (r2) {
    return ParseResult(r2.state, {
      type: 'block',
      children: Array.isArray(r2.tree) ? r2.tree : [r2.tree]
    });
    // return commandToBlock()
  }

  return undefined;
}

export function parseOptMathBlock(state: ParserState) {
  {
    const r = eatString(state, '[');
    if (!r) return undefined;
    state = r.state;
  }

  const children: MQFragment = [];
  {
    let r;
    while (peek(state) !== ']' && (r = parseMathBlock(state))) {
      state = r.state;
      for (const child of r.tree.children) {
        children.push(child);
      }
    }
  }

  state = skipWhitespace(state);

  {
    const r = eatString(state, ']');
    if (!r) return undefined;
    state = r.state;
  }

  return ParseResult(state, {
    type: 'block',
    children
  });
}

// runs through all contiguous sub/sups to combine them
function finalizeTree_supSub(block: MQBlock, startIndex: number) {
  let supSub: MQSupSub | undefined;

  for (let i = startIndex; i < block.children.length; i++) {
    const child = block.children[i];
    if (child.type !== 'command') return;

    const cmdCtrlSeq = child.ctrlSeq;
    if (cmdCtrlSeq !== '_' && cmdCtrlSeq !== '^') return;

    // pull this child off
    block.children.splice(i, 1);
    i -= 1;

    if (!supSub) {
      supSub = {
        type: 'supsub',
        sub: undefined,
        sup: undefined
      };

      i += 1;
      block.children.splice(i, 0, supSub);
    }

    const supOrSub: 'sup' | 'sub' = cmdCtrlSeq === '_' ? 'sub' : 'sup';
    if (!supSub[supOrSub]) {
      supSub[supOrSub] = {
        type: 'block',
        children: []
      };
    }

    const children = supSub[supOrSub].children;
    for (const child1 of child.blocks[0].children) {
      children.push(child1);
    }
  }
}

function finalizeTree(node: MQBlock, autoOperatorNames: AutoOperatorNames) {
  for (let i = 0; i < node.children.length; i++) {
    finalizeTree_supSub(node, i);
  }

  // first finalize all children recursively
  for (const child of node.children) {
    switch (child.type) {
      case 'command':
        for (const childBlock of child.blocks) {
          finalizeTree(childBlock, autoOperatorNames);
        }
        break;

      case 'supsub':
        if (child.sub) finalizeTree(child.sub, autoOperatorNames);
        if (child.sup) finalizeTree(child.sup, autoOperatorNames);
        break;

      case 'summation':
        if (child.sub) finalizeTree(child.sub, autoOperatorNames);
        if (child.sup) finalizeTree(child.sup, autoOperatorNames);
        break;
      case 'brackets':
        finalizeTree(child.middle, autoOperatorNames);
        break;
      case 'sqrt':
        if (child.index) finalizeTree(child.index, autoOperatorNames);
        finalizeTree(child.radicand, autoOperatorNames);
        break;
      case 'block':
        finalizeTree(child, autoOperatorNames);
        break;

      case 'style-cmd':
        finalizeTree(child.arg, autoOperatorNames);
        break;

      case 'digit':
      case 'ans':
      case 'percentof':
      case 'symbol':
      case 'letter':
        break;
      default:
        child satisfies never;
    }
  }
}

export function parse(
  input: string,
  autoOperatorNames: AutoOperatorNames
): MQBlock {
  let state: ParserState = makeState(input);

  const emptyRoot: MQBlock = { type: 'block', children: [] };

  state = skipWhitespace(state);

  const r = parseMathSequence(state);
  if (!r) return emptyRoot;

  state = r.state;
  if (!isAtEnd(state)) return emptyRoot;

  finalizeTree(r.tree, autoOperatorNames);

  //console.log('final tree: ', r.tree)

  return r.tree;
}
