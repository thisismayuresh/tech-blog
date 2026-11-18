/**
 * Turns a markdown image/cover path into a page-relative URL.
 * Absolute URLs are left alone. Leading slashes are stripped so paths
 * keep working when the site is hosted under a subpath (GitHub project
 * pages, e.g. /tech-blog/). Both HTML pages live at the site root, so
 * "assets/diagram.svg" resolves correctly from either page.
 */
export function normalizeAssetPath(rawPath) {
  const trimmedPath = rawPath.trim();

  if (trimmedPath === '') {
    return '';
  }

  const isAbsoluteUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmedPath);

  if (isAbsoluteUrl) {
    return trimmedPath;
  }

  if (trimmedPath.startsWith('/')) {
    return trimmedPath.slice(1);
  }

  return trimmedPath;
}
