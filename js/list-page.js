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

function renderTagSelect() {
  const tagSelect = document.getElementById('tag-select');
  const tagCounts = collectTagCounts(allPosts);
  const previousValue = tagSelect.value;

  tagSelect.textContent = '';

  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = tagCounts.size === 0
    ? 'All tags'
    : `All tags (${tagCounts.size})`;
  tagSelect.appendChild(allOption);

  const sortedTags = [...tagCounts.keys()].sort((first, second) =>
    first.localeCompare(second));

  for (const tag of sortedTags) {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = `${tag} (${tagCounts.get(tag)})`;
    tagSelect.appendChild(option);
  }

  tagSelect.value = previousValue !== '' && tagCounts.has(previousValue)
    ? previousValue
    : activeTag;

  if (tagSelect.value !== activeTag) {
    activeTag = tagSelect.value;
  }
}

function renderActiveFilter() {
  const activeFilter = document.getElementById('active-filter');
  const activeFilterText = document.getElementById('active-filter-text');

  if (activeTag === '') {
    activeFilter.hidden = true;
    activeFilterText.textContent = '';
    return;
  }

  activeFilterText.textContent = activeTag;
  activeFilter.hidden = false;
}

function renderFilteredPosts() {
  const gridElement = document.getElementById('posts-grid');
  const statusElement = document.getElementById('list-status');
  const loadingElement = document.getElementById('list-loading');

  if (loadingElement !== null) {
    loadingElement.remove();
  }

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
  renderTagSelect();
  renderActiveFilter();
  renderFilteredPosts();
}

function initListControls() {
  const searchInput = document.getElementById('search-input');
  const tagSelect = document.getElementById('tag-select');
  const activeFilterClear = document.getElementById('active-filter-clear');

  searchInput.value = searchQuery;
  tagSelect.value = activeTag;

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    applyFiltersAndRender();
  });

  tagSelect.addEventListener('change', () => {
    activeTag = tagSelect.value;
    applyFiltersAndRender();
  });

  activeFilterClear.addEventListener('click', () => {
    activeTag = '';
    tagSelect.value = '';
    applyFiltersAndRender();
    searchInput.focus();
  });
}

function hideListLoading() {
  const loadingElement = document.getElementById('list-loading');

  if (loadingElement !== null) {
    loadingElement.remove();
  }
}

async function renderPostsList() {
  const statusElement = document.getElementById('list-status');

  try {
    allPosts = await fetchAllPostSummaries();
  } catch (error) {
    hideListLoading();
    statusElement.textContent = error.message;
    return;
  }

  hideListLoading();

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
