import { escapeHtml } from './escape-html.js';
import { normalizeAssetPath } from '../asset-path.js';
import { highlightCode, supportsHighlighting } from './highlighter.js';

/**
 * Converts a markdown document into an HTML string.
 *
 * The parser runs in two explicit passes:
 *   1. Block parsing  — split the document into headings, paragraphs, code
 *                       fences, lists, blockquotes, tables, and rules.
 *   2. Inline parsing — turn emphasis, links, images, and code spans inside
 *                       each block's text into HTML (after escaping).
 *
 * Supported syntax: ATX headings, paragraphs, fenced code with language
 * highlighting, ordered/unordered (nestable) lists, blockquotes, GFM pipe
 * tables, horizontal rules, bold, italic, strikethrough, inline code,
 * links, and images.
 *
 * Deliberately not supported (keeps the parser predictable): setext
 * headings, reference-style links, raw HTML passthrough, and bare-URL
 * autolinking.
 */

export function renderMarkdown(markdownText) {
  const blocks = parseBlocks(markdownText);
  const renderedBlocks = [];

  for (const block of blocks) {
    renderedBlocks.push(renderBlock(block));
  }

  return renderedBlocks.join('\n');
}

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

const LIST_MARKER_PATTERN = /^([ \t]*)([-*+]|\d+[.)])[ \t]+(.*)$/;
const FENCE_START_PATTERN = /^[ \t]*(`{3,}|~{3,})[ \t]*([^`]*)$/;
const HEADING_PATTERN = /^(#{1,6})[ \t]+(.*?)$/;
const TABLE_DELIMITER_CELL_PATTERN = /^:?-+:?$/;

function parseBlocks(markdownText) {
  const lines = markdownText.split('\n');
  const blocks = [];
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex];

    if (line.trim() === '') {
      lineIndex += 1;
      continue;
    }

    if (FENCE_START_PATTERN.test(line)) {
      const result = parseCodeBlock(lines, lineIndex);
      blocks.push(result.block);
      lineIndex = result.nextIndex;
      continue;
    }

    const headingMatch = line.match(HEADING_PATTERN);

    if (headingMatch !== null) {
      const level = headingMatch[1].length;
      const text = stripTrailingHeadingHashes(headingMatch[2]);
      blocks.push({ type: 'heading', level, text });
      lineIndex += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      blocks.push({ type: 'hr' });
      lineIndex += 1;
      continue;
    }

    if (line.startsWith('>')) {
      const result = parseBlockquote(lines, lineIndex);
      blocks.push(result.block);
      lineIndex = result.nextIndex;
      continue;
    }

    if (lineStartsTable(lines, lineIndex)) {
      const result = parseTable(lines, lineIndex);
      blocks.push(result.block);
      lineIndex = result.nextIndex;
      continue;
    }

    if (LIST_MARKER_PATTERN.test(line)) {
      const result = parseList(lines, lineIndex);
      blocks.push(result.block);
      lineIndex = result.nextIndex;
      continue;
    }

    const paragraphResult = parseParagraph(lines, lineIndex);
    blocks.push(paragraphResult.block);
    lineIndex = paragraphResult.nextIndex;
  }

  return blocks;
}

function stripTrailingHeadingHashes(text) {
  return text.replace(/[ \t]+#+[ \t]*$/, '').trim();
}

function isHorizontalRule(line) {
  const trimmed = line.trim();

  if (trimmed.length < 3) {
    return false;
  }

  const isDashRule = /^-[ \t]*(-[ \t]*)+$/.test(trimmed);
  const isStarRule = /^\*[ \t]*(\*[ \t]*)+$/.test(trimmed);
  const isUnderscoreRule = /^_[ \t]*(_[ \t]*)+$/.test(trimmed);

  return isDashRule || isStarRule || isUnderscoreRule;
}

function lineStartsNewBlock(line) {
  if (line.trim() === '') {
    return true;
  }
  if (FENCE_START_PATTERN.test(line)) {
    return true;
  }
  if (HEADING_PATTERN.test(line)) {
    return true;
  }
  if (isHorizontalRule(line)) {
    return true;
  }
  if (line.startsWith('>')) {
    return true;
  }
  if (LIST_MARKER_PATTERN.test(line)) {
    return true;
  }
  return false;
}

function parseCodeBlock(lines, startLineIndex) {
  const openingMatch = lines[startLineIndex].match(FENCE_START_PATTERN);
  const fenceCharacter = openingMatch[1][0];
  const fenceLength = openingMatch[1].length;
  const language = openingMatch[2].trim();

  const codeLines = [];
  let lineIndex = startLineIndex + 1;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    const closingMatch = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*$/);

    if (
      closingMatch !== null &&
      closingMatch[1][0] === fenceCharacter &&
      closingMatch[1].length >= fenceLength
    ) {
      lineIndex += 1;
      break;
    }

    codeLines.push(line);
    lineIndex += 1;
  }

  return {
    block: { type: 'code', language, code: codeLines.join('\n') },
    nextIndex: lineIndex,
  };
}

function parseBlockquote(lines, startLineIndex) {
  const quotedLines = [];
  let lineIndex = startLineIndex;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex];

    if (line.startsWith('>')) {
      quotedLines.push(line.replace(/^>[ \t]?/, ''));
      lineIndex += 1;
      continue;
    }

    const nextLineIsQuoted =
      line.trim() === '' &&
      lineIndex + 1 < lines.length &&
      lines[lineIndex + 1].startsWith('>');

    if (nextLineIsQuoted) {
      quotedLines.push('');
      lineIndex += 1;
      continue;
    }

    break;
  }

  const innerHtml = renderMarkdown(quotedLines.join('\n'));

  return {
    block: { type: 'blockquote', html: innerHtml },
    nextIndex: lineIndex,
  };
}

function lineStartsTable(lines, lineIndex) {
  const headerLine = lines[lineIndex];

  if (!headerLine.includes('|') || lineIndex + 1 >= lines.length) {
    return false;
  }

  const delimiterLine = lines[lineIndex + 1];

  if (!isTableDelimiterLine(delimiterLine)) {
    return false;
  }

  const headerCells = splitTableRow(headerLine);
  const delimiterCells = splitTableRow(delimiterLine);

  if (headerCells.length === 0) {
    return false;
  }

  return headerCells.length === delimiterCells.length;
}

function isTableDelimiterLine(line) {
  const trimmed = line.trim();

  if (!trimmed.includes('|')) {
    return false;
  }

  const cells = splitTableRow(trimmed);

  if (cells.length === 0) {
    return false;
  }

  for (const cell of cells) {
    if (!TABLE_DELIMITER_CELL_PATTERN.test(cell)) {
      return false;
    }
  }

  return true;
}

function splitTableRow(line) {
  let trimmed = line.trim();

  if (trimmed.startsWith('|')) {
    trimmed = trimmed.slice(1);
  }

  if (trimmed.endsWith('|')) {
    trimmed = trimmed.slice(0, -1);
  }

  return trimmed.split('|').map((cell) => cell.trim());
}

function parseCellAlignment(delimiterCell) {
  const startsWithColon = delimiterCell.startsWith(':');
  const endsWithColon = delimiterCell.endsWith(':');

  if (startsWithColon && endsWithColon) {
    return 'center';
  }
  if (endsWithColon) {
    return 'right';
  }
  if (startsWithColon) {
    return 'left';
  }
  return null;
}

function parseTable(lines, startLineIndex) {
  const header = splitTableRow(lines[startLineIndex]);
  const alignments = splitTableRow(lines[startLineIndex + 1]).map(parseCellAlignment);

  const rows = [];
  let lineIndex = startLineIndex + 2;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex];

    if (line.trim() === '' || !line.includes('|')) {
      break;
    }

    rows.push(splitTableRow(line));
    lineIndex += 1;
  }

  return {
    block: { type: 'table', header, alignments, rows },
    nextIndex: lineIndex,
  };
}

function parseList(lines, startLineIndex) {
  const firstMatch = lines[startLineIndex].match(LIST_MARKER_PATTERN);
  const baseIndent = countLeadingSpaces(firstMatch[1]);
  const isOrdered = /\d/.test(firstMatch[2]);

  const items = [];
  let lineIndex = startLineIndex;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex];

    if (line.trim() === '') {
      const nextMeaningfulIndex = skipBlankLines(lines, lineIndex);

      if (nextMeaningfulIndex === -1) {
        break;
      }

      const nextMatch = lines[nextMeaningfulIndex].match(LIST_MARKER_PATTERN);
      const nextIndent = nextMatch !== null ? countLeadingSpaces(nextMatch[1]) : -1;

      if (nextMatch !== null && nextIndent >= baseIndent) {
        lineIndex = nextMeaningfulIndex;
        continue;
      }

      break;
    }

    const markerMatch = line.match(LIST_MARKER_PATTERN);

    if (markerMatch !== null) {
      const markerIndent = countLeadingSpaces(markerMatch[1]);

      if (markerIndent > baseIndent) {
        if (items.length === 0) {
          break;
        }

        const nestedResult = parseList(lines, lineIndex);
        items[items.length - 1].nestedLists.push(nestedResult.block);
        lineIndex = nestedResult.nextIndex;
        continue;
      }

      if (markerIndent < baseIndent) {
        break;
      }

      items.push({
        content: markerMatch[3],
        nestedLists: [],
      });
      lineIndex += 1;
      continue;
    }

    const lineIndent = countLeadingSpaces(line);

    if (items.length > 0 && lineIndent > baseIndent) {
      items[items.length - 1].content += ` ${line.trim()}`;
      lineIndex += 1;
      continue;
    }

    break;
  }

  return {
    block: { type: 'list', ordered: isOrdered, items },
    nextIndex: lineIndex,
  };
}

function skipBlankLines(lines, startLineIndex) {
  let lineIndex = startLineIndex;

  while (lineIndex < lines.length && lines[lineIndex].trim() === '') {
    lineIndex += 1;
  }

  if (lineIndex >= lines.length) {
    return -1;
  }

  return lineIndex;
}

function countLeadingSpaces(line) {
  let spaceCount = 0;

  while (spaceCount < line.length && line[spaceCount] === ' ') {
    spaceCount += 1;
  }

  return spaceCount;
}

function parseParagraph(lines, startLineIndex) {
  const paragraphLines = [lines[startLineIndex]];
  let lineIndex = startLineIndex + 1;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex];

    if (lineStartsNewBlock(line)) {
      break;
    }

    paragraphLines.push(line.trim());
    lineIndex += 1;
  }

  return {
    block: { type: 'paragraph', text: paragraphLines.join('\n') },
    nextIndex: lineIndex,
  };
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

function renderBlock(block) {
  switch (block.type) {
    case 'heading':
      return renderHeading(block);
    case 'paragraph':
      return `<p>${renderInline(block.text)}</p>`;
    case 'code':
      return renderCodeBlock(block);
    case 'list':
      return renderList(block);
    case 'blockquote':
      return `<blockquote>${block.html}</blockquote>`;
    case 'table':
      return renderTable(block);
    case 'hr':
      return '<hr>';
    default:
      return '';
  }
}

function renderHeading(block) {
  const tag = `h${block.level}`;
  return `<${tag}>${renderInline(block.text)}</${tag}>`;
}

function renderCodeBlock(block) {
  const languageLabel = block.language === '' ? '' : block.language;
  const codeClass =
    block.language !== '' && supportsHighlighting(block.language)
      ? ` class="language-${escapeHtml(block.language.toLowerCase())}"`
      : '';

  let barHtml = '<div class="code-block-bar">';

  if (languageLabel !== '') {
    barHtml += `<span class="code-block-language">${escapeHtml(languageLabel)}</span>`;
  } else {
    barHtml += '<span class="code-block-language">code</span>';
  }

  barHtml += '<button type="button" class="copy-code-button">Copy</button>';
  barHtml += '</div>';

  const highlightedCode = highlightCode(block.code, block.language);

  return [
    '<div class="code-block">',
    barHtml,
    `<pre class="code-block-pre"><code${codeClass}>${highlightedCode}</code></pre>`,
    '</div>',
  ].join('');
}

function renderList(block) {
  const tagName = block.ordered ? 'ol' : 'ul';
  const renderedItems = [];

  for (const item of block.items) {
    let itemHtml = renderInline(item.content);

    for (const nestedList of item.nestedLists) {
      itemHtml += renderList(nestedList);
    }

    renderedItems.push(`<li>${itemHtml}</li>`);
  }

  return `<${tagName}>${renderedItems.join('')}</${tagName}>`;
}

function renderAlignmentStyle(alignment) {
  if (alignment === 'center') {
    return ' style="text-align: center"';
  }
  if (alignment === 'right') {
    return ' style="text-align: right"';
  }
  return '';
}

function renderTable(block) {
  const headerCells = [];

  for (let cellIndex = 0; cellIndex < block.header.length; cellIndex++) {
    const alignment = block.alignments[cellIndex] || null;
    const style = renderAlignmentStyle(alignment);
    const cellContent = renderInline(block.header[cellIndex]);
    headerCells.push(`<th${style}>${cellContent}</th>`);
  }

  const bodyRows = [];

  for (const row of block.rows) {
    const bodyCells = [];

    for (let cellIndex = 0; cellIndex < row.length; cellIndex++) {
      const alignment = block.alignments[cellIndex] || null;
      const style = renderAlignmentStyle(alignment);
      const cellContent = renderInline(row[cellIndex]);
      bodyCells.push(`<td${style}>${cellContent}</td>`);
    }

    bodyRows.push(`<tr>${bodyCells.join('')}</tr>`);
  }

  return [
    '<div class="table-wrapper">',
    '<table>',
    `<thead><tr>${headerCells.join('')}</tr></thead>`,
    `<tbody>${bodyRows.join('')}</tbody>`,
    '</table>',
    '</div>',
  ].join('');
}

// ---------------------------------------------------------------------------
// Inline parsing
// ---------------------------------------------------------------------------

const INLINE_CODE_SPAN_PATTERN = /(`+)([^`]+?)\1/g;
// Note: these patterns run on already-escaped text, so quotes appear as
// &quot; rather than the raw " character.
const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)(?:[ \t]+&quot;([^&]*)&quot;)?\)/g;
const LINK_PATTERN = /\[([^\]]+)\]\(([^)\s]+)(?:[ \t]+&quot;([^&]*)&quot;)?\)/g;
const BOLD_PATTERN = /\*\*([^*]+)\*\*/g;
const ITALIC_PATTERN = /\*([^*]+)\*/g;
const STRIKETHROUGH_PATTERN = /~~([^~]+)~~/g;

function renderInline(inlineText) {
  const fragments = [];
  let lastIndex = 0;
  let match = INLINE_CODE_SPAN_PATTERN.exec(inlineText);

  while (match !== null) {
    const textBeforeCode = inlineText.slice(lastIndex, match.index);
    fragments.push(renderInlineFormatting(textBeforeCode));

    const codeContent = match[2].replace(/^[ \t]+|[ \t]+$/g, '');
    fragments.push(`<code>${escapeHtml(codeContent)}</code>`);

    lastIndex = match.index + match[0].length;
    match = INLINE_CODE_SPAN_PATTERN.exec(inlineText);
  }

  const remainingText = inlineText.slice(lastIndex);
  fragments.push(renderInlineFormatting(remainingText));

  return fragments.join('');
}

function renderInlineFormatting(rawText) {
  let text = escapeHtml(rawText);

  // Order matters: images before links (the leading "!" must win), and
  // emphasis before links so [**bold**](url) still resolves cleanly.
  text = replaceImageMatches(text);
  text = replaceWrappedText(text, BOLD_PATTERN, 'strong');
  text = replaceWrappedText(text, STRIKETHROUGH_PATTERN, 'del');
  text = replaceWrappedText(text, ITALIC_PATTERN, 'em');
  text = replaceLinkMatches(text);

  return text;
}

function replaceImageMatches(text) {
  IMAGE_PATTERN.lastIndex = 0;
  const fragments = [];
  let lastIndex = 0;
  let match = IMAGE_PATTERN.exec(text);

  while (match !== null) {
    fragments.push(text.slice(lastIndex, match.index));

    const altText = match[1];
    const source = normalizeAssetPath(match[2]);
    const title = match[3] || '';

    let imageHtml = `<img src="${source}" alt="${altText}"`;

    if (title !== '') {
      imageHtml += ` title="${title}"`;
    }

    imageHtml += '>';
    fragments.push(imageHtml);

    lastIndex = match.index + match[0].length;
    match = IMAGE_PATTERN.exec(text);
  }

  fragments.push(text.slice(lastIndex));

  return fragments.join('');
}

function replaceWrappedText(text, pattern, tagName) {
  pattern.lastIndex = 0;
  const fragments = [];
  let lastIndex = 0;
  let match = pattern.exec(text);

  while (match !== null) {
    fragments.push(text.slice(lastIndex, match.index));
    fragments.push(`<${tagName}>${match[1]}</${tagName}>`);

    lastIndex = match.index + match[0].length;
    match = pattern.exec(text);
  }

  fragments.push(text.slice(lastIndex));

  return fragments.join('');
}

function replaceLinkMatches(text) {
  LINK_PATTERN.lastIndex = 0;
  const fragments = [];
  let lastIndex = 0;
  let match = LINK_PATTERN.exec(text);

  while (match !== null) {
    fragments.push(text.slice(lastIndex, match.index));

    const linkText = match[1];
    const href = match[2];
    const title = match[3] || '';

    let linkHtml = `<a href="${href}"`;

    if (title !== '') {
      linkHtml += ` title="${title}"`;
    }

    linkHtml += `>${linkText}</a>`;
    fragments.push(linkHtml);

    lastIndex = match.index + match[0].length;
    match = LINK_PATTERN.exec(text);
  }

  fragments.push(text.slice(lastIndex));

  return fragments.join('');
}
