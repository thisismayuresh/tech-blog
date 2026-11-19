import { fetchPostBySlug } from './api.js';
import { extractFrontmatter, parseTagList } from './markdown/frontmatter.js';
import { renderMarkdown } from './markdown/markdown-parser.js';
import { initThemeToggle } from './theme.js';
import { initHeaderScrollState } from './header-scroll.js';
import { ensureMarkdownIt, ensureMermaid } from './vendor-loader.js';

function getSlugFromUrl() {
  const urlParameters = new URLSearchParams(window.location.search);
  return urlParameters.get('slug');
}

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
    month: 'long',
    day: 'numeric',
  });
}

function renderMessage(messageText) {
  const contentElement = document.getElementById('post-content');
  contentElement.textContent = '';
  contentElement.classList.add('post-message');

  const messageParagraph = document.createElement('p');
  messageParagraph.textContent = messageText;
  contentElement.appendChild(messageParagraph);
}

function getMermaidTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'neutral';
}

async function renderMermaidBlocks(rootElement) {
  const mermaidBlocks = rootElement.querySelectorAll('pre.mermaid');

  if (mermaidBlocks.length === 0) {
    return;
  }

  const mermaid = await ensureMermaid();

  mermaid.initialize({
    startOnLoad: false,
    theme: getMermaidTheme(),
    securityLevel: 'strict',
    fontFamily: 'system-ui, sans-serif',
  });

  await mermaid.run({ nodes: mermaidBlocks });
}

async function renderPost(post) {
  const { data, body } = extractFrontmatter(post.markdown);
  const contentElement = document.getElementById('post-content');
  contentElement.textContent = '';
  contentElement.classList.remove('post-loading', 'post-message');

  const title = data.title || post.slug;
  document.title = `${title} — Tech Blog`;

  const titleElement = document.createElement('h1');
  titleElement.className = 'post-title';
  titleElement.textContent = title;
  contentElement.appendChild(titleElement);

  const metaElement = document.createElement('div');
  metaElement.className = 'post-meta';

  if (data.date) {
    const dateElement = document.createElement('time');
    dateElement.className = 'post-date';
    dateElement.dateTime = data.date;
    dateElement.textContent = formatDate(data.date);
    metaElement.appendChild(dateElement);
  }

  const tags = parseTagList(data.tags);

  if (tags.length > 0) {
    const tagsElement = document.createElement('div');
    tagsElement.className = 'post-tags';

    for (const tag of tags) {
      const tagLink = document.createElement('a');
      tagLink.className = 'post-tag';
      tagLink.href = `index.html?tag=${encodeURIComponent(tag)}`;
      tagLink.textContent = tag;
      tagsElement.appendChild(tagLink);
    }

    metaElement.appendChild(tagsElement);
  }

  contentElement.appendChild(metaElement);

  await ensureMarkdownIt();

  const bodyWrapper = document.createElement('div');
  bodyWrapper.className = 'post-body';
  bodyWrapper.innerHTML = renderMarkdown(body);
  contentElement.appendChild(bodyWrapper);

  await renderMermaidBlocks(bodyWrapper);
}

async function loadPost() {
  const slug = getSlugFromUrl();

  if (slug === null || slug.trim() === '') {
    renderMessage('No post was requested. Go back to the list and choose one.');
    return;
  }

  let post;

  try {
    post = await fetchPostBySlug(slug);
  } catch (error) {
    renderMessage(error.message);
    return;
  }

  if (post === null) {
    renderMessage(`The post "${slug}" does not exist. It may have been renamed or removed.`);
    return;
  }

  try {
    await renderPost(post);
  } catch (error) {
    renderMessage(error.message);
  }
}

function copyCodeFromButton(button) {
  const codeBlock = button.closest('.code-block');

  if (codeBlock === null) {
    return;
  }

  const codeElement = codeBlock.querySelector('code');

  if (codeElement === null) {
    return;
  }

  navigator.clipboard.writeText(codeElement.textContent).then(() => {
    button.textContent = 'Copied';

    window.setTimeout(() => {
      button.textContent = 'Copy';
    }, 1500);
  }).catch(() => {
    button.textContent = 'Copy failed';
  });
}

document.addEventListener('click', (event) => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const copyButton = target.closest('.copy-code-button');

  if (copyButton === null) {
    return;
  }

  copyCodeFromButton(copyButton);
});

initThemeToggle();
initHeaderScrollState();
loadPost();
