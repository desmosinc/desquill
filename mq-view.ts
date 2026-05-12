import { v4 as uuid } from '@lukeed/uuid/secure';

import { MqRenderer } from './mathquill-renderer';
import type { MqController } from './mq-controller';
import { computeFinalMathspeak, getMathspeak } from './mq-mathspeak';
import {
  type KeyboardEventsController,
  saneKeyboardEvents
} from './sane-keyboard-events';
import { scrollHoriz, setOverflowClass } from './scroll-horiz';

export class MqView {
  private rootElt: HTMLElement;
  private rootBlock: HTMLSpanElement;
  private textarea: HTMLTextAreaElement;
  private ariaAlertElt: HTMLSpanElement;
  private mathspeakElt: HTMLElement;
  private controller: MqController;

  private scrollHorizQueued = false;

  private firstMessageSent = false;
  private firstMessageTimeout: number | null = null;

  private renderer: MqRenderer;

  constructor(
    controller: MqController,
    rootElt: HTMLElement,
    kbController: KeyboardEventsController
  ) {
    this.controller = controller;
    this.rootElt = rootElt;

    // Preserve existing classes; just add new ones, and detach children,
    // ref `mathquillify(classNames: string)` in `AbstractMathQuill` of old MQ.
    rootElt.classList.add('dcg-mq-math-mode');
    rootElt.childNodes.forEach((node) => node.remove());

    const handleMouseDown = this.handleMouseDown.bind(this);
    rootElt.addEventListener('mousedown', handleMouseDown);

    const ariaAlertElt = document.createElement('span');
    ariaAlertElt.className = 'dcg-mq-aria-alert';
    ariaAlertElt.ariaLive = 'assertive';
    ariaAlertElt.ariaAtomic = 'true';
    this.ariaAlertElt = ariaAlertElt;

    const textareaWrapper = document.createElement('span');
    textareaWrapper.className = 'dcg-mq-textarea';
    rootElt.appendChild(textareaWrapper);

    const mathspeakId = uuid();
    const mathspeak = document.createElement('span');
    mathspeak.className = 'dcg-mq-mathspeak';
    mathspeak.id = mathspeakId;
    mathspeak.setAttribute('aria-hidden', 'true');
    this.mathspeakElt = mathspeak;
    textareaWrapper.appendChild(mathspeak);

    const textarea = document.createElement('textarea');
    textarea.inputMode = 'none';
    textarea.setAttribute('autocorrect', 'off');
    textarea.setAttribute('aria-labelledby', mathspeakId);
    textarea.autocapitalize = 'none';
    textarea.spellcheck = false;
    textarea.autocomplete = 'off';
    textareaWrapper.appendChild(textarea);
    this.textarea = textarea;

    saneKeyboardEvents(textarea, kbController);
    this.addFocusAndBlurListeners();

    const rootBlock = document.createElement('span');
    rootBlock.className = 'dcg-mq-root-block';
    // Add dcg-mq-show-grouping class when enableDigitGrouping is enabled

    rootBlock.setAttribute('aria-hidden', 'true');
    rootElt.appendChild(rootBlock);
    this.rootBlock = rootBlock;

    this.updateAttributes();

    this.renderer = new MqRenderer(this.rootBlock);
  }

  updateAttributes() {
    this.updateTabIndex();
    this.rootBlock.classList.toggle(
      'dcg-mq-show-grouping',
      this.controller.getShowGrouping()
    );
    const config = this.controller.getConfig();
    this.rootElt.classList.toggle('dcg-mq-editable-field', !config.static);
  }

  updateTabIndex() {
    const tabIndex = this.tabIndex();
    this.textarea.tabIndex = tabIndex;

    const config = this.controller.getConfig();

    if (tabIndex < 0 && config.static) {
      this.textarea.setAttribute('aria-hidden', 'true');
    } else {
      this.textarea.removeAttribute('aria-hidden');
    }

    if (tabIndex >= 0) {
      this.mathspeakElt.setAttribute('aria-hidden', 'true');
    } else {
      this.mathspeakElt.removeAttribute('aria-hidden');
    }
  }

  tabIndex() {
    const config = this.controller.getConfig();
    if (config.tabindex !== undefined) {
      return config.tabindex;
    }
    return config.static ? -1 : 0;
  }

  containerHasFocus() {
    return (
      document.activeElement && this.rootElt.contains(document.activeElement)
    );
  }

  updateAriaView() {
    const model = this.controller.getModel();

    if (model.ariaQueue.length === 0) {
      // Nothing to alert.
      return;
    }

    const msg = model.ariaQueue
      .join(' ')
      .replace(/ +(?= )/g, '')
      .trim();

    // Set msg regardless of focus, for tests
    this.controller.setMostRecentAriaMessage(msg);

    if (!this.containerHasFocus()) {
      // To cut down on potential verbiage from multiple Mathquills firing near-simultaneous ARIA alerts,
      // update the text of this instance if its container also has keyboard focus.
      // If it does not, leave the DOM unchanged but flush the queue regardless.
      // Note: updating the msg variable regardless of focus for unit tests.
      return;
    }

    if (model.config.logAriaAlerts && msg) {
      // eslint-disable-next-line no-console
      console.log(msg);
    }

    // Only mount the element if it's not already in the DOM
    // This ensures we create the ARIA element lazily on first use
    if (this.ariaAlertElt.parentNode !== this.rootElt) {
      // Append the element empty first to ensure screen readers detect the live region
      // before any content is added. This fixes the issue where the first alert isn't announced.
      this.rootElt.prepend(this.ariaAlertElt);
    }

    // For the first message, use a 50ms delay to ensure the empty live region
    // is registered with screen readers before adding content. Screen readers need
    // actual time (not just a different execution context) to process the empty element.
    // We debounce to ensure that if multiple messages arrive within the first 50ms,
    // only the final message is announced (avoiding out-of-order announcements).
    if (!this.firstMessageSent) {
      if (this.firstMessageTimeout !== null) {
        clearTimeout(this.firstMessageTimeout);
      }
      this.firstMessageTimeout = setTimeout(() => {
        this.firstMessageSent = true;
        this.firstMessageTimeout = null;
        this.ariaAlertElt.textContent = msg;
      }, 50);
    } else {
      this.ariaAlertElt.textContent = msg;
    }
  }

  updateView() {
    const root = this.controller.getRoot();
    const focusState = this.controller.getFocusState();
    const model = this.controller.getModel();

    this.updateAttributes();
    this.updateAriaView();

    this.renderer.render(model, focusState);

    this.setTextareaSelection();

    const ariaLabel = model.getAriaLabel();

    // Do not update the mathspeak when focused, to prevent double-speech.
    // The mathspeak will update when it's blurred.
    // (Updating the aria-label attribute of a focused element will cause most screen readers to announce the new value)
    if (this.controller.getFocusState() !== 'focused') {
      const updatedMathspeak = getMathspeak(
        model.root,
        model.getMathspeakOptions()
      );
      this.mathspeakElt.textContent = computeFinalMathspeak(
        ariaLabel,
        updatedMathspeak,
        model.getAriaPostLabel()
      );
    }

    const isEmpty = root.children.length === 0;
    const isFocused = this.controller.getFocusState() === 'focused';

    this.rootElt.classList.toggle('dcg-mq-focused', isFocused);
    this.rootBlock.classList.toggle('dcg-mq-hasCursor', isFocused);
    this.rootBlock.classList.toggle('dcg-mq-empty', isEmpty && !isFocused);

    this.controller.markAfterRender();

    if (!this.scrollHorizQueued) {
      // Wait for `requestAnimationFrame` to call `scrollHoriz`.
      //
      // This prevents `scrollHoriz` from being called until right before rendering, so
      // it is always called at most once per event, and with the right selection corresponding
      // to what is about to get rendered. This fixes two problems:
      // 1. A single mouse down event (`handleMouseDown` below) leads to a `focus` action followed by a `mouse-down`
      //    action dispatched to the MQ controller. The correct selection is only updated after the `mouse-down`, so
      //    we don't want the `focus` action to cause a scroll to the right.
      //    (This could be worked around without a requestAnimationFrame by setting a flag within
      //    the `mouse-down` event to skip the `scrollHoriz` caused by the `focus` action).
      // 2. Likewise, at time of writing, down arrow into an expression cell in notebook calls the MQ API methods
      //    `.focus()` then `.selection(...)`. These dispatch `focus` and `api-set-selection` events.
      //    (This has no easy workaround similar to (1) since that would require adding new MQ API methods).
      this.scrollHorizQueued = true;
      requestAnimationFrame(() => {
        this.scrollHorizQueued = false;
        scrollHoriz(this.controller);
      });
    }

    setOverflowClass(this.controller);
  }

  /**
   * Set the contents of the textarea and select it, so e.g. `window.getSelection`
   * and `textarea.selectionStart` works, used for `hasSelection` in sane-keyboard-events.
   */
  setTextareaSelection() {
    if (document.activeElement !== this.textarea) {
      // Normally this is impossible when the selection is nonempty
      // because a blur would clear the selection. However, sometimes a
      // mq event can be dispatched _between_ when a different element
      // is focused and when the blur is actually dispatched, such as
      // if mq config tabindex is updated in the same synchronous JS that
      // also focuses an element than the mathquill textarea.
      return;
    }
    const selection = this.controller.getLatexSelection();
    const text = selection.latex.slice(
      selection.startIndex,
      selection.endIndex
    );
    this.textarea.value = text;
    if (text !== '') {
      // This focuses the textarea as well, but the textarea is already focused, so no problem.
      this.textarea.select();
    }
  }

  focus() {
    this.textarea.focus();
  }

  blur() {
    this.textarea.blur();
  }

  handleMouseDown(evt: MouseEvent) {
    if (evt.target === null) return;

    evt.preventDefault();

    const ownerDocument = this.rootElt.ownerDocument;

    const ignoreNextMousedown = this.controller.getConfig().ignoreNextMousedown;
    if (ignoreNextMousedown?.(evt)) {
      return;
    }

    if ((evt.target as Element).closest('.dcg-mq-ignore-mousedown')) {
      // some elements should not act like internal mathquill nodes. Tokens for instance define external
      // click / hover behaviors. So we have mathquill act like the item was never clicked. This allows
      // us to click a token without putting focus in the mathquill.
      return;
    }

    this.focus();

    // outside rootElement, the MathQuill node corresponding to the target (if any)
    // won't be inside this root, so don't mislead Controller::seek with it.
    // i.e. set the target only on a `mousemove` inside the `rootElt`, not in the
    let lastMousemoveTarget: Element | undefined;
    const askIfShouldIgnoreMousemove =
      this.controller.getConfig().askIfShouldIgnoreMousemove;
    const mousemove = (evt: MouseEvent) => {
      if (askIfShouldIgnoreMousemove?.(evt, this.rootElt)) return;
      lastMousemoveTarget = (evt.target as Element | null) ?? undefined;
    };
    const onDocumentMouseMove = (evt: MouseEvent) => {
      if (askIfShouldIgnoreMousemove?.(evt, this.rootElt)) return;
      this.controller.dispatch({
        type: 'mouse-move',
        clientX: evt.clientX,
        target: lastMousemoveTarget
      });
      if (this.textarea !== document.activeElement) {
        this.focus();
      }
      lastMousemoveTarget = undefined;
    };

    const unbindListeners = () => {
      // delete the mouse handlers now that we're not dragging anymore
      this.rootElt.removeEventListener('mousemove', mousemove);
      ownerDocument.removeEventListener('mousemove', onDocumentMouseMove);
      ownerDocument.removeEventListener('mouseup', onDocumentMouseUp);
    };

    const onDocumentMouseUp = () => {
      unbindListeners();
      this.controller.dispatch({
        type: 'mouse-up'
      });
    };

    this.rootElt.addEventListener('mousemove', mousemove);
    ownerDocument.addEventListener('mousemove', onDocumentMouseMove);
    ownerDocument.addEventListener('mouseup', onDocumentMouseUp);

    this.controller.dispatch({
      type: 'mouse-down',
      target: (evt.target as Element | null) ?? undefined,
      clientX: evt.clientX
    });
  }

  private blurTimeout: number;
  addFocusAndBlurListeners() {
    this.textarea.addEventListener('focus', () => {
      clearTimeout(this.blurTimeout);

      // It is possible for a dispatch-in-dispatch here if other actions can put focus in the mq,
      // but that's okay since there is a special case that focus does not count as dispatch-in-dispatch.
      this.controller.dispatch({ type: 'focus' });
    });
    this.textarea.addEventListener('blur', () => {
      // Wait until after the event cycle, so we know if the document has focus.
      this.blurTimeout = setTimeout(() => {
        this.controller.dispatch({
          type: 'blur',
          intentional: document.hasFocus()
        });
      });
    });
  }
}
