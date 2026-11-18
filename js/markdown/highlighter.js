import { escapeHtml } from './escape-html.js';

/**
 * Lightweight token highlighter for the four languages used in these posts.
 * Each language is an ordered list of rules: the first rule that matches a
 * stretch of code wins, which keeps comments and strings ahead of keywords.
 *
 * Rule patterns must not contain capturing groups — they are combined into
 * one master pattern, and group numbers are used to find the matching rule.
 */

const JAVASCRIPT_KEYWORDS = [
  'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'debugger', 'default', 'delete', 'do', 'else', 'export', 'extends',
  'finally', 'for', 'from', 'function', 'if', 'import', 'in', 'instanceof',
  'let', 'new', 'of', 'return', 'static', 'super', 'switch', 'this',
  'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
];

const PYTHON_KEYWORDS = [
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
  'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
  'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass',
  'raise', 'return', 'try', 'while', 'with', 'yield',
];

const JAVASCRIPT_RULES = [
  { pattern: /\/\/[^\n]*/, className: 'token-comment' },
  { pattern: /\/\*[\s\S]*?\*\//, className: 'token-comment' },
  { pattern: /`(?:\\[\s\S]|[^`\\])*`/, className: 'token-string' },
  { pattern: /"(?:\\.|[^"\\\n])*"/, className: 'token-string' },
  { pattern: /'(?:\\.|[^'\\\n])*'/, className: 'token-string' },
  {
    pattern: new RegExp(`\\b(?:${JAVASCRIPT_KEYWORDS.join('|')})\\b`),
    className: 'token-keyword',
  },
  {
    pattern: /\b(?:true|false|null|undefined|NaN|Infinity)\b/,
    className: 'token-constant',
  },
  { pattern: /\b0[xX][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?\b/, className: 'token-number' },
  {
    pattern: /\b(?:console|document|window|Math|JSON|Promise|Array|Object|String|Number|Boolean)\b(?=\s*\.)/,
    className: 'token-builtin',
  },
];

const PYTHON_RULES = [
  { pattern: /#[^\n]*/, className: 'token-comment' },
  { pattern: /"""[\s\S]*?"""/, className: 'token-string' },
  { pattern: /'''[\s\S]*?'''/, className: 'token-string' },
  { pattern: /"(?:\\.|[^"\\\n])*"/, className: 'token-string' },
  { pattern: /'(?:\\.|[^'\\\n])*'/, className: 'token-string' },
  {
    pattern: new RegExp(`\\b(?:${PYTHON_KEYWORDS.join('|')})\\b`),
    className: 'token-keyword',
  },
  {
    pattern: /\b(?:True|False|None|self|cls)\b/,
    className: 'token-constant',
  },
  { pattern: /\b0[xX][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?\b/, className: 'token-number' },
  {
    pattern: /\b(?:print|len|range|open|str|int|float|list|dict|set|tuple|isinstance|enumerate|zip|sorted|sum|min|max|abs|type)\b(?=\s*\()/,
    className: 'token-builtin',
  },
];

const HTML_RULES = [
  { pattern: /<!--[\s\S]*?-->/, className: 'token-comment' },
  { pattern: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, className: 'token-string' },
  { pattern: /<\/?[a-zA-Z][a-zA-Z0-9-]*/, className: 'token-tag' },
  { pattern: /\/?>/, className: 'token-tag' },
  { pattern: /\b[a-zA-Z][a-zA-Z0-9-]*(?=\s*=)/, className: 'token-attribute' },
];

const CSS_RULES = [
  { pattern: /\/\*[\s\S]*?\*\//, className: 'token-comment' },
  { pattern: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/, className: 'token-string' },
  { pattern: /@[a-zA-Z-]+/, className: 'token-keyword' },
  { pattern: /#[0-9a-fA-F]{8}(?![\w-])|#[0-9a-fA-F]{6}(?![\w-])|#[0-9a-fA-F]{4}(?![\w-])|#[0-9a-fA-F]{3}(?![\w-])/, className: 'token-number' },
  {
    pattern: /\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|fr|deg|ch|ex|pt)?\b/,
    className: 'token-number',
  },
  { pattern: /[.#][a-zA-Z][\w-]*/, className: 'token-selector' },
  { pattern: /\b[a-zA-Z-]+(?=\s*:)/, className: 'token-attribute' },
];

const LANGUAGE_RULES = {
  js: JAVASCRIPT_RULES,
  javascript: JAVASCRIPT_RULES,
  py: PYTHON_RULES,
  python: PYTHON_RULES,
  html: HTML_RULES,
  css: CSS_RULES,
};

const SUPPORTED_LANGUAGE_ALIASES = Object.keys(LANGUAGE_RULES);

function buildMasterPattern(rules) {
  // One capturing group per rule: group 1 → rule 0, group 2 → rule 1, etc.
  // Rule patterns themselves must stay free of capturing groups so the
  // numbering below remains predictable.
  const groupPatterns = rules.map((rule) => `(${rule.pattern.source})`);
  return new RegExp(groupPatterns.join('|'), 'g');
}

function findMatchingRuleIndex(match) {
  // Group 1 corresponds to rule 0, group 2 to rule 1, and so on.
  for (let groupIndex = 1; groupIndex < match.length; groupIndex++) {
    if (match[groupIndex] !== undefined) {
      return groupIndex - 1;
    }
  }
  return -1;
}

function highlightWithRules(code, rules) {
  const masterPattern = buildMasterPattern(rules);
  const fragments = [];
  let lastIndex = 0;
  let match = masterPattern.exec(code);

  while (match !== null) {
    if (match.index > lastIndex) {
      fragments.push(escapeHtml(code.slice(lastIndex, match.index)));
    }

    const ruleIndex = findMatchingRuleIndex(match);
    const rule = rules[ruleIndex];
    const tokenClass = rule ? rule.className : '';

    fragments.push(`<span class="${tokenClass}">${escapeHtml(match[0])}</span>`);

    lastIndex = match.index + match[0].length;

    if (match[0].length === 0) {
      masterPattern.lastIndex += 1;
    }

    match = masterPattern.exec(code);
  }

  fragments.push(escapeHtml(code.slice(lastIndex)));

  return fragments.join('');
}

export function supportsHighlighting(language) {
  if (!language) {
    return false;
  }
  return SUPPORTED_LANGUAGE_ALIASES.includes(language.toLowerCase());
}

/**
 * Returns HTML for a code block body.
 * Known languages get token spans; everything else is escaped plain text.
 */
export function highlightCode(code, language) {
  if (!supportsHighlighting(language)) {
    return escapeHtml(code);
  }

  const rules = LANGUAGE_RULES[language.toLowerCase()];
  return highlightWithRules(code, rules);
}
