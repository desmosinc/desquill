import './css/Symbola-basic.css';
import './css/mathquill-basic.css';
import './mq-public-api.scss';

import {
  type UnprocessedMqConfig,
  updateConfig,
  updateDefaultMqConfig
} from './mq-config';
import { MqController } from './mq-controller';
import { getMathspeak } from './mq-mathspeak';
import type { MqGroup } from './mq-nodes';
import { MqView } from './mq-view';
import { type KeyboardEventsController } from './sane-keyboard-events';
import type { MqSelection } from './selection';
import { isEqual } from './vendor/underscore';

export function getApiInstanceForElement(
  elm: HTMLElement
): MqMathFieldApi | undefined {
  return (elm as any).__dcgMqApiInstance;
}

function setAPIInstanceForElement(elm: HTMLElement, instance: MqMathFieldApi) {
  // If there was a way to destroy an mq instance, we would need to unlink this.
  (elm as any).__dcgMqApiInstance = instance;
}

type InitialConfig = Omit<UnprocessedMqConfig, 'localize'> &
  Required<Pick<UnprocessedMqConfig, 'localize'>>;

/**
 * Intended to be a drop-in replacement for `MQ.StaticMath(container, config)`.
 */
export function StaticMath(container: HTMLElement, config: InitialConfig) {
  if (!('static' in config)) {
    config = { ...config, static: true };
  }
  return new MqMathFieldApi(container, config);
}

/**
 * Intended to be a drop-in replacement for `MQ.MathField(container, config)`.
 */
export function MathField(container: HTMLElement, config: InitialConfig) {
  return new MqMathFieldApi(container, config);
}

export const EditableField = MathField;

export type ExportedLatexSelection = {
  latex: string;
  startIndex: number;
  endIndex: number;
};

/** Class for public API methods and such. Mirrors the existing mathquill API. */
export class MqMathFieldApi {
  private controller: MqController;
  private view: MqView;
  private container: HTMLElement;

  constructor(container: HTMLElement, config: InitialConfig) {
    const startingLatexFromHTML = container.textContent;

    this.container = container;
    this.controller = new MqController();
    if (getApiInstanceForElement(container) !== undefined) {
      throw new Error(
        'MQ Error: cannot attach another API to the same element.'
      );
    }
    setAPIInstanceForElement(container, this);

    const kbController: KeyboardEventsController = {
      keystroke: (key: string, evt: KeyboardEvent) => {
        const config = this.controller.getConfig();
        if (config.overrideKeystroke) {
          config.overrideKeystroke(key, evt);
        } else {
          this._keystrokeSingle(key, evt);
        }
      },
      typedText: (text: string) => {
        const config = this.controller.getConfig();
        if (config.overrideTypedText) {
          config.overrideTypedText(text);
        } else {
          this.typedText(text);
        }
      },
      paste: (text: string) => this._paste(text),
      cut: () => this._cut(),
      copy: () => this._copy(),
      options: {
        overridePaste: (evt) =>
          this.controller.getConfig().overridePaste?.(evt) ?? false,
        overrideCopy: (evt) =>
          this.controller.getConfig().overrideCopy?.(evt) ?? false,
        overrideCut: (evt) =>
          this.controller.getConfig().overrideCut?.(evt) ?? false
        // disableCopyPaste?: boolean;
      },
      KIND_OF_MQ: 'MathField'
    };

    this.view = new MqView(this.controller, container, kbController);

    this.config(config);

    this.controller.subscribeToChanges(() => this.view.updateView());

    if (startingLatexFromHTML.trim()) {
      this.latex(startingLatexFromHTML);
    }
  }

  latex(latex: string): this;
  latex(): string;
  latex(latex?: string): string | this {
    if (latex !== undefined) {
      this.controller.dispatch({
        type: 'api-set-latex',
        latex
      });
      return this;
    }
    return this.controller.getLatex();
  }

  mathspeak(): string {
    const { autoOperatorNames, localize } = this.controller.getConfig();
    const opts = { autoOperatorNames, localize };
    const mathspeak = getMathspeak(this.controller.getRoot(), opts);
    return mathspeak.replace(/ {2,}/g, ' ');
  }

  selection(selection: ExportedLatexSelection): this;
  selection(): ExportedLatexSelection;
  selection(selection?: ExportedLatexSelection): ExportedLatexSelection | this {
    if (selection) {
      this.focus();
      this.controller.dispatch({
        type: 'api-set-selection',
        selection
      });
      return this;
    }

    return this.controller.getLatexSelection();
  }

  domNodeToSpan(dom: Element): ExportedLatexSelection | undefined {
    return this.controller.domNodeToSpan(dom);
  }

  /** Clear selection to the head of the selection. */
  clearSelection() {
    this.controller.dispatch({
      type: 'api-clear-selection'
    });
  }

  select() {
    this.focus();
    this.controller.dispatch({
      type: 'select-all'
    });
  }

  write(latex: string) {
    this.controller.dispatch({
      type: 'write-latex',
      latex,
      fromPaste: false
    });

    return this;
  }

  keystroke(keysString: string, evt?: KeyboardEvent) {
    const keys = keysString.replace(/^\s+|\s+$/g, '').split(/\s+/);
    for (let i = 0; i < keys.length; i += 1) {
      this._keystrokeSingle(keys[i], evt);
    }
    return this;
  }

  private _keystrokeSingle(key: string, evt?: KeyboardEvent | undefined) {
    switch (key) {
      case 'Left':
      case 'Right':
        evt?.preventDefault();
        this.controller.dispatch({
          type: 'arrow-left-right',
          dir: key === 'Left' ? 'left' : 'right'
        });
        break;
      case 'Up':
      case 'Down':
        evt?.preventDefault();
        this.controller.dispatch({
          type: 'arrow-up-down',
          updown: key === 'Up' ? 'up' : 'down'
        });
        break;
      case 'Shift-Left':
      case 'Shift-Right':
        evt?.preventDefault();
        this.controller.dispatch({
          type: 'shift-left-right',
          dir: key === 'Shift-Left' ? 'left' : 'right'
        });
        break;
      case 'Shift-Up':
      case 'Shift-Down':
        evt?.preventDefault();
        this.controller.dispatch({
          type: 'shift-up-down',
          updown: key === 'Shift-Up' ? 'up' : 'down'
        });
        break;
      case 'Home':
      case 'End':
        evt?.preventDefault();
        this.controller.dispatch({
          type: 'home-end',
          dir: key === 'Home' ? 'left' : 'right'
        });
        break;
      case 'Shift-Home':
      case 'Shift-End':
        evt?.preventDefault();
        this.controller.dispatch({
          type: 'shift-home-end',
          dir: key === 'Shift-Home' ? 'left' : 'right'
        });
        break;
      case 'Ctrl-Shift-Home':
      case 'Ctrl-Shift-End':
        evt?.preventDefault();
        this.controller.dispatch({
          type: 'ctrl-shift-home-end',
          dir: key === 'Ctrl-Shift-Home' ? 'left' : 'right'
        });
        break;
      case 'Backspace':
      case 'Del': {
        evt?.preventDefault();
        this.controller.dispatch({
          type: 'delete-in-direction',
          direction: key === 'Backspace' ? 'left' : 'right'
        });
        break;
      }
      case 'Ctrl-Backspace':
      case 'Ctrl-Del': {
        evt?.preventDefault();
        this.controller.dispatch({
          type: 'ctrl-delete-in-direction',
          direction: key === 'Ctrl-Backspace' ? 'left' : 'right'
        });
        break;
      }
      case 'Esc':
      case 'Tab':
      case 'Shift-Esc':
      case 'Shift-Tab': {
        this.controller.dispatch({
          type: 'escape-dir',
          direction: key === 'Tab' || key === 'Esc' ? 'right' : 'left',
          // need to pass in `evt` because it may or may not be preventDefault'd.
          evt
        });
        break;
      }
      case 'Ctrl-A':
      case 'Meta-A':
        evt?.preventDefault();
        this.select();
        break;
      case 'Ctrl-End':
        evt?.preventDefault();
        this.moveToRightEnd();
        break;
      case 'Ctrl-Home':
        evt?.preventDefault();
        this.moveToLeftEnd();
        break;
      case 'Ctrl-Alt-Left':
        evt?.preventDefault();
        this.controller.dispatch({ type: 'speak-block-dir', dir: 'left' });
        break;
      case 'Ctrl-Alt-Right':
        evt?.preventDefault();
        this.controller.dispatch({ type: 'speak-block-dir', dir: 'right' });
        break;
      case 'Ctrl-Alt-Up':
        evt?.preventDefault();
        this.controller.dispatch({ type: 'speak-parent-block' });
        break;
      case 'Ctrl-Alt-Down':
        evt?.preventDefault();
        this.controller.dispatch({ type: 'speak-current-block' });
        break;
      case 'Ctrl-Alt-Shift-Down':
        evt?.preventDefault();
        this.controller.dispatch({ type: 'speak-selection' });
        break;
      case 'Ctrl-Alt-=':
      case 'Ctrl-Alt-Shift-Right':
        evt?.preventDefault();
        this.controller.dispatch({ type: 'speak-aria-post' });
        break;
    }
  }

  moveToLeftEnd() {
    this.controller.dispatch({
      type: 'jump-to-field-start'
    });
    return this;
  }

  moveToRightEnd() {
    this.controller.dispatch({
      type: 'jump-to-field-end'
    });
    return this;
  }

  typedText(text: string) {
    for (let i = 0; i < text.length; i += 1)
      this._typedTextSingle(text.charAt(i));
    return this;
  }

  private _typedTextSingle(ch: string) {
    // Mathquill has the following special case here:
    //   if (ch === '\n') return this.handle('enter');
    this.controller.dispatch({
      type: 'type-char',
      char: ch
    });
  }

  debugGetMostRecentAriaMessage() {
    return this.controller.getMostRecentAriaMessage();
  }

  debugGetCursorSelection(): MqSelection {
    return this.controller.debugGetCursorSelection();
  }

  debugGetRoot(): MqGroup {
    return this.controller.getRoot();
  }

  focus() {
    this.view.focus();
    return this;
  }

  blur() {
    this.view.blur();
    return this;
  }

  subscribeToChanges(fn: () => void): () => void {
    return this.controller.subscribeToChanges(fn);
  }

  config(config: UnprocessedMqConfig) {
    const oldConfig = this.controller.getConfig();
    const newConfig = updateConfig(oldConfig, config);
    if (isEqual(newConfig, oldConfig)) return;
    this.controller.dispatch({ type: 'set-config', config: newConfig });

    return this;
  }

  ignoreNextMousedown(fn: (evt: MouseEvent) => boolean) {
    this.config({ ignoreNextMousedown: fn });
    return this;
  }

  getAriaLabel() {
    return this.controller.getAriaLabel();
  }

  setAriaLabel(ariaLabel: string) {
    // Need the raw aria label, to avoid an extraneous dispatch when
    // the raw aria label is empty string (but the computed aria label is "Math input")
    const oldAriaLabel = this.controller.getModel().getRawAriaLabel();
    if (oldAriaLabel !== ariaLabel) {
      this.controller.dispatch({
        type: 'set-aria-label',
        label: ariaLabel
      });
    }

    return this;
  }

  getAriaPostLabel() {
    return this.controller.getAriaPostLabel();
  }

  setAriaPostLabel(ariaPostLabel: string, timeout?: number) {
    const oldPostLabel = this.getAriaPostLabel();
    if (oldPostLabel !== ariaPostLabel) {
      this.controller.dispatch({
        type: 'set-aria-post-label',
        label: ariaPostLabel,
        timeout
      });
    }

    return this;
  }

  clickAt(x: number, _y: number, target?: HTMLElement) {
    this.focus();
    this.controller.dispatch({ type: 'click-at', clientX: x, target });
    return this;
  }

  isUserSelecting() {
    return this.controller.isSelecting();
  }

  el() {
    return this.container;
  }

  private _paste(text: string) {
    this.controller.dispatch({
      type: 'write-latex',
      latex: text,
      fromPaste: true
    });
  }

  /** Returns the copied LaTeX. */
  private _copy(): string {
    return this.controller.selectedLatex();
  }

  /** Returns the cut LaTeX. */
  private _cut(): string {
    const selected = this.controller.selectedLatex();
    this.controller.dispatch({
      type: 'cut-selected'
    });
    return selected;
  }
}

// TODO-mq-rewrite-when-single -- if we update this we need to update the implementation in compare-branches as well
// TODO-mq-rewrite-when-single: can delete `normalizeOldMQLatex` when single.
export function normalizeOldMQLatex(latex: string) {
  return latex;
}

export function config(newConfig: UnprocessedMqConfig) {
  updateDefaultMqConfig(newConfig);
}

// TODO-mq-rewrite-when-single: can delete `isNewMathQuill` when single.
export const isNewMathQuill = true;

export const MQ = {
  getApiInstanceForElement,
  StaticMath,
  MathField,
  EditableField,
  MqMathFieldApi,
  normalizeOldMQLatex,
  config,
  isNewMathQuill
};
