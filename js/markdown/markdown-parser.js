/**
 * Markdown → HTML using the vendored markdown-it build (vendor/markdown-it.min.js).
 *
 * The classic script must be loaded before this module runs (post.html).
 * Customizations kept here (not in vendor/):
 *   - fenced code → site code-block UI + local highlighter
 *   - ```mermaid → <pre class="mermaid"> for the vendored mermaid runner
 *   - tables wrapped for horizontal scroll
 */
import { escapeHtml } from './escape-html.js';
import { highlightCode, supportsHighlighting } from './highlighter.js';

let markdownInstance = null;

function getMarkdownIt() {
  if (markdownInstance !== null) {
    return markdownInstance;
  }

  const factory = globalThis.markdownit;

  if (typeof factory !== 'function') {
    throw new Error(
      'markdown-it is not loaded. Include vendor/markdown-it.min.js before this module.',
    );
  }

  const instance = factory({
    html: false,
    linkify: false,
    typographer: false,
    breaks: false,
  });

  instance.renderer.rules.fence = renderFenceRule;
  instance.renderer.rules.table_open = renderTableOpen;
  instance.renderer.rules.table_close = renderTableClose;

  markdownInstance = instance;
  return instance;
}

function renderTableOpen() {
  return '<div class="table-wrapper"><table>';
}

function renderTableClose() {
  return '</table></div>';
}

function renderFenceRule(tokens, idx) {
  const token = tokens[idx];
  const info = token.info === null ? '' : String(token.info).trim();
  const language = info.split(/\s+/)[0] === undefined ? '' : info.split(/\s+/)[0];
  const normalizedLanguage = language.toLowerCase();

  if (normalizedLanguage === 'mermaid') {
    return `<pre class="mermaid">${escapeHtml(token.content)}</pre>\n`;
  }

  return renderCodeBlockHtml(token.content, language);
}

function renderCodeBlockHtml(code, language) {
  const languageLabel = language === '' ? '' : language;
  const codeClass =
    language !== '' && supportsHighlighting(language)
      ? ` class="language-${escapeHtml(language.toLowerCase())}"`
      : '';

  let barHtml = '<div class="code-block-bar">';

  if (languageLabel !== '') {
    barHtml += `<span class="code-block-language">${escapeHtml(languageLabel)}</span>`;
  } else {
    barHtml += '<span class="code-block-language">code</span>';
  }

  barHtml += '<button type="button" class="copy-code-button">Copy</button>';
  barHtml += '</div>';

  const highlightedCode = highlightCode(code, language);

  return [
    '<div class="code-block">',
    barHtml,
    `<pre class="code-block-pre"><code${codeClass}>${highlightedCode}</code></pre>`,
    '</div>',
  ].join('');
}

/**
 * Renders a markdown document to HTML with the vendored parser.
 * Throws when vendor/markdown-it.min.js has not been loaded.
 */
export function renderMarkdown(markdownText) {
  return getMarkdownIt().render(markdownText);
}
