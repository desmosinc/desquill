# DesQuill

Welcome to DesQuill! This is Desmos's internal fork of [MathQuill](http://mathquill.com/), a web formula editor designed to make typing math easy and beautiful.

Our goal with this fork was to make a compatible drop-in replacement for MathQuill that would be easier for us to maintain and expand. This fork has been extensively tested for consistency with MathQuill's APIs and LaTeX rendering, but it may diverge over time.

Although this is intended for internal use, and we aren't accepting external Pull Requests or Issues on this repository, we welcome your feedback at <feedback@desmos.com>. Everything in this repository is available under the [MPL 2.0 License](#open-source-license), and we hope that our changes might be useful in your projects as well.

## Getting Started

DesQuill inherits the simple interface of MathQuill. This brief example creates an editable MathField and renders, then reads, a given input:

```javascript
import * as MQ from './mq-public-api';

const htmlElement = document.getElementById('some_id');
const config = {
  restrictMismatchedBrackets: true
};
const mq = MQ.MathField(htmlElement, config);

mq.latex('2^{\\frac{3}{2}}'); // Renders the given LaTeX in the MathQuill field
mq.latex(); // => '2^{\\frac{3}{2}}'
```

## Docs

The API Methods are documented at [docs/Api_Methods.md](docs/Api_Methods.md).

Some config options are documented at [docs/Config.md](docs/Config.md).

## How DesQuill differs from MathQuill

DesQuill keeps MathQuill's public API, but the core is rewritten from scratch with a few goals:

- Unidirectional model/view architecture
- Centralized handling of actions through a single dispatcher (see `mq-actions.ts`)
- No reliance on jQuery fragments
- Synchronous rendering from state
- Localization for Mathspeak and ARIA output, backed by Fluent

API-visible differences are cataloged in [docs/Differences.md](docs/Differences.md).

## History

MathQuill was originally by [Han](http://github.com/laughinghan), [Jeanine](http://github.com/jneen), and [Mary](http://github.com/stufflebear) (<maintainers@mathquill.com>). It is hosted at https://github.com/mathquill/mathquill. This rewrite, by the team at [Desmos](https://www.desmos.com/), is based on our fork at https://github.com/desmosinc/mathquill, which is no longer being maintained.

## Open-Source License

The Source Code Form of DesQuill is subject to the terms of the Mozilla Public
License, v. 2.0: [http://mozilla.org/MPL/2.0/](http://mozilla.org/MPL/2.0/)