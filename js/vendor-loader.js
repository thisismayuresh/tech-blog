/**
 * Loads vendored library scripts on demand (no CDN at runtime).
 * Files live in vendor/ and are served as static assets.
 */
const loadedSources = new Set();

export function loadScript(source) {
  if (loadedSources.has(source)) {
    return Promise.resolve();
  }

  const existingScript = document.querySelector(`script[src="${source}"]`);

  if (existingScript !== null) {
    loadedSources.add(source);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = () => {
      loadedSources.add(source);
      resolve();
    };
    script.onerror = () => {
      reject(new Error(`Could not load ${source}.`));
    };
    document.head.appendChild(script);
  });
}

export async function ensureMarkdownIt() {
  await loadScript('vendor/markdown-it.min.js');

  if (typeof globalThis.markdownit !== 'function') {
    throw new Error('vendor/markdown-it.min.js loaded but markdownit() is missing.');
  }
}

export async function ensureMermaid() {
  await loadScript('vendor/mermaid.min.js');

  if (globalThis.mermaid === undefined || globalThis.mermaid === null) {
    throw new Error('vendor/mermaid.min.js loaded but mermaid is missing.');
  }

  return globalThis.mermaid;
}
