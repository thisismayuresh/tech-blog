/**
 * Pulls the leading `---` frontmatter block out of a markdown document.
 * Returns the parsed key/value pairs plus the remaining body text.
 */
export function extractFrontmatter(markdownText) {
  const lines = markdownText.split('\n');

  if (lines.length === 0 || lines[0].trim() !== '---') {
    return { data: {}, body: markdownText };
  }

  let closingLineIndex = -1;

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    if (lines[lineIndex].trim() === '---') {
      closingLineIndex = lineIndex;
      break;
    }
  }

  if (closingLineIndex === -1) {
    return { data: {}, body: markdownText };
  }

  const data = {};

  for (let lineIndex = 1; lineIndex < closingLineIndex; lineIndex++) {
    const line = lines[lineIndex];
    const separatorIndex = line.indexOf(':');

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key !== '') {
      data[key] = value;
    }
  }

  const body = lines.slice(closingLineIndex + 1).join('\n').replace(/^\n+/, '');

  return { data, body };
}

/**
 * Turns a comma-separated frontmatter value ("kubernetes, devops")
 * into a lowercase tag list with empties removed.
 */
export function parseTagList(rawValue) {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    return [];
  }

  const tags = [];
  const parts = rawValue.split(',');

  for (const part of parts) {
    const tag = part.trim().toLowerCase();

    if (tag !== '' && !tags.includes(tag)) {
      tags.push(tag);
    }
  }

  return tags;
}
