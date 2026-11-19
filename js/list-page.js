import { fetchPostSlugs, fetchPostBySlug } from './api.js';
import { extractFrontmatter, parseTagList } from './markdown/frontmatter.js';
import { normalizeAssetPath } from './asset-path.js';
import { initThemeToggle } from './theme.js';
import { initHeaderScrollState } from './header-scroll.js';

let allPosts = [];
let searchQuery = '';
let activeTag = '';

/**
 * Formats an ISO date string (YYYY-MM-DD) for display on cards.
 * Returns the raw string when the date is missing or unparseable.
 */
function formatDate(dateString) {
  if (dateString === '') {
    return '';
  }

  const parsedDate = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return dateString;
  }

  return parsedDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function comparePostsByDateDescending(firstPost, secondPost) {
  if (firstPost.date === secondPost.date) {
    return 0;
  }
  if (firstPost.date === '') {
    return 1;
  }
  if (secondPost.date === '') {
    return -1;
  }
  if (firstPost.date < secondPost.date) {
    return 1;
  }
  return -1;
}

/**
 * Loads one markdown file and turns it into card metadata
 * (slug + frontmatter fields used on the list page).
 */
async function loadPostSummary(slug) {
  const post = await fetchPostBySlug(slug);

  if (post === null) {
    return null;
  }

  const { data } = extractFrontmatter(post.markdown);

  return {
    slug: post.slug,
    title: data.title || post.slug,
    date: data.date || '',
    cover: data.cover || '',
    description: data.description || '',
    tags: parseTagList(data.tags),
  };
}

async function fetchAllPostSummaries() {
  const slugs = await fetchPostSlugs();
  const summaries = await Promise.all(slugs.map(loadPostSummary));
  const validSummaries = [];

  for (const summary of summaries) {
    if (summary !== null) {
      validSummaries.push(summary);
    }
  }

  validSummaries.sort(comparePostsByDateDescending);

  return validSummaries;
}

function createCoverElement(post) {
  if (post.cover !== '') {
    const coverImage = document.createElement('img');
    coverImage.className = 'post-card-cover';
    coverImage.src = normalizeAssetPath(post.cover);
    coverImage.alt = '';
    coverImage.loading = 'lazy';
    return coverImage;
  }

  const coverPlaceholder = document.createElement('div');
  coverPlaceholder.className = 'post-card-cover post-card-cover-placeholder';
  coverPlaceholder.setAttribute('aria-hidden', 'true');
  return coverPlaceholder;
}

function createPostCard(post) {
  const cardLink = document.createElement('a');
  cardLink.className = 'post-card';
  cardLink.href = `post.html?slug=${encodeURIComponent(post.slug)}`;

  cardLink.appendChild(createCoverElement(post));

  const cardBody = document.createElement('div');
  cardBody.className = 'post-card-body';

  const formattedDate = formatDate(post.date);

  if (formattedDate !== '') {
    const dateElement = document.createElement('time');
    dateElement.className = 'post-card-date';
    dateElement.dateTime = post.date;
    dateElement.textContent = formattedDate;
    cardBody.appendChild(dateElement);
  }

  const titleElement = document.createElement('h2');
  titleElement.className = 'post-card-title';
  titleElement.textContent = post.title;
  cardBody.appendChild(titleElement);

  if (post.description !== '') {
    const descriptionElement = document.createElement('p');
    descriptionElement.className = 'post-card-description';
    descriptionElement.textContent = post.description;
    cardBody.appendChild(descriptionElement);
  }

  if (post.tags.length > 0) {
    const tagsElement = document.createElement('div');
    tagsElement.className = 'post-card-tags';

    for (const tag of post.tags) {
      const tagElement = document.createElement('span');
      tagElement.className = 'post-card-tag';
      tagElement.textContent = tag;
      tagsElement.appendChild(tagElement);
    }

    cardBody.appendChild(tagsElement);
  }

  cardLink.appendChild(cardBody);

  return cardLink;
}

function readFiltersFromUrl() {
  const urlParameters = new URLSearchParams(window.location.search);
  const queryParam = urlParameters.get('q');
  const tagParam = urlParameters.get('tag');

  searchQuery = queryParam === null ? '' : queryParam;
  activeTag = tagParam === null ? '' : tagParam.trim().toLowerCase();
}

function writeFiltersToUrl() {
  const urlParameters = new URLSearchParams();

  if (searchQuery.trim() !== '') {
    urlParameters.set('q', searchQuery.trim());
  }

  if (activeTag !== '') {
    urlParameters.set('tag', activeTag);
  }

  const queryString = urlParameters.toString();
  const nextUrl = queryString === ''
    ? window.location.pathname
    : `${window.location.pathname}?${queryString}`;

  window.history.replaceState(null, '', nextUrl);
}

function postMatchesFilters(post) {
  if (activeTag !== '' && !post.tags.includes(activeTag)) {
    return false;
  }

  const trimmedQuery = searchQuery.trim().toLowerCase();

  if (trimmedQuery === '') {
    return true;
  }

  const searchableText = [
    post.title,
    post.description,
    post.tags.join(' '),
  ].join(' ').toLowerCase();

  return searchableText.includes(trimmedQuery);
}

function collectTagCounts(posts) {
  const counts = new Map();

  for (const post of posts) {
    for (const tag of post.tags) {
      const currentCount = counts.get(tag);
      counts.set(tag, currentCount === undefined ? 1 : currentCount + 1);
    }
  }

  return counts;
}

function createTagChip(label, tagValue, count, isActive) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = isActive ? 'tag-chip tag-chip-active' : 'tag-chip';
  chip.dataset.tag = tagValue;

  const labelText = document.createElement('span');
  labelText.textContent = label;
  chip.appendChild(labelText);

  if (count !== null) {
    const countElement = document.createElement('span');
    countElement.className = 'tag-chip-count';
    countElement.textContent = String(count);
    chip.appendChild(countElement);
  }

  return chip;
}

function renderTagBar() {
  const tagBar = document.getElementById('tag-bar');
  tagBar.textContent = '';

  const tagCounts = collectTagCounts(allPosts);

  if (tagCounts.size === 0) {
    return;
  }

  tagBar.appendChild(createTagChip('All', '', null, activeTag === ''));

  const sortedTags = [...tagCounts.keys()].sort((first, second) =>
    first.localeCompare(second));

  for (const tag of sortedTags) {
    const isActive = tag === activeTag;
    tagBar.appendChild(createTagChip(tag, tag, tagCounts.get(tag), isActive));
  }
}

function renderFilteredPosts() {
  const gridElement = document.getElementById('posts-grid');
  const statusElement = document.getElementById('list-status');
  gridElement.textContent = '';

  const visiblePosts = allPosts.filter(postMatchesFilters);

  if (visiblePosts.length === 0) {
    statusElement.textContent = 'No posts match your search or tag filter.';
    return;
  }

  statusElement.textContent = '';

  for (const post of visiblePosts) {
    gridElement.appendChild(createPostCard(post));
  }
}

function applyFiltersAndRender() {
  writeFiltersToUrl();
  renderTagBar();
  renderFilteredPosts();
}

function initListControls() {
  const searchInput = document.getElementById('search-input');
  const tagBar = document.getElementById('tag-bar');

  searchInput.value = searchQuery;

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    applyFiltersAndRender();
  });

  tagBar.addEventListener('click', (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const chip = target.closest('.tag-chip');

    if (chip === null) {
      return;
    }

    const nextTag = chip.dataset.tag;

    if (nextTag === undefined) {
      return;
    }

    activeTag = nextTag;
    applyFiltersAndRender();
  });
}

async function renderPostsList() {
  const statusElement = document.getElementById('list-status');

  try {
    allPosts = await fetchAllPostSummaries();
  } catch (error) {
    statusElement.textContent = error.message;
    return;
  }

  if (allPosts.length === 0) {
    statusElement.textContent =
      'No posts yet. Add a markdown file to the posts/ directory and refresh.';
    return;
  }

  readFiltersFromUrl();
  initListControls();
  applyFiltersAndRender();
}

initThemeToggle();
initHeaderScrollState();
renderPostsList();
