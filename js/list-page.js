import { fetchPostsList } from './api.js';
import { normalizeAssetPath } from './asset-path.js';
import { initThemeToggle } from './theme.js';

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

  cardLink.appendChild(cardBody);

  return cardLink;
}

async function renderPostsList() {
  const gridElement = document.getElementById('posts-grid');
  const statusElement = document.getElementById('list-status');

  let posts;

  try {
    posts = await fetchPostsList();
  } catch (error) {
    statusElement.textContent = error.message;
    return;
  }

  if (posts.length === 0) {
    statusElement.textContent =
      'No posts yet. Add a markdown file to the posts/ directory and refresh.';
    return;
  }

  for (const post of posts) {
    gridElement.appendChild(createPostCard(post));
  }
}

initThemeToggle();
renderPostsList();
