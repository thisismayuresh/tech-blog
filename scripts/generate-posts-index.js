import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFrontmatter } from '../js/markdown/frontmatter.js';

/**
 * Scans posts/*.md and writes posts-index.json (frontmatter metadata only).
 * GitHub Pages has no server to scan at runtime, so this file is the list
 * the browser loads. Run it after adding or editing a post:
 *
 *   npm run build
 *
 * Commit the generated posts-index.json alongside your markdown files.
 */

const currentFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(path.dirname(currentFilePath));
const postsDirectory = path.join(projectRoot, 'posts');
const outputPath = path.join(projectRoot, 'posts-index.json');

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

function collectPosts() {
  if (!fs.existsSync(postsDirectory)) {
    return [];
  }

  const fileNames = fs.readdirSync(postsDirectory);
  const posts = [];

  for (const fileName of fileNames) {
    if (!fileName.endsWith('.md')) {
      continue;
    }

    const slug = fileName.slice(0, -'.md'.length);
    const filePath = path.join(postsDirectory, fileName);
    const fileStats = fs.statSync(filePath);

    if (!fileStats.isFile()) {
      continue;
    }

    const rawMarkdown = fs.readFileSync(filePath, 'utf8');
    const { data } = extractFrontmatter(rawMarkdown);

    posts.push({
      slug,
      title: data.title || slug,
      date: data.date || '',
      cover: data.cover || '',
      description: data.description || '',
    });
  }

  posts.sort(comparePostsByDateDescending);

  return posts;
}

const posts = collectPosts();
const indexJson = `${JSON.stringify(posts, null, 2)}\n`;
fs.writeFileSync(outputPath, indexJson, 'utf8');

console.log(`Wrote posts-index.json with ${posts.length} post(s).`);
