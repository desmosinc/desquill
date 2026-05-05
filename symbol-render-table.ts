export const stringReplace: { [key: string]: string | undefined } = {
  '\\ ': '\u00A0',
  // this is really weird. The tildeNbsp isn't something that we can normally use. We've decided to map `~` to the
  // \sim command. But it's possible for \tildeNbsp to exist in latex. If it does it will be mapped to the `~` symbol
  // in the latex. This string lookup is based on the latex outputted so ~ will map to a &nbsp; character. Our system
  // is going to round-trip this ~ to a \sim though so it won't stay a \tildeNbsp for long. We could remove this if we
  // feel like it's too confusing and not worth the overhead.
  '~': '\u00A0',

  '-': '−',
  "'": '′',

  '\\square': '\u25A1',
  '\\mid': '\u2223',
  '\\parallel': '\u2225',
  '\\nparallel': '\u2226',
  '\\perp': '\u27C2',
  '\\infty': '∞',
  '\\approx': '≈',
  '\\to': '→',
  '\\ne': '≠',
  '\\degree': '°',
  '\\bigcirc': '◯',
  '\\angle': '∠',
  '\\triangle': '△',
  '\\cong': '≅',
  '\\measuredangle': '∡',
  '\\parallelogram': '▱',
  '\\ncong': '≇',
  '\\nsim': '≁',
  '\\$': '$',
  '\\%': '%',
  '\\&': '&',

  '\\int': '∫',
  '\\sum': '∑',
  '\\prod': '∏',
  '\\coprod': '∐',

  '\\cdot': '·',
  '\\ge': '≥',
  '\\geq': '≥',

  '\\le': '≤',
  '\\sim': '~',
  '\\pm': '±',
  '\\mp': '∓',
  '\\times': '×',
  '\\div': '÷',

  '\\backslash': '\\',
  '\\varphi': 'φ',
  '\\epsilon': 'ϵ',
  '\\varepsilon': 'ε',
  '\\varpi': 'ϖ',
  '\\varsigma': 'ς',
  '\\vartheta': 'ϑ',
  '\\digamma': 'ϝ',
  '\\varkappa': 'ϰ',
  '\\varrho': 'ϱ',

  '\\alpha': 'α',
  '\\beta': 'β',
  '\\gamma': 'γ',
  '\\delta': 'δ',
  '\\zeta': 'ζ',
  '\\eta': 'η',
  '\\theta': 'θ',
  '\\iota': 'ι',
  '\\kappa': 'κ',
  '\\lambda': 'λ',
  '\\mu': 'μ',
  '\\nu': 'ν',
  '\\xi': 'ξ',
  '\\pi': 'π',
  '\\rho': 'ρ',
  '\\sigma': 'σ',
  '\\tau': 'τ',
  '\\upsilon': 'υ',
  '\\phi': 'ϕ',
  '\\chi': 'χ',
  '\\psi': 'ψ',
  '\\omega': 'ω',

  '\\Gamma': 'Γ',
  '\\Delta': 'Δ',
  '\\Theta': 'Θ',
  '\\Lambda': 'Λ',
  '\\Xi': 'Ξ',
  '\\Pi': 'Π',
  '\\Sigma': 'Σ',
  '\\Upsilon': 'ϒ',
  '\\Phi': 'Φ',
  '\\Psi': 'Ψ',
  '\\Omega': 'Ω',

  '\\forall': '∀'
};

const specialTag: { [key: string]: 'span' | 'var' | undefined } = {
  "'": 'span',
  '″': 'span',
  '\\square': 'span',
  '\\mid': 'span',
  '\\parallel': 'span',
  '\\nparallel': 'span',
  '\\perp': 'span',

  '\\backslash': 'span',
  '\\phi': 'var',
  '\\varphi': 'var',
  '\\epsilon': 'var',
  '\\varepsilon': 'var',
  '\\varpi': 'var',
  '\\varsigma': 'var',
  '\\vartheta': 'var',
  '\\digamma': 'var',
  '\\varkappa': 'var',
  '\\varrho': 'var',

  '\\alpha': 'var',
  '\\beta': 'var',
  '\\gamma': 'var',
  '\\delta': 'var',
  '\\zeta': 'var',
  '\\eta': 'var',
  '\\theta': 'var',
  '\\iota': 'var',
  '\\kappa': 'var',
  '\\lambda': 'span',
  '\\mu': 'var',
  '\\nu': 'var',
  '\\xi': 'var',
  '\\pi': 'span',
  '\\rho': 'var',
  '\\sigma': 'var',
  '\\tau': 'var',
  '\\chi': 'var',
  '\\psi': 'var',
  '\\omega': 'var',
  '\\upsilon': 'var',

  '\\Gamma': 'span',
  '\\Delta': 'span',
  '\\Theta': 'span',
  '\\Lambda': 'span',
  '\\Xi': 'span',
  '\\Pi': 'span',
  '\\Sigma': 'span',
  '\\Phi': 'span',
  '\\Psi': 'span',
  '\\Omega': 'span',
  '\\Upsilon': 'var',
  '\\forall': 'span',

  ge: 'span',
  le: 'span',
  ' ': 'span',
  '.': 'span',
  degree: 'span',
  $: 'span',
  ':': 'span',
  '`': 'span',
  ',': 'span',
  infty: 'span',
  approx: 'span'
};

const specialClass: { [key: string]: string | undefined } = {
  '\\pi': 'dcg-mq-nonSymbola',
  '\\lambda': 'dcg-mq-nonSymbola',
  '@': 'dcg-mq-nonSymbola',
  '\\&': 'dcg-mq-nonSymbola',
  '\\%': 'dcg-mq-nonSymbola',
  f: 'dcg-mq-f',
  ',': 'dcg-mq-comma',

  '.': 'dcg-mq-digit',
  '0': 'dcg-mq-digit',
  '1': 'dcg-mq-digit',
  '2': 'dcg-mq-digit',
  '3': 'dcg-mq-digit',
  '4': 'dcg-mq-digit',
  '5': 'dcg-mq-digit',
  '6': 'dcg-mq-digit',
  '7': 'dcg-mq-digit',
  '8': 'dcg-mq-digit',
  '9': 'dcg-mq-digit'
};

const specialStyle: { [key: string]: string | undefined } = {
  '\\Upsilon': 'font-family: serif'
};

export function mapSymbolToDOMTag(symbol: string) {
  if (/^[a-z]$/i.test(symbol)) return 'var';

  return specialTag[symbol] || 'span';
}

export function mapSymbolToText(symbol: string) {
  if (symbol === '\\ ' || symbol === ' ') {
    return stringReplace['\\ '];
  }

  symbol = symbol.trim();

  return stringReplace[symbol] || stringReplace['\\' + symbol] || undefined;
}

export function mapSymbolToClassName(symbol: string) {
  return specialClass[symbol];
}

export function mapSymbolToStyle(symbol: string) {
  return specialStyle[symbol];
}
