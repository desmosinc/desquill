import { isSpecialCommand } from './actions/type-char';
import { entries } from './lib';
import type { LocalizeFunction } from './mq-i18n-interface';
import { cmdToLatex, mapCtrlSeqAlias } from './parser/cmd-to-latex';

export type MqConfig = MqPassthroughConfig & MqPostParsedConfig;

/** Config that is both public-facing and private-facing because it gets simply passed through. */
interface MqPassthroughConfig {
  logAriaAlerts: boolean;
  resetCursorOnBlur: boolean;
  autoSubscriptNumerals: boolean;
  supSubsRequireOperand: boolean;
  /**
   * - false: allow mismatched brackets
   * - true: only allow mismatched `[)` and `(]` brackets.
   * - 'none': don't allow any mismatched.
   */
  restrictMismatchedBrackets: boolean | 'none';
  typingSlashWritesDivisionSymbol: boolean;
  typingAsteriskWritesTimesSymbol: boolean;
  typingPercentWritesPercentOf: boolean;
  sumStartsWithNEquals: boolean;
  /**
   * Characters that, when typed at the end of a superscript or subscript,
   * will cause the cursor to break out of the sup/sub and insert the character
   * at the base level. For example, with '+-=<>*', typing '2^3*5' produces '2^{3}*5'.
   */
  charsThatBreakOutOfSupSub: string;
  enableDigitGrouping: boolean;
  ignoreNextMousedown?: (evt: MouseEvent) => boolean;
  askIfShouldIgnoreMousemove?: (
    evt: MouseEvent,
    rootElt: HTMLElement
  ) => boolean;
  overrideTypedText?: (text: string) => void;
  overrideKeystroke?: (key: string, event: KeyboardEvent) => void;
  overridePaste?: (event?: ClipboardEvent) => boolean;
  overrideCopy?: (event?: ClipboardEvent) => boolean;
  overrideCut?: (event?: ClipboardEvent) => boolean;
  onPaste?: () => void;
  onCut?: () => void;
  localize: LocalizeFunction;
  language: string;
  maxDepth?: number;
  /** `static` is internal, used to tell apart the `MQ.StaticMath` and `MQ.MathField` constructors. */
  static: boolean;
  /**
   * If undefined, use the default; static math fields default to `tabindex: -1`, and
   * editable math fields default to `tabindex: 0`.
   */
  tabindex: number | undefined;
  /** Duration in milliseconds for horizontal scrolling. */
  scrollAnimationDuration: number;
}

/** Internally-facing config from after parsing a `MqPreProcessedConfig`. */
interface MqPostParsedConfig {
  autoOperatorNames: AutoOperatorNames;
  autoCommands: AutoCommandNames;
  prefixOperatorNames: Set<string>;
  infixOperatorNames: Set<string>;
  leftRightIntoCmdGoes: 'up' | 'down' | undefined;
  quietEmptyDelimeters: Set<string>;
}

/** A string value provides the MathSpeak. Not sure what happens when there's a 1.  */
export type AutoOperatorNames = AutoDict<string | 1>;

/** This is effectively just a set. The 1 has no information. */
export type AutoCommandNames = AutoDict<1>;

/** Public-facing config that gets parsed and converted into `MqPostParsedConfig`. */
interface MqPreParsedConfig {
  autoOperatorNames?: string;
  autoCommands?: string;
  leftRightIntoCmdGoes?: 'up' | 'down' | undefined;
  prefixOperatorNames?: string;
  infixOperatorNames?: string;
  quietEmptyDelimeters?: string;
}

export type UnprocessedMqConfig = Partial<MqPassthroughConfig> &
  Partial<MqPreParsedConfig>;

const _mutableMarksProps = [
  'autoOperatorNames',
  'prefixOperatorNames',
  'infixOperatorNames'
] as const satisfies readonly (keyof MqConfig)[];
export const mutableMarksProps =
  _mutableMarksProps as readonly (keyof MqConfig)[];

export type MqMutableMarksConfig = Pick<
  MqConfig,
  (typeof _mutableMarksProps)[number]
>;

export const affectsRenderProps = ['quietEmptyDelimeters'] as const;

export type MqRenderConfig = Pick<
  MqConfig,
  (typeof affectsRenderProps)[number]
>;

export class TrieNode {
  children: Record<string, TrieNode> = {};
  endWord: string | undefined;

  buildPath(letter: string) {
    let child = this.children[letter];
    if (!child) {
      child = new TrieNode();
      this.children[letter] = child;
    }

    return child;
  }

  followPath(letter: string): TrieNode | undefined {
    return this.children[letter];
  }
}

class AutoDict<V> {
  /** For scanning left-to-right (for auto-operator-names). */
  private trieRoot = new TrieNode();
  /** For scanning right-to-left (for auto-commands when typing). */
  private reverseTrieRoot = new TrieNode();
  private map = new Map<string, V>();

  getTrieRoot() {
    return this.trieRoot;
  }

  getReverseTrieRoot() {
    return this.reverseTrieRoot;
  }

  set(key: string, value: V) {
    this.map.set(key, value);

    {
      // insert into the forwards trie
      let node = this.trieRoot;
      for (let i = 0; i < key.length; i++) {
        node = node.buildPath(key[i]);
      }
      node.endWord = key;
    }

    {
      // insert into the reverse trie
      let node = this.reverseTrieRoot;
      for (let i = key.length - 1; i >= 0; i--) {
        node = node.buildPath(key[i]);
      }
      node.endWord = key;
    }
  }

  has(key: string) {
    return this.map.has(key);
  }

  get(key: string): V | undefined {
    return this.map.get(key);
  }

  keys() {
    return this.map.keys();
  }
}

const { BuiltInOpNames, AutoOpNames } = buildBuiltInOps();
export { BuiltInOpNames };

function buildBuiltInOps() {
  const BuiltInOpNames = new Set<string>();

  const AutoOpNames: AutoOperatorNames = new AutoDict();

  const mostOps = (
    'arg deg det dim exp gcd hom inf ker lg lim ln log max min sup' +
    ' limsup liminf injlim projlim Pr'
  ).split(' ');

  for (let i = 0; i < mostOps.length; i += 1) {
    const op = mostOps[i];
    BuiltInOpNames.add(op);
    AutoOpNames.set(op, 1);
  }

  const builtInTrigs =
    'sin cos tan arcsin arccos arctan sinh cosh tanh sec csc cot coth'.split(
      // why coth but not sech and csch, LaTeX?
      ' '
    );
  for (let i = 0; i < builtInTrigs.length; i += 1) {
    BuiltInOpNames.add(builtInTrigs[i]);
  }

  const autoTrigs = 'sin cos tan sec cosec csc cotan cot ctg'.split(' ');
  for (let i = 0; i < autoTrigs.length; i += 1) {
    AutoOpNames.set(autoTrigs[i], 1);
    AutoOpNames.set('arc' + autoTrigs[i], 1);
    AutoOpNames.set(autoTrigs[i] + 'h', 1);
    AutoOpNames.set('ar' + autoTrigs[i] + 'h', 1);
    AutoOpNames.set('arc' + autoTrigs[i] + 'h', 1);
  }

  // compat with some of the nonstandard LaTeX exported by MathQuill
  // before #247. None of these are real LaTeX commands so, seems safe
  const moreNonstandardOps = 'gcf hcf lcm proj span'.split(' ');
  for (let i = 0; i < moreNonstandardOps.length; i += 1) {
    AutoOpNames.set(moreNonstandardOps[i], 1);
  }

  return { BuiltInOpNames, AutoOpNames };
}

export function updateConfig(
  oldConfig: MqConfig,
  updateConfig: UnprocessedMqConfig
): MqConfig {
  const newConfig: MqConfig = { ...oldConfig };
  for (const [key, value] of entries(updateConfig)) {
    switch (key) {
      case 'autoOperatorNames':
        if (value === undefined) break;
        newConfig[key] = parseAutoOperatorNames(value);
        break;
      case 'autoCommands':
        if (value === undefined) break;
        newConfig[key] = parseAutoCommands(value);
        break;
      case 'leftRightIntoCmdGoes':
        newConfig[key] = parseLeftRightIntoCmdGoes(value);
        break;
      case 'infixOperatorNames':
      case 'prefixOperatorNames':
        if (value === undefined) break;
        newConfig[key] = splitIntoWords(value);
        break;
      case 'quietEmptyDelimeters':
        if (value === undefined) break;
        newConfig[key] = parseQuietEmptyDelimeters(value);
        break;
      default:
        key satisfies keyof MqPassthroughConfig;
        (newConfig as any)[key] = value;
        break;
    }
  }
  return newConfig;
}

function splitIntoWords(cmds: string) {
  if (cmds.length === 0) return new Set<string>();
  if (typeof cmds !== 'string') {
    throw '"' + cmds + '" not a space-delimited list';
  }
  if (!/^[a-z]+(?: [a-z]+)*$/i.test(cmds)) {
    throw '"' + cmds + '" not a space-delimited list of letters';
  }
  const list = cmds.split(' ');
  const dict = new Set<string>();
  for (let i = 0; i < list.length; i += 1) {
    const cmd = list[i];
    if (cmd.length < 2) {
      throw '"' + cmd + '" not minimum length of 2';
    }
    dict.add(cmd);
  }
  return dict;
}

// This came from baseOptionProcessors.autoOperatorNames
function parseAutoOperatorNames(cmds: string): AutoOperatorNames {
  if (typeof cmds !== 'string') {
    throw '"' + cmds + '" not a space-delimited list';
  }
  if (!/^[a-z\|\-]+(?: [a-z\|\-]+)*$/i.test(cmds)) {
    throw '"' + cmds + '" not a space-delimited list of letters or "|"';
  }
  const list = cmds.split(' ');
  const dict: AutoOperatorNames = new AutoDict();
  for (let i = 0; i < list.length; i += 1) {
    const cmd = list[i];
    if (cmd.length < 2) {
      throw '"' + cmd + '" not minimum length of 2';
    }
    if (cmd.indexOf('|') < 0) {
      // normal auto operator
      dict.set(cmd, cmd);
    } else {
      // this item has a speech-friendly alternative
      const cmdArray = cmd.split('|');
      if (cmdArray.length > 2) {
        throw '"' + cmd + '" has more than 1 mathspeak delimiter';
      }
      if (cmdArray[0].length < 2) {
        throw '"' + cmd[0] + '" not minimum length of 2';
      }
      if (cmdArray[1].startsWith('mq-narration-op-')) {
        // desmosAutoOperatorNamesEntries references dictionary.ftl keys
        dict.set(cmdArray[0], cmdArray[1]);
      } else {
        // Our API supports specifying speech-friendly-alternative as a string in the config with spaces replaced by -
        // convert dashes to spaces for the sake of speech
        dict.set(cmdArray[0], cmdArray[1].replace(/-/g, ' '));
      }
    }
  }
  return dict;
}

function parseAutoCommands(cmds: string): AutoCommandNames {
  if (typeof cmds !== 'string' || !/^[a-z]+(?: [a-z]+)*$/i.test(cmds)) {
    throw '"' + cmds + '" not a space-delimited list of only letters';
  }
  const list = cmds.split(' ');
  const dict: AutoCommandNames = new AutoDict();

  for (let i = 0; i < list.length; i += 1) {
    const cmd = list[i];
    if (cmd.length < 2) {
      throw new Error('Autocommand "' + cmd + '" not minimum length of 2');
    }

    // Don't allow an auto-command not in our table of implemented commands.
    const aliased = mapCtrlSeqAlias(cmd);
    if (!(aliased in cmdToLatex || isSpecialCommand(aliased))) {
      throw new Error(`Invalid auto-command: ${JSON.stringify(cmd)}`);
    }

    dict.set(cmd, 1);
  }
  return dict;
}

function parseQuietEmptyDelimeters(qed: string) {
  return new Set(qed.split(' '));
}

function parseLeftRightIntoCmdGoes(
  updown: string | undefined
): 'up' | 'down' | undefined {
  if (updown === 'up') return 'up';
  if (updown === 'down') return 'down';
  if (updown === undefined) return undefined;
  throw (
    '"up" or "down" required for leftRightIntoCmdGoes option, ' +
    'got "' +
    updown +
    '"'
  );
}

let defaultMqConfig: MqConfig = {
  logAriaAlerts: false,
  resetCursorOnBlur: false,
  autoSubscriptNumerals: false,
  supSubsRequireOperand: false,
  autoCommands: parseAutoCommands(
    'alpha beta sqrt theta phi rho pi tau nthroot cbrt sum prod integral percent infinity infty cross ans frac'
  ),
  infixOperatorNames: splitIntoWords(''),
  prefixOperatorNames: splitIntoWords(''),
  autoOperatorNames: AutoOpNames,
  leftRightIntoCmdGoes: undefined,
  restrictMismatchedBrackets: false,
  typingSlashWritesDivisionSymbol: false,
  typingAsteriskWritesTimesSymbol: false,
  typingPercentWritesPercentOf: false,
  sumStartsWithNEquals: false,
  charsThatBreakOutOfSupSub: '',
  enableDigitGrouping: false,
  static: false,
  tabindex: undefined,
  quietEmptyDelimeters: parseQuietEmptyDelimeters('( ['),
  scrollAnimationDuration: 100,
  localize: () => {
    throw new Error('Programming Error: mq localization function not set');
  },
  language: 'en'
};
let configUsed = false;

export function getDefaultMqConfig(): MqConfig {
  configUsed = true;
  return defaultMqConfig;
}

export function updateDefaultMqConfig(newConfig: UnprocessedMqConfig) {
  if (configUsed) {
    // Force any global updates to happen before instantiating MQ fields,
    // so we don't have to think about propagating global updates to existing MQ fields.
    throw new Error(
      'Cannot update global config after an MQ field has already been instantiated.'
    );
  }
  defaultMqConfig = updateConfig(defaultMqConfig, newConfig);
}
