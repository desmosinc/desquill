# MathQuill

MathQuill is a web formula editor designed to make typing math easy and beautiful.

This is Desmos's internal fork, made source-available in [accordance with the MPL](#open-source-license). Development is not performed on this repository, and we are not accepting pull requests or issues on this repository. For suggestions regarding MathQuill in Desmos, email <feedback@desmos.com>.

## Getting Started

MathQuill has a simple interface. This brief example creates a MathQuill element and renders, then reads a given input:

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

Check out our [Getting Started Guide](http://docs.mathquill.com/en/latest/Getting_Started/) for setup instructions and basic MathQuill usage.

## Docs

The API Methods are documented at [docs/Api_Methods.md](docs/Api_Methods.md).

Some config options are documented at [docs/Config.md](docs/Config.md).

## History

Mathquill was originally by [Han](http://github.com/laughinghan), [Jeanine](http://github.com/jneen), and [Mary](http://github.com/stufflebear) (<maintainers@mathquill.com>). It was hosted at https://github.com/mathquill/mathquill. This rewrite, by the team at [Desmos](https://www.desmos.com/) is based on our fork at https://github.com/desmosinc/mathquill but rewrote nearly all of the code. Significant API differences are documented at [docs/Differences.md](docs/Differences.md).

## Open-Source License

The Source Code Form of MathQuill is subject to the terms of the Mozilla Public
License, v. 2.0: [http://mozilla.org/MPL/2.0/](http://mozilla.org/MPL/2.0/)

The quick-and-dirty is you can do whatever if modifications to MathQuill are in
public GitHub forks. (Other ways to publicize modifications are also fine, as
are private use modifications. See also: [MPL 2.0 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/))
