# API Methods

To use the MathQuill API, import from `mq-public-api`.

```js
import * as MQ from './mq-public-api';
```

(This mirrors the API from old MQ, which was `var MQ = MathQuill.getInterface(3);`).

# Constructors

## MQ.MathField(html_element, [ config ])

Creates an editable MathQuill initialized with the contents of the HTML element and returns a [MqMathFieldApi object](#editable-mathfield-methods).

If the given element is already a math field, an error is thrown.

## MQ.StaticMath(html_element, [ config ])

Same as `MQ.MathField` but defaults `static` in the config to true.

## MQ.getApiInstanceForElement(html_element)

`MQ.getApiInstanceForElement` is a function that takes an HTML element and, if it's the root
HTML element of a static math or math field, returns an API object for it
(if not, `undefined`):

```js
MQ.getApiInstanceForElement(document.querySelector('.dcg-mq-math-mode')); // => MqMathFieldApi
MQ.getApiInstanceForElement(document.body); // => undefined
```

## MQ.config(config)

Updates the default [configuration options](Config.md) for this instance of the API (which can be overridden on a per-field basis -- see the `MQ.MathField` and `MQ.StaticMath` constructors above).

```javascript
MQ.config(myConfig);
MQ.MathField(element); // configured with myConfig
```

# MathQuill methods

The following are methods that every MathQuill object has.

## .el()

Returns the root HTML element.

## .latex()

Returns the contents as LaTeX.

## .latex(latex_string)

This will render the argument as LaTeX in the MathQuill instance.

## .selection()

Returns the current cursor position / selection within the latex.
If the cursor is before the plus this method would return:

```js
{
  latex: 'a+b',
  startIndex: 1,
  endIndex: 1
}
```

You can pass the result of `.selection()` back into `.selection()` to restore a cursor / selection.

```js
mq.latex('abc');
mq.select();
const selection = mq.selection(); // takes a snapshot of the selection
mq.latex('123');
mq.latex('abc');
mq.selection(selection); // will restore the selection
```

If the latex changes, the selection update is ignored:

```js
mq.latex('abc');
mq.select();
const selection = mq.selection(); // takes a snapshot of the selection
mq.latex('123');
mq.selection(selection); // will NOT restore the selection
```

## .domNodeToSpan(domNode)

Returns the span of a given DOM node. If the DOM node is the `<span class="mq-binary-operator">+</span>` of a field with latex `a+b`, this method would return

```js
{
  latex: 'a+b',
  startIndex: 1,
  endIndex: 2
}
```

If the DOM node is not a child of the root DOM node of this API instance, `domNodeToSpan` returns `undefined`.

You can pass the result of `.domNodeToSpan(...)` into `.selection(...)` to select a given node:

```js
el = document.querySelector('.mq-binary-operator');
const span = mq.domNodeToSpan(el);
mq.selection(span);
```

Note that this method also works for children of a node, so calling it on the child of a `\token{1}` still returns the span of the `\token{1}`.

If the input node corresponds to a group such as a numerator, then the selected span is that for all children of the group, not including the `{}`. For example, if the DOM node is the `<span>` of class `.mq-numerator` of a field with latex `\frac{12}{34}`, this method would return

```js
{
  latex: "\\frac{12}{34}",
  startIndex: 6,
  endIndex: 8
}
```

That span corresponds to the substring `"12"`, not to the substring `"{12}"`.

## .focus()

Puts the focus on the math field.

## .blur()

Removes focus from the math field.

## .write(latex_string)

Write the given LaTeX at the current cursor position. If the cursor does not have focus, writes to the end of the field.

```javascript
mathField.write(' - 1'); // writes ' - 1' to mathField at the cursor position
```

## .select()

Selects the contents (just like [on `textarea`s](http://www.w3.org/TR/DOM-Level-2-HTML/html.html#ID-48880622) and [on `input`s](http://www.w3.org/TR/DOM-Level-2-HTML/html.html#ID-34677168)).

## .clearSelection()

Clears the selection.

## .moveToLeftEnd(), .moveToRightEnd()

Move the cursor to the left/right end of the editable field, respectively. These are shorthand for [`.moveToDirEnd(L/R)`](#movetodirenddirection), respectively.

## .keystroke(keys)

Simulates keystrokes given a string like `"Ctrl-Home Del"`, a whitespace-delimited list of [key inputs](http://www.w3.org/TR/2012/WD-DOM-Level-3-Events-20120614/#fixed-virtual-key-codes) with optional prefixes.

```javascript
mathField.keystroke('Shift-Left'); // Selects character before the current cursor position
```

## .typedText(text)

Simulates typing text, one character at a time from where the cursor currently is. This is supposed to be identical to what would happen if a user were typing the text in.

```javascript
// Types part of the demo from mathquill.com without delays between keystrokes
mathField.typedText('x=-b\\pm \\sqrt b^2 -4ac');
```

## .setAriaLabel(ariaLabel)

Specify an [ARIA label][`aria-label`] for this field, for screen readers. The actual [`aria-label`] includes this label followed by the math content of the field as speech. Default: `'Math Input'`

## .getAriaLabel()

Returns the [ARIA label][`aria-label`] for this field, for screen readers. If no ARIA label has been specified, `'Math Input'` is returned.

## .setAriaPostLabel(ariaPostLabel, timeout)

Specify a suffix to be appended to the [ARIA label][`aria-label`], after the math content of the field. Default: `''` (empty string)

If a timeout (in ms) is supplied, and the math field has keyboard focus when the time has elapsed, an ARIA alert will fire which will cause a screen reader to read the content of the field along with the ARIA post-label. This is useful if the post-label contains an evaluation, error message, or other text that the user needs to know about.

## .getAriaPostLabel()

Returns the suffix to be appended to the [ARIA label][`aria-label`], after the math content of the field. If no ARIA post-label has been specified, `''` (empty string) is returned.

## .isUserSelecting()

Returns `true` if the user is currently selecting text with the mouse, `false` otherwise. This can be useful for preventing certain actions (like setting the cursor position) while the user is actively dragging to select text. The method tracks mouse selection from the moment the user presses the mouse button down to start selecting until they release it or the selection is cancelled due to an edit operation.

```javascript
if (!mathField.isUserSelecting()) {
  // Safe to programmatically change cursor position
  mathField.moveToLeftEnd();
}
```

[`aria-label`]: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-label

## .config(new_config)

Changes the [configuration](Config.md) of just this math field.
