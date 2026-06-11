import type { MqChar, MqNode } from '../mq-nodes.ts';

export const cmdToLatex: Record<string, string> = {
  ' ': '\\ ',

  // greek letters filled in dynamically below

  pm: '\\pm',
  mp: '\\mp',
  times: '\\times',
  div: '\\div',
  cdot: '\\cdot',
  le: '\\le',
  ge: '\\ge',

  sim: '\\sim',
  tildeNbsp: '~',

  approx: '\\approx',
  cong: '\\cong',
  ncong: '\\ncong',
  nsim: '\\nsim',
  ne: '\\ne',
  parallel: '\\parallel',
  nparallel: '\\nparallel',
  perp: '\\perp',
  to: '\\to',
  forall: '\\forall',

  square: '\\square',
  mid: '\\mid',
  bigcirc: '\\bigcirc',
  angle: '\\angle',
  measuredangle: '\\measuredangle',
  triangle: '\\triangle',
  degree: '\\degree',
  parallelogram: '\\parallelogram',
  infty: '\\infty',

  // Special characters
  backslash: '\\backslash',
  $: '\\$',
  '?': '?',
  '!': '!',
  '@': '@',
  '&': '\\&',
  '#': '#',
  '%': '\\%',
  ',': ',',
  '.': '.'
};

const greekLettersArray = [
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'varepsilon',
  'zeta',
  'eta',
  'theta',
  'vartheta',
  'iota',
  'kappa',
  'varkappa',
  'lambda',
  'mu',
  'nu',
  'xi',
  'pi',
  'varpi',
  'rho',
  'varrho',
  'sigma',
  'varsigma',
  'tau',
  'upsilon',
  'phi',
  'varphi',
  'chi',
  'psi',
  'omega',
  'digamma',
  'Gamma',
  'Delta',
  'Theta',
  'Lambda',
  'Xi',
  'Pi',
  'Sigma',
  'Upsilon',
  'Phi',
  'Psi',
  'Omega'
];

const isGreekLetterLatexMap: Record<string, true | undefined> = {};

for (const greekLetter of greekLettersArray) {
  const latex = '\\' + greekLetter;
  cmdToLatex[greekLetter] = latex;
  isGreekLetterLatexMap[latex] = true;
}

export function mapSymbolToLatex(str: string) {
  return cmdToLatex[str] || str;
}

export function isMqVariable(node: MqNode): node is MqChar {
  if (node.type !== 'char') return false;
  const latex = node.latex;

  if (/^[a-zA-Z]$/.test(latex)) return true;
  if (isGreekLetterLatexMap[latex]) return true;
  return false;
}

const aliases: Record<string, string> = {
  space: ' ',

  bar: 'overline',

  dfrac: 'frac',
  cfrac: 'frac',
  fraction: 'frac',

  choose: 'binom',
  binomial: 'binom',

  '∑': 'sum',
  summation: 'sum',
  '∏': 'prod',
  product: 'prod',
  coproduct: 'coprod',
  '∫': 'int',
  integral: 'int',

  subscript: '_',
  superscript: '^',
  supscript: '^',

  α: 'alpha',
  β: 'beta',
  γ: 'gamma',
  δ: 'delta',
  ϵ: 'epsilon',
  ε: 'varepsilon',
  epsiv: 'varepsilon',
  ζ: 'zeta',
  η: 'eta',
  θ: 'theta',
  thetav: 'vartheta',
  thetasym: 'vartheta',
  ϑ: 'vartheta',
  ι: 'iota',
  κ: 'kappa',
  kappav: 'varkappa',
  ϰ: 'varkappa',
  λ: 'lambda',
  μ: 'mu',
  ν: 'nu',
  ξ: 'xi',
  π: 'pi',
  piv: 'varpi',
  ϖ: 'varpi',
  ρ: 'rho',
  rhov: 'varrho',
  ϱ: 'varrho',
  σ: 'sigma',
  sigmaf: 'varsigma',
  sigmav: 'varsigma',
  ς: 'varsigma',
  τ: 'tau',
  upsi: 'upsilon',
  υ: 'upsilon',
  ϕ: 'phi',
  φ: 'varphi',
  phiv: 'varphi',
  χ: 'chi',
  ψ: 'psi',
  ω: 'omega',
  gammad: 'digamma',
  Gammad: 'digamma',
  Ϝ: 'digamma',
  Γ: 'Gamma',
  Δ: 'Delta',
  Θ: 'Theta',
  Λ: 'Lambda',
  Ξ: 'Xi',
  Π: 'Pi',
  Σ: 'Sigma',
  Υ: 'Upsilon',
  Upsi: 'Upsilon',
  upsih: 'Upsilon',
  Upsih: 'Upsilon',
  Φ: 'Phi',
  Ψ: 'Psi',
  Ω: 'Omega',

  '−': '-',
  '—': '-',
  '–': '-',
  '±': 'pm',
  plusminus: 'pm',
  plusmn: 'pm',
  '∓': 'mp',
  mnplus: 'mp',
  minusplus: 'mp',

  '×': 'times',
  cross: 'times',
  '÷': 'div',
  divide: 'div',
  divides: 'div',
  sdot: 'cdot',

  '~': 'sim',
  '≁': 'nsim',
  '≈': 'approx',
  '≠': 'ne',
  neq: 'ne',
  '≅': 'cong',
  '≇': 'ncong',
  gt: '>',
  '≥': 'ge',
  geq: 'ge',
  lt: '<',
  '≤': 'le',
  leq: 'le',

  prime: "'",
  dprime: '″',

  '◯': 'bigcirc',
  '∥': 'parallel',
  '∦': 'nparallel',
  '⟂': 'perp',
  '→': 'to',
  '∀': 'forall',

  '∠': 'angle',
  ang: 'angle',
  '∡': 'measuredangle',
  '△': 'triangle',
  '°': 'degree',
  '▱': 'parallelogram',
  '□': 'square',
  '∞': 'infty',
  infin: 'infty',
  infinity: 'infty'
};

export function mapCtrlSeqAlias(ctrlSeq: string) {
  return aliases[ctrlSeq] || ctrlSeq;
}
