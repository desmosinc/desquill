// Sane Keyboard Events, from `mathquill/src/services/saneKeybaordEvents.util.ts`
//
// An abstraction layer over the raw browser browser events
// on the textarea that hides all the nasty cross-
// browser incompatibilities behind a uniform API.
//
// Design goal: This is a *HARD* internal
// abstraction barrier. Cross-browser
// inconsistencies are not allowed to leak through
// and be dealt with by event handlers. All future
// cross-browser issues that arise must be dealt
// with here, and if necessary, the API updated.

function noop() {}

export type TextareaKeyboardEvent =
  | 'keydown'
  | 'keypress'
  | 'keyup'
  | 'focusout'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'input';
export type TextareaKeyboardEventListeners = {
  [K in TextareaKeyboardEvent]?: (event: HTMLElementEventMap[K]) => void;
};

/** Poller that fires once every tick. */
class EveryTick<Args extends unknown[] = []> {
  private timeoutId: number;
  private fn: (...args: Args | []) => void = noop;
  constructor() {}

  listen(fn: (...args: Args | []) => void) {
    this.fn = fn;
    clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(this.fn);
  }

  listenOnce(fn: (...args: Args | []) => void) {
    this.listen((...args: Args | []) => {
      this.clearListener();
      fn(...args);
    });
  }

  clearListener() {
    this.fn = noop;
    clearTimeout(this.timeoutId);
  }

  trigger(...args: Args | []) {
    this.fn(...args);
  }
}

// This is a subset of the type of `Controller` from `mathquill/src/services/textarea`
export interface KeyboardEventsController {
  keystroke(key: string, evt: KeyboardEvent): void;
  typedText(text: string): void;
  paste(text: string): void;
  /** Returns the cut LaTeX */
  cut(): string;
  /** Returns the copied LaTeX */
  copy(): string;
  options: {
    disableCopyPaste?: boolean;
    overridePaste?: (evt?: ClipboardEvent) => boolean;
    overrideCopy?: (evt?: ClipboardEvent) => boolean;
    overrideCut?: (evt?: ClipboardEvent) => boolean;
  };
  KIND_OF_MQ: 'StaticMath' | 'MathField' | 'InnerMathField' | 'TextField';
}

// The following [key values][1] map was compiled from the
// [DOM3 Events appendix section on key codes][2] and
// [a widely cited report on cross-browser tests of key codes][3],
// except for 10: 'Enter', which I've empirically observed in Safari on iOS
// and doesn't appear to conflict with any other known key codes.
//
// [1]: http://www.w3.org/TR/2012/WD-DOM-Level-3-Events-20120614/#keys-keyvalues
// [2]: http://www.w3.org/TR/2012/WD-DOM-Level-3-Events-20120614/#fixed-virtual-key-codes
// [3]: http://unixpapa.com/js/key.html
const WHICH_TO_MQ_KEY_STEM: Record<number, string | undefined> = {
  8: 'Backspace',
  9: 'Tab',

  10: 'Enter', // for Safari on iOS

  13: 'Enter',

  16: 'Shift',
  17: 'Control',
  18: 'Alt',
  20: 'CapsLock',

  27: 'Esc',

  32: 'Spacebar',

  33: 'PageUp',
  34: 'PageDown',
  35: 'End',
  36: 'Home',

  37: 'Left',
  38: 'Up',
  39: 'Right',
  40: 'Down',

  45: 'Insert',

  46: 'Del',

  144: 'NumLock'
};

const KEY_TO_MQ_KEY_STEM: Record<string, string | undefined> = {
  ArrowRight: 'Right',
  ArrowLeft: 'Left',
  ArrowDown: 'Down',
  ArrowUp: 'Up',
  Delete: 'Del',
  Escape: 'Esc',
  ' ': 'Spacebar'
};

function isArrowKey(e: KeyboardEvent) {
  // The keyPress event in FF reports which=0 for some reason. The new
  // .key property seems to report reasonable results, so we're using that
  switch (getMQKeyStem(e)) {
    case 'Right':
    case 'Left':
    case 'Down':
    case 'Up':
      return true;
  }
  return false;
}

function isLowercaseAlphaCharacter(s: string) {
  return s.length === 1 && s >= 'a' && s <= 'z';
}

function getMQKeyStem(evt: KeyboardEvent) {
  // Translate browser key names to MQ's internal naming system
  //
  // Ref: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values
  if (evt.key === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const which = evt.which || evt.keyCode;
    return WHICH_TO_MQ_KEY_STEM[which] || String.fromCharCode(which);
  }
  if (isLowercaseAlphaCharacter(evt.key)) return evt.key.toUpperCase();
  return KEY_TO_MQ_KEY_STEM[evt.key] ?? evt.key;
}

/** To the extent possible, create a normalized string representation
 * of the key combo (i.e., key code and modifier keys). */
function getMQKeyName(evt: KeyboardEvent) {
  const key = getMQKeyStem(evt);
  const modifiers = [];

  if (evt.ctrlKey) modifiers.push('Ctrl');
  if (evt.metaKey) modifiers.push('Meta');
  if (evt.altKey) modifiers.push('Alt');
  if (evt.shiftKey) modifiers.push('Shift');

  if (!modifiers.length) return key;

  // Don't append the key name if it already exists as a modifier, e.g. Ctrl-Control and Shift-Shift is nonsensical.
  if (key !== 'Alt' && key !== 'Control' && key !== 'Meta' && key !== 'Shift')
    modifiers.push(key);
  return modifiers.join('-');
}

/** Add the given event listeners on textarea. Does not replace existing listeners, if any. */
function addTextareaEventListeners(
  textarea: HTMLElement,
  listeners: TextareaKeyboardEventListeners
) {
  for (const [key, newListener] of Object.entries(listeners)) {
    const event = key as keyof typeof listeners;
    textarea.addEventListener(event, newListener as EventListener);
  }
}

export function saneKeyboardEvents(
  /** Usually the textarea associated with a MQ instance, but can be another kind of element if `substituteTextarea` was used to replace it with something else. */
  textarea: HTMLElement,
  controller: KeyboardEventsController
) {
  let keydown: KeyboardEvent | null = null;
  let keypress: KeyboardEvent | null = null;

  // everyTick.listen() is called after key or clipboard events to
  // say "Hey, I think something was just typed" or "pasted" etc,
  // so that at all subsequent opportune times (next event or timeout),
  // will check for expected typed or pasted text.
  // Need to check repeatedly because #135: in Safari 5.1 (at least),
  // after selecting something and then typing, the textarea is
  // incorrectly reported as selected during the input event (but not
  // subsequently).
  const everyTick = new EveryTick<[Event]>();

  function guardedTextareaSelect() {
    try {
      // IE can throw an 'Incorrect Function' error if you
      // try to select a textarea that is hidden. It seems
      // likely that we don't really care if the selection
      // fails to happen in this case. Why would the textarea
      // be hidden? And who would even be able to tell?
      if (textarea instanceof HTMLTextAreaElement) textarea.select();
    } catch (_e) {
      // Ignore error
    }
  }

  // -*- helper subroutines -*- //

  // Determine whether there's a selection in the textarea.
  // This will always return false in IE < 9, which don't support
  // HTMLTextareaElement::selection{Start,End}.
  function hasSelection() {
    if (!('selectionStart' in textarea)) return false;
    if (!(textarea instanceof HTMLTextAreaElement)) return false;
    return textarea.selectionStart !== textarea.selectionEnd;
  }

  function handleKey() {
    controller.keystroke(getMQKeyName(keydown!), keydown!);
  }

  // -*- event handlers -*- //
  function onKeydown(e: KeyboardEvent) {
    everyTick.trigger(e);
    if (e.target !== textarea) return;
    keydown = e;
    keypress = null;

    if (isArrowKey(e)) {
      // Without this `preventDefault`, a Shift-Left on a field with contents of `x` would
      // (1) select the character `x` in the MQ model,
      // (2) which causes the view to put `x` in the textarea and select it,
      // (3) then perform the default action, which removes the selection in the textarea.
      // With the selection gone, the next key-up (on the Shift) would be interpreted as having
      // just typed the character `x`.
      // (I don't know why Shift-Home doesn't need this same treatment)
      // (I also don't know why this can only be replicated in notebook but not in the demo page
      // inside a contenteditable div).
      e.preventDefault();
    }

    handleKey();
  }

  function onKeypress(e: KeyboardEvent) {
    everyTick.trigger(e);
    if (e.target !== textarea) return;
    // call the key handler for repeated keypresses.
    // This excludes keypresses that happen directly
    // after keydown.  In that case, there will be
    // no previous keypress, so we skip it here
    if (keydown && keypress) handleKey();

    keypress = e;

    // only check for typed text if this key can type text. Otherwise
    // you can end up with mathquill thinking text was typed if you
    // use the mq.keystroke('Right') command while a single character
    // is selected. Only detected in FF.
    if (!isArrowKey(e)) {
      everyTick.listen(typedText);
    } else {
      everyTick.listenOnce(maybeReselect);
    }
  }

  function onKeyup(e: KeyboardEvent) {
    everyTick.trigger(e);
    if (e.target !== textarea) return;
    // Handle case of no keypress event being sent
    if (!!keydown && !keypress) {
      // only check for typed text if this key can type text. Otherwise
      // you can end up with mathquill thinking text was typed if you
      // use the mq.keystroke('Right') command while a single character
      // is selected. Only detected in FF.
      if (!isArrowKey(e)) {
        everyTick.listen(typedText);
      } else {
        everyTick.listenOnce(maybeReselect);
      }
    }
  }

  function typedText() {
    // If there is a selection, the contents of the textarea couldn't
    // possibly have just been typed in.
    // This happens in browsers like Firefox and Opera that fire
    // keypress for keystrokes that are not text entry and leave the
    // selection in the textarea alone, such as Ctrl-C.
    // Note: we assume that browsers that don't support hasSelection()
    // also never fire keypress on keystrokes that are not text entry.
    // This seems reasonably safe because:
    // - all modern browsers including IE 9+ support hasSelection(),
    //   making it extremely unlikely any browser besides IE < 9 won't
    // - as far as we know IE < 9 never fires keypress on keystrokes
    //   that aren't text entry, which is only as reliable as our
    //   tests are comprehensive, but the IE < 9 way to do
    //   hasSelection() is poorly documented and is also only as
    //   reliable as our tests are comprehensive
    // If anything like #40 or #71 is reported in IE < 9, see
    // b1318e5349160b665003e36d4eedd64101ceacd8
    if (hasSelection()) return;
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    const text = textarea.value;

    // In Linux and Chrome or Chrome OS, users may issue the Ctrl-Shift-U command to input a Unicode character.
    // Unfortunately, when the system is in this state, Chrome sends a keydown of "Ctrl-Shift-Unidentified" in Linux, "Ctrl-Shift-U" on Windows/Mac, or "Ctrl-Shift-Process" in the latest Chrome OS.
    // A keydown of "Unidentified" without modifiers has also been observed in some circumstanced from Chrome under ChromeOS.
    // Equally vexing is that the keyup correctly comes back as Ctrl-Shift-U.
    // Furthermore, an input event with the value "u" is still processed in Linux and Chrome OS due to the down/up mismatch.
    // The end result is that a spurious "u" is sent followed by the intended character.
    // Due to how this feature works, it's vital to completely ignore Ctrl-Shift-U no matter how the input event appears to Mathquill as clearing the textarea by mistake breaks the expected input flow.
    if (
      keydown &&
      (keydown.key === 'Unidentified' ||
        (!keydown.altKey &&
          keydown.ctrlKey &&
          !keydown.metaKey &&
          keydown.shiftKey &&
          (keydown.key === 'U' || keydown.key === 'Process')))
    )
      return;
    if (text.length === 1) {
      textarea.value = '';
      controller.typedText(text);
    } // in Firefox, keys that don't type text, just clear seln, fire keypress
    // https://github.com/mathquill/mathquill/issues/293#issuecomment-40997668
    else maybeReselect(); // re-select if that's why we're here
  }

  function maybeReselect() {
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    if (textarea.value.length > 1) {
      guardedTextareaSelect();
    }
  }

  function onBlur() {
    keydown = null;
    keypress = null;
    everyTick.clearListener();
    if (textarea instanceof HTMLTextAreaElement) textarea.value = '';
  }

  function onPaste(evt: ClipboardEvent) {
    everyTick.trigger();
    if (evt.target !== textarea) return;

    // In Linux, middle-click pasting causes onPaste to be called,
    // when the textarea is not necessarily focused.  We focus it
    // here to ensure that cursor movement works afterwards.
    if (document.activeElement !== textarea) {
      textarea.focus();
    }

    evt.preventDefault();

    const pastedText = evt.clipboardData?.getData('text/plain');
    if (!pastedText) return;

    const earlyReturn = controller.options.overridePaste?.(evt);
    if (earlyReturn) return;

    controller.paste(pastedText);
  }

  function onInput(e: Event) {
    everyTick.trigger(e);
  }

  if (controller.KIND_OF_MQ === 'StaticMath') {
    addTextareaEventListeners(textarea, {
      keydown: (evt: KeyboardEvent) => {
        controller.keystroke(getMQKeyName(evt!), evt);
      }
    });
    return;
  }

  if (controller.options && controller.options.disableCopyPaste) {
    addTextareaEventListeners(textarea, {
      keydown: onKeydown,
      keypress: onKeypress,
      keyup: onKeyup,
      focusout: onBlur,
      copy: function (e: ClipboardEvent) {
        e.preventDefault();
      },
      cut: function (e: ClipboardEvent) {
        e.preventDefault();
      },
      paste: function (e: ClipboardEvent) {
        everyTick.trigger();
        e.preventDefault();
      },
      input: onInput
    });
  } else {
    addTextareaEventListeners(textarea, {
      keydown: onKeydown,
      keypress: onKeypress,
      keyup: onKeyup,
      focusout: onBlur,
      cut: function (evt: ClipboardEvent) {
        if (!evt.clipboardData) {
          return;
        }
        const earlyReturn = controller.options.overrideCut?.(evt);
        if (earlyReturn) return;

        const selectedLatex = controller.cut();
        evt.clipboardData.setData('text/plain', selectedLatex);
        evt.clipboardData.setData('application/x-latex', selectedLatex);
        evt.preventDefault();
        evt.stopPropagation(); // otherwise list-view will do yellow-copy cut since there is now no selection
      },
      copy: function (evt: ClipboardEvent) {
        if (!evt.clipboardData) {
          return;
        }
        const earlyReturn = controller.options.overrideCopy?.(evt);
        if (earlyReturn) return;

        const selectedLatex = controller.copy();
        evt.clipboardData.setData('text/plain', selectedLatex);
        evt.clipboardData.setData('application/x-latex', selectedLatex);
        evt.preventDefault();
      },
      paste: onPaste,
      input: onInput
    });
  }
}
