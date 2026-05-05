import type { LeftOrRight, UpOrDown } from './cursor';
import type { MqConfig } from './mq-config';
import type { ExportedLatexSelection } from './mq-public-api';

export type ArrowAction =
  | {
      type: 'ArrowLeft';
      shiftKey: boolean;
    }
  | {
      type: 'ArrowRight';
      shiftKey: boolean;
    }
  | {
      type: 'ArrowUp';
      shiftKey: boolean;
    }
  | {
      type: 'ArrowDown';
      shiftKey: boolean;
    };

export type MQAction =
  | { type: 'tick' }
  | { type: 'show-grouping' }
  | { type: 'focus' }
  | {
      type: 'blur';
      /**
       * `intentional` is typically true, e.g. when you click/tab/arrow around the page.
       * It's false when the blur is due to focusing a different window.
       */
      intentional: boolean;
    }
  | { type: 'set-config'; config: MqConfig }
  | { type: 'arrow-left-right'; dir: LeftOrRight }
  | { type: 'shift-left-right'; dir: LeftOrRight }
  | { type: 'arrow-up-down'; updown: UpOrDown }
  | { type: 'shift-up-down'; updown: UpOrDown }
  | { type: 'home-end'; dir: LeftOrRight }
  | { type: 'shift-home-end'; dir: LeftOrRight }
  | { type: 'ctrl-shift-home-end'; dir: LeftOrRight }
  | { type: 'select-all' }
  | { type: 'jump-to-field-end' }
  | { type: 'jump-to-field-start' }
  | { type: 'cut-selected' }
  | {
      type: 'type-char';
      char: string;
    }
  | { type: 'write-latex'; latex: string; fromPaste: boolean }
  | { type: 'delete-in-direction'; direction: LeftOrRight }
  | { type: 'ctrl-delete-in-direction'; direction: LeftOrRight }
  | {
      type: 'escape-dir';
      direction: LeftOrRight;
      /** Event to be `preventDefault`'d unless the cursor is already at the root node. */
      evt: KeyboardEvent | undefined;
    }
  | { type: 'mouse-down'; target: Element | undefined; clientX: number }
  | { type: 'mouse-move'; target: Element | undefined; clientX: number }
  | { type: 'mouse-up' }
  | { type: 'click-at'; target: Element | undefined; clientX: number }
  | { type: 'api-set-latex'; latex: string }
  | { type: 'api-clear-selection' }
  | { type: 'api-set-selection'; selection: ExportedLatexSelection }
  | { type: 'set-aria-label'; label: string }
  | { type: 'set-aria-post-label'; label: string; timeout: number | undefined }
  | {
      /** Ctrl-Alt-Left or Ctrl-Alt-Right */
      type: 'speak-block-dir';
      dir: LeftOrRight;
    }
  | {
      /** Ctrl-Alt-Up */
      type: 'speak-parent-block';
    }
  | {
      /** Ctrl-Alt-Down */
      type: 'speak-current-block';
    }
  | {
      /** Ctrl-Alt-Shift-Down */
      type: 'speak-selection';
    }
  | {
      /** Ctrl-Alt-= or Ctrl-Alt-Shift-Right */
      type: 'speak-aria-post';
    }
  | {
      /** Auto-dispatched after a delay from `setAriaPostLabel` */
      type: 'speak-aria-post-after-timeout';
    };

export function actionAllowedForStatic(action: MQAction) {
  switch (action.type) {
    case 'tick':
    case 'focus':
    case 'blur':
    case 'set-config':
    case 'api-set-latex':
    case 'api-clear-selection':
    case 'api-set-selection':
    case 'mouse-down':
    case 'mouse-move':
    case 'mouse-up':
    case 'set-aria-label':
    case 'set-aria-post-label':
      return true;
    default:
      return false;
  }
}
