import { createNode } from './mathquill-renderer';
import type { MqNode, MqStyleCmd } from './mq-nodes';

const ArrowText = '\u27A4';
const U_DOT_ABOVE = '\u02D9';

type StyleMakeDOM = {
  makeDOM: (
    parent: HTMLElement,
    cmd: MqStyleCmd,
    renderChildCb: (parent: HTMLElement) => void
  ) => HTMLElement;
};

export const StyleCommandsTable = {
  '\\mathrm': makeStyleDOMBuilder('span', 'dcg-mq-roman dcg-mq-font'),
  '\\mathit': makeStyleDOMBuilder('i', 'dcg-mq-font'),
  '\\mathbf': makeStyleDOMBuilder('b', 'dcg-mq-font'),
  '\\mathsf': makeStyleDOMBuilder('span', 'dcg-mq-sans-serif dcg-mq-font'),
  '\\mathtt': makeStyleDOMBuilder('span', 'dcg-mq-monospace dcg-mq-font'),
  '\\underline': makeStyleDOMBuilder(
    'span',
    'dcg-mq-non-leaf dcg-mq-underline'
  ),
  '\\overline': makeStyleDOMBuilder('span', 'dcg-mq-non-leaf dcg-mq-overline'),
  '\\overrightarrow': makeOverArrowDOMBuilder(false, true),
  '\\overleftarrow': makeOverArrowDOMBuilder(true, false),
  '\\overleftrightarrow': makeOverArrowDOMBuilder(true, true),
  '\\overarc': makeStyleDOMBuilder('span', 'dcg-mq-non-leaf dcg-mq-overarc'),

  '\\dot': {
    makeDOM: (parent: HTMLElement, _cmd, renderChild) => {
      const root = createNode(parent, 'span', '', {
        className: 'dcg-mq-non-leaf'
      });
      const inner = createNode(root, 'span', '', {
        className: 'dcg-mq-dot-recurring-inner'
      });
      createNode(inner, 'span', U_DOT_ABOVE, {
        className: 'dcg-mq-dot-recurring'
      });
      const content = createNode(inner, 'span', '', {
        className: 'dcg-mq-empty-box'
      });
      renderChild(content);
      return root;
    }
  },

  '\\textcolor': {
    makeDOM: (parent: HTMLElement, styleCmd: MqStyleCmd, renderChild) => {
      const root = createNode(parent, 'span', '', {
        className: `dcg-mq-textcolor`,
        style: `color:${styleCmd.styleParam}`
      });
      renderChild(root);
      return root;
    }
  },

  '\\vec': makeDiacriticAboveDOMBuilder('→'),
  '\\tilde': makeDiacriticAboveDOMBuilder('~'),
  '\\hat': {
    makeDOM: (parent: HTMLElement, _cmd, renderChild) => {
      const root = createNode(parent, 'span', '', {
        className: 'dcg-mq-non-leaf'
      });
      createNode(root, 'span', '^', { className: 'dcg-mq-hat-prefix' });
      const content = createNode(root, 'span', '', {
        className: 'dcg-mq-hat-stem'
      });
      renderChild(content);
      return root;
    }
  }
} as const satisfies Record<string, StyleMakeDOM>;

export type StyleCmdVal = keyof typeof StyleCommandsTable;

export function isStyleCmdVal(str: string): str is StyleCmdVal {
  return StyleCommandsTable.hasOwnProperty(str);
}

function makeStyleDOMBuilder(
  tag: 'span' | 'i' | 'b',
  className: string
): StyleMakeDOM {
  return {
    makeDOM: (parent: HTMLElement, _cmd, renderChild) => {
      const root = createNode(parent, tag, '', { className });
      renderChild(root);
      return root;
    }
  };
}

function makeOverArrowDOMBuilder(left: boolean, right: boolean): StyleMakeDOM {
  return {
    makeDOM: (parent: HTMLElement, _cmd, renderChild) => {
      const root = createNode(parent, 'span', '', {
        className: 'dcg-mq-non-leaf dcg-mq-overarrow'
      });
      if (left)
        createNode(root, 'span', ArrowText, {
          className: 'dcg-mq-arrow-left-content'
        });

      renderChild(root);

      if (right)
        createNode(root, 'span', ArrowText, {
          className: 'dcg-mq-arrow-right-content'
        });
      return root;
    }
  };
}

function makeDiacriticAboveDOMBuilder(char: string): StyleMakeDOM {
  return {
    makeDOM: (parent: HTMLElement, _cmd, renderChild) => {
      const root = createNode(parent, 'span', '', {
        className: 'dcg-mq-non-leaf'
      });
      createNode(root, 'span', char, { className: 'dcg-mq-diacritic-above' });
      const content = createNode(root, 'span', '', {
        className: 'dcg-mq-diacritic-stem'
      });
      renderChild(content);
      return root;
    }
  };
}

export function createStyleContainerNode(
  parent: HTMLElement,
  cmd: MqStyleCmd,
  renderChildCb: (parent: HTMLElement) => void
): HTMLElement {
  return StyleCommandsTable[cmd.val].makeDOM(parent, cmd, renderChildCb);
}

export function isTextBlock(node: MqNode) {
  return node.type === 'style-cmd' && node.val === '\\mathrm';
}
