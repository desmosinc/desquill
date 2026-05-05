# Known differences from old MQ.

- Old MQ rewrited going through `MQ = MathQuill.getInterface(3)`, but new MQ directly exports one interface version.
- Old MQ can run `MQ.config()` even once an MQ field is initialized. New MQ would throw "Cannot update global config after an MQ field has already been instantiated"
- Old MQ has `MQ` itself be a function. New MQ has it be a function, namely `MQ.getApiInstanceForElement`
- New MQ is missing the `cmd`, `id`, `data`, `revert`, `reflow`, `html`, `moveToDirEnd`, `text`, `dropEmbedded` properties on an API instance.
- New MQ is missing the `InnerMathField` and `registerEmbed` properties on the `MQ` API.
- New MQ `.write()` API writes to the end of the field when the field is not focused. (Old MQ wrote to its the cursor's last position.)
- New MQ silently ignores methods like `.write("abc")` that do not apply to static math. Old MQ would throw an error in that case.

Removed config properties:

- `spaceBehavesLikeTab` (now treated as false always)
- `tripleDotsAreEllipsis` (now treated as true always)
- `disableAutoSubstitutionInSubscripts` (now treated as `{except: 'log'}`).
- `handlers`
