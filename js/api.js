/**
 * Post loading — no index file, no build step.
 *
 * Locally the dev server scans posts/ and returns slugs.
 * On GitHub Pages (static, no server) the same list comes from the
 * public GitHub Contents API. Either way each body is fetched as a
 * plain posts/<slug>.md file and parsed in the browser.
 */

// Set these once after creating the GitHub repository.
// Used only when the page is hosted on *.github.io.
const GITHUB_OWNER = 'thisismayuresh';
const GITHUB_REPO = 'tech-blog';

const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function isGitHubPages() {
  return window.location.hostname.endsWith('.github.io');
}

function isLocalDevServer() {
  return window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1';
}

async function fetchSlugsFromLocalServer() {
  const response = await fetch('api/post-slugs');

  if (!response.ok) {
    throw new Error('The list of posts could not be loaded from the local server.');
  }

  return response.json();
}

async function fetchSlugsFromGitHubApi() {
  const apiUrl =
    //`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/posts`;
    'https://api.github.com/repos/thisismayuresh/tech-blog/contents/posts'

  const response = await fetch(apiUrl, {
    headers: { Accept: 'application/vnd.github+json' },
  });

  if (response.status === 404) {
    throw new Error(
      'Could not find the posts folder on GitHub. Check GITHUB_OWNER and GITHUB_REPO in js/api.js.'
    );
  }

  if (response.status === 403 || response.status === 429) {
    throw new Error(
      'GitHub rate-limited the request. Wait a minute and refresh.'
    );
  }

  if (!response.ok) {
    throw new Error('The list of posts could not be loaded from GitHub.');
  }

  const entries = await response.json();
  const slugs = [];

  for (const entry of entries) {
    if (entry.type !== 'file' || !entry.name.endsWith('.md')) {
      continue;
    }

    const slug = entry.name.slice(0, -'.md'.length);

    if (SLUG_PATTERN.test(slug)) {
      slugs.push(slug);
    }
  }

  return slugs;
}

/**
 * Returns the list of post slugs (filename without .md).
 * Source depends on where the page is hosted — see module comment.
 */
export async function fetchPostSlugs() {
  if (isGitHubPages()) {
    return fetchSlugsFromGitHubApi();
  }

  if (isLocalDevServer()) {
    return fetchSlugsFromLocalServer();
  }

  throw new Error(
    'This page is neither on localhost nor GitHub Pages, so posts cannot be listed.'
  );
}

/**
 * Fetches one post's raw markdown. Returns { slug, markdown } or null
 * when the post does not exist.
 */
export async function fetchPostBySlug(slug) {
  if (!SLUG_PATTERN.test(slug)) {
    return null;
  }

  const response = await fetch(`posts/${encodeURIComponent(slug)}.md`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error('This post could not be loaded.');
  }

  const markdown = await response.text();
  return { slug, markdown };
}
