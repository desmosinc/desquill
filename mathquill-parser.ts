import type {
  AutoOperatorNames,
  MqConfig,
  MqMutableMarksConfig
} from './mq-config';
import { updateOperatorNameMarks } from './mq-marks';
import {
  makeGroup,
  MqAns,
  MqBinom,
  MqBrackets,
  MqChar,
  MqFrac,
  type MqGroup,
  type MqNode,
  MqPercentOf,
  MqSqrt,
  MqStyleCmd,
  MqSummation,
  MqSupSub,
  MqToken
} from './mq-nodes';
import type { ExportedLatexSelection } from './mq-public-api';
import { mapSymbolToLatex } from './parser/cmd-to-latex';
import { type MQBlock, parse as parseLatex } from './parser/parser';
import { isStyleCmdVal } from './style-commands';

type Context = {
  autoOperatorNames: AutoOperatorNames;
};

function pushChar(_ctx: Context, parent: MqNode[], char: MqChar) {
  parent.push(char);
}

function pushGroup(ctx: Context, group: MQBlock): MqGroup {
  const parent: MqNode[] = [];
  pushToExistingGroup(ctx, group, parent);
  return makeGroup(parent);
}

/** Pushes to `parent`. */
function pushToExistingGroup(ctx: Context, group: MQBlock, parent: MqNode[]) {
  for (let i = 0; i < group.children.length; i++) {
    const atom = group.children[i];
    switch (atom.type) {
      case 'digit':
        pushChar(ctx, parent, new MqChar(atom.content));
        break;

      case 'symbol':
        pushChar(ctx, parent, new MqChar(mapSymbolToLatex(atom.content)));
        break;

      case 'letter':
        pushChar(ctx, parent, new MqChar(atom.content));
        break;

      case 'sqrt':
        parent.push(
          new MqSqrt({
            index: atom.index && pushGroup(ctx, atom.index),
            radicand: pushGroup(ctx, atom.radicand)
          })
        );
        break;

      case 'brackets':
        parent.push(
          new MqBrackets({
            leftSymbol: atom.leftSymbol,
            rightSymbol: atom.rightSymbol,
            leftLatex: atom.leftLatex,
            rightLatex: atom.rightLatex,
            ghostSide: atom.ghostSide,
            middle: pushGroup(ctx, atom.middle)
          })
        );
        break;

      case 'summation':
        {
          parent.push(
            new MqSummation({
              kind: atom.kind,
              sup: pushGroup(ctx, atom.sup),
              sub: pushGroup(ctx, atom.sub)
            })
          );
        }
        break;
      case 'supsub':
        {
          parent.push(
            new MqSupSub({
              sup: atom.sup && pushGroup(ctx, atom.sup),
              sub: atom.sub && pushGroup(ctx, atom.sub)
            })
          );
        }
        break;
      case 'command':
        {
          if (atom.ctrlSeq === 'frac') {
            parent.push(
              new MqFrac({
                num: pushGroup(ctx, atom.blocks[0]),
                den: pushGroup(ctx, atom.blocks[1])
              })
            );
          } else if (atom.ctrlSeq === 'binom') {
            parent.push(
              new MqBinom({
                num: pushGroup(ctx, atom.blocks[0]),
                den: pushGroup(ctx, atom.blocks[1])
              })
            );
          } else if (isStyleCmdVal('\\' + atom.ctrlSeq)) {
            parent.push(
              new MqStyleCmd({
                val: ('\\' + atom.ctrlSeq) as any,
                styleParam: undefined, //atom.styleParam,
                arg: pushGroup(ctx, atom.blocks[0])
              })
            );
          } else if (atom.ctrlSeq === 'token' || atom.ctrlSeq === 'tokenName') {
            // this isn't exactly right but I think it's likely fine. Old mathquill tries to iterate through
            // each child of the main group and print the .ctrlSeq. That works fine if every child is a 'char'
            // but once you put a `\frac{}{}` in there then we don't output the same thing. Old mq has `\frac`
            // as the ctrlSeq on the frac but we don't have a ctrlSeq to print. I think this doesn't matter because
            // \token{} is very special and should have been treated as opaque.
            const tokenId = pushGroup(ctx, atom.blocks[0])
              .children.map((char) => {
                if (char.type === 'char') {
                  return char.latex;
                } else {
                  return '';
                }
              })
              .join('');

            parent.push(
              new MqToken({
                variant: atom.ctrlSeq,
                id: tokenId
              })
            );
          } else {
            const fullCommand = mapSymbolToLatex(atom.ctrlSeq);
            pushChar(ctx, parent, new MqChar(fullCommand));
          }
        }
        break;

      case 'percentof':
        parent.push(new MqPercentOf());
        break;

      case 'ans':
        parent.push(new MqAns());
        break;

      case 'block':
        pushToExistingGroup(ctx, atom, parent);
        break;

      case 'style-cmd':
        parent.push(
          new MqStyleCmd({
            styleParam: atom.styleParam,
            arg: pushGroup(ctx, atom.arg),
            val: atom.ctrlSeq
          })
        );
        break;

      default:
        const _exhaustiveCheck: never = atom;
        return _exhaustiveCheck;
    }
  }
}

// An experiment to see how hard it is to render something identical to mathquill
// if you already have the valid latex. Mostly an exercise to get a feel for gotchas.
export function parse(
  latex: string,
  config: MqConfig,
  selection?: ExportedLatexSelection
): MqGroup {
  if (selection && selection.latex !== latex) {
    throw new Error('Invalid selection passed to parse().');
  }
  const ctx: Context = {
    autoOperatorNames: config.autoOperatorNames
  };

  // do the rendering
  const parseTree = parseLatex(latex, config.autoOperatorNames);
  const displayTree = pushGroup(ctx, parseTree);

  return displayTree;
}

function doesEndInLog(children: MqNode[], endIndex: number) {
  const child1 = children[endIndex - 2];
  if (child1?.type !== 'char' || child1.latex !== 'l') return false;

  const child2 = children[endIndex - 1];
  if (child2?.type !== 'char' || child2.latex !== 'o') return false;

  const child3 = children[endIndex];
  if (child3?.type !== 'char' || child3.latex !== 'g') return false;

  return true;
}

export function updateMutableMarksOnGroup(
  group: MqGroup,
  config: MqMutableMarksConfig,
  opts?: { isInNonLogSubscript: boolean }
) {
  updateOperatorNameMarks(group, config, !!opts?.isInNonLogSubscript);

  for (let i = 0; i < group.children.length; i++) {
    const child = group.children[i];
    switch (child.type) {
      case 'binom':
      case 'frac':
        updateMutableMarksOnGroup(child.num, config);
        updateMutableMarksOnGroup(child.den, config);
        break;

      case 'brackets':
        updateMutableMarksOnGroup(child.middle, config);
        break;

      case 'supsub':
        if (child.sub) {
          updateMutableMarksOnGroup(child.sub, config, {
            isInNonLogSubscript: !doesEndInLog(group.children, i - 1)
          });
        }

        if (child.sup) updateMutableMarksOnGroup(child.sup, config);
        break;

      case 'group':
        updateMutableMarksOnGroup(child, config);
        break;

      case 'sqrt':
        if (child.index) updateMutableMarksOnGroup(child.index, config);
        updateMutableMarksOnGroup(child.radicand, config);
        break;

      case 'style-cmd':
        updateMutableMarksOnGroup(child.arg, config);
        break;

      case 'summation':
        if (child.sub) updateMutableMarksOnGroup(child.sub, config);
        if (child.sup) updateMutableMarksOnGroup(child.sup, config);
        break;

      case 'char':
      case 'percentof':
      case 'ans':
      case 'token':
        break;
    }
  }
}
