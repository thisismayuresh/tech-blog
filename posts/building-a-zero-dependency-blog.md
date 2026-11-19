---
title: How I Built a Zero-Dependency Markdown Blog (and Why It Is Deliberately Boring)
date: 2026-11-19
cover: assets/blog-architecture.svg
description: The full story behind this site — custom markdown parser, dual-mode post loading, no-flash dark mode, GitHub Pages without a build step, and the decisions that kept it small.
tags: javascript, architecture, markdown, project
---

This blog has no React. No Hugo. No npm packages in production. No build pipeline that can break at 11 p.m. before a deadline.

It is plain HTML, CSS, and JavaScript modules — plus a markdown parser I wrote by hand because I wanted to understand every character that reaches the page.

This post is the “how we got here” story: the situation I was in, the constraints I set, the architecture that came out, and the tradeoffs I accepted on purpose. If you have ever thought “I should just write my own tiny blog,” this is the honest list of what that actually takes.

---

## Situation: why not just use an off-the-shelf blog?

### The obvious tools were fine — until they were not

There is no shortage of excellent static site generators: Hugo, Jekyll, Astro, Eleventy, Next.js. For many people they are the correct answer.

My situation was different in a few important ways:

1. **I wanted the blog itself to be a learning project.**  
   Using Hugo would ship a great blog and teach me Hugo. Writing the reader taught me parsers, frontmatter, GitHub’s API, progressive rendering, and theme systems — skills that transfer to product work.

2. **I wanted zero production dependencies.**  
   Every dependency is a future `npm audit`, a supply-chain story, a version bump that changes markdown rendering, or a toolchain that needs Node on a machine that only needs to serve files.

3. **I wanted markdown files in git to be the product.**  
   Write a `.md`, push, done. No CMS, no database, no admin UI to get hacked.

4. **I wanted a specific look.**  
   Warm paper-like light mode, ink-like dark mode, an A4 “sheet” for posts, no blue-on-white Bootstrap energy. Fighting a theme system for that is more work than writing 700 lines of CSS once.

### Task: the constraints I set before writing code

I wrote the rules down first, so future-me could not rationalize scope creep later:

| Constraint | Why |
| --- | --- |
| **No third-party runtime libraries** | Own every line that runs in the browser |
| **No build step** | Post = file in `posts/`; deploy = git push |
| **Static hosting on GitHub Pages** | Free, versioned, boring |
| **Works locally without Pages** | Same code path for dev and prod where possible |
| **Full-enough markdown** | Headings, lists, links, images, tables, code, quotes, strikethrough |
| **Simple syntax highlighting** | Only the languages I actually post about |
| **Dark mode without flash** | Theme applied before first paint |
| **Relative URLs only** | Project Pages lives under `/tech-blog/`, not `/` |
| **Print should not be dark** | People print posts; ink is expensive |

Those constraints look restrictive. They were the point. **Limitations are a product feature** when the product is “a blog I still understand in two years.”

### Action: the architecture that fell out of the constraints

![How markdown becomes HTML in this blog](assets/blog-architecture.svg)

The system has four layers. Each one does one job.

```text
1. Content     posts/*.md  +  assets/*
2. Loading     js/api.js   — find slugs, fetch bodies
3. Rendering   markdown/*  — frontmatter, blocks, inline, highlight
4. Pages       index.html  — list
               post.html   — one article
```

Everything else (theme, server for local dev) is support staff.

---

## The content model: frontmatter in plain text

Every post starts with a small metadata block:

```markdown
---
title: How I Built a Zero-Dependency Markdown Blog
date: 2026-11-19
cover: assets/blog-architecture.svg
description: One sentence for cards and SEO-ish listings.
tags: javascript, architecture
---
```

### Why frontmatter instead of a database

- **Git is the CMS.** Diffable, reviewable, backed up with the code.
- **No schema migrations** when I add a field like `tags`.
- **The file is portable.** Copy the `.md` to another site and it still makes sense.

### How parsing works (deliberately dumb)

The frontmatter parser does not understand nested YAML. It does not need to.

1. First line must be `---`.
2. Scan until the next `---`.
3. Each line: split on the first `:`, trim key and value.
4. Everything after the closing fence is the body.

That is enough for `title`, `date`, `cover`, `description`, and `tags`. If I ever need lists or nested objects, I will upgrade the parser — or refuse the feature. **Ambition in the content model is how tiny blogs become CMSes.**

Tags are stored as a comma-separated string (`kubernetes, devops`) and parsed into a lowercase list with a tiny helper shared by the list page and the post page. No YAML arrays required.

---

## The markdown parser: two passes, on purpose

This is the heart of the project, and the reason the repo has a `js/markdown/` folder instead of `import marked from 'marked'`.

### Why write a parser at all?

Honest answer: **partly pedagogy, partly control.**

- I learn by building. Parsers are a classic “you think you understand text until you write one.”
- Off-the-shelf libraries support a universe of markdown I do not use. I wanted a short list of features with explicit behavior.
- Security posture is clearer when *you* escape text and *you* decide that raw HTML in posts is not executed.

If I were launching a documentation site for a company tomorrow, I would seriously consider a maintained library. For this blog, the custom parser is a feature: **the blog’s rendering rules are in the repo.**

### Pass 1 — blocks (structure)

The document is walked line by line and split into structural units:

| Block | Trigger | Notes |
| --- | --- | --- |
| Heading | `#` … `######` | ATX style |
| Code fence | ` ``` ` or `~~~` | language tag optional |
| List | `-` `*` `+` `1.` | nests by indentation |
| Blockquote | `>` | content re-enters block parsing |
| Table | pipe row + delimiter row | GFM-style alignment |
| Rule | `---` `***` | horizontal rule |
| Paragraph | everything else | consecutive lines join |

Code fences are special: **inside a fence, markdown is not markdown.** That prevents a post about code fences from exploding.

### Pass 2 — inline (decoration inside a block)

Only after a block’s raw text is **HTML-escaped** do we apply:

- `**bold**`, `*italic*`, `~~strike~~`
- `` `code` ``
- `[label](url)` links
- `![alt](src)` images

Order matters. Escape first, then decorate. If you decorate first, a “clever” post can inject tags. If you escape first, the worst case is literal `&lt;` showing up — ugly, not dangerous.

### The highlighting sidekick

Syntax highlighting is a **second, small pass over code block text**, not a full compiler:

- Only **JavaScript, Python, HTML, CSS** (the languages I write here).
- Strings, comments, numbers, keywords, and a few builtins.
- Anything else (including YAML) falls back to plain monospace.

Why not Shiki or Prism? Those are great. They also want build steps, large grammars, or worker pipelines. My rules: **if a language is not in the list, the code still renders — just without color.** Graceful degradation beats a dependency.

### Testing the parser without a framework

There is no Jest here. A small Node script imports the ES modules, feeds sample markdown, and asserts on the HTML:

- expected tags present
- no raw `<script>` from unescaped input
- tables and nested lists survive
- no `undefined` leaking into output

That is enough regression safety for a personal site, and it runs with `node`, not a test framework install.

---

## Loading posts without a build-generated index

Here is the interesting systems problem:

> GitHub Pages is **static**. There is no server-side `list-posts` endpoint. How does the homepage know which posts exist?

### Option A — generate `posts-index.json` at “build” time

Rejected. It reintroduces a build step and a “forgot to regenerate” bug. The user explicitly wanted: **add a file, push, it appears.**

### Option B — two sources for the same list

`js/api.js` answers one question: **what are the slugs?**

| Environment | How slugs appear |
| --- | --- |
| **Local dev server** | `GET /api/post-slugs` — `server.js` scans `posts/` with `fs` |
| **GitHub Pages** | GitHub Contents API on `…/contents/posts` |
| **Anywhere else** | Clear error: this host is not supported |

Bodies are always fetched the same way on both sides:

```text
GET posts/<slug>.md
```

Relative path. Works under `https://user.github.io/tech-blog/` and under `http://localhost:3000/`.

### Why the Contents API is acceptable

- Public repo → public read → no auth header needed for listing names.
- The list is small (a handful of `.md` files).
- Rate limits exist; for a personal blog’s page loads, they are fine.
- If the API fails, the UI shows a real error message instead of a blank grid.

The dual-mode design is the only “clever” part of loading. Everything after that is: parse frontmatter, sort by date descending, render cards.

---

## The two pages

### List page (`index.html` + `list-page.js`)

1. Fetch slugs → fetch each markdown body → extract frontmatter.
2. Build card metadata: title, date, cover, description, tags.
3. Sort newest first.
4. Render cards with cover images (`loading="lazy"`).

Search and tags (added after the first version) filter that **in-memory** list:

- search matches title + description + tags
- tag chips filter by a single tag
- `?q=` and `?tag=` in the URL make filters shareable
- no matches → a clear empty state, not a silent blank grid

Because posts are already fully fetched for frontmatter, filtering is instant — no second network round trip.

### Post page (`post.html` + `post-page.js`)

1. Read `?slug=` from the URL.
2. Fetch `posts/<slug>.md`.
3. Split frontmatter from body.
4. Render markdown into the article.
5. Set `document.title`.
6. Tags under the date link back to the filtered list.

Unknown or missing slug → a human sentence, not a stack trace. That matters more than people think: every 404 is a chance to sound like a product or like a framework dump.

---

## Dark mode without the flash of white

The classic bug: HTML loads white → CSS/JS applies dark → user sees a white strobe.

### The fix: two scripts, two jobs

1. **`theme-boot.js` (in `<head>`, blocking)**  
   Reads `localStorage['theme-preference']` (or `prefers-color-scheme`) and sets `document.documentElement.dataset.theme` **before body paint.**

2. **`theme.js` (at end of page)**  
   Wires the header sun/moon button, updates `localStorage`, flips `data-theme`.

CSS does the rest with a token swap:

```css
:root { --color-background: #f7f6f3; /* paper */ }
html[data-theme="dark"] { --color-background: #141413; /* ink */ }
```

Components never hardcode `#ffffff`. They use `var(--color-surface)` etc. That is why dark mode is one attribute flip, not forty overrides.

### Print stays light

`@media print` forces paper tokens even when the screen is dark. Printing a dark article wastes toner and looks terrible on paper. This is the kind of detail that makes a site feel finished.

---

## Local development: a 100-line server with one route that matters

Pages cannot scan a directory from the browser. So for local work there is a tiny Node server (`server.js`, Node built-ins only):

- serves static files from the project root
- implements **`GET /api/post-slugs`** by reading `posts/`
- refuses path traversal (`../` nonsense)
- lists on port 3000

`npm start` → `node server.js`. No Express, no nodemon requirement, no webpack.

The production site never runs this file. It exists so the **same frontend code** works on localhost and on Pages. That symmetry is worth more than server features.

---

## Deployment: GitHub Pages, Jekyll, and the `.nojekyll` landmine

### The flow

```text
git push origin main
  → Pages builds (serves) the static tree
  → https://<user>.github.io/tech-blog/
```

No `package.json` build script required for deploy. The repo *is* the artifact.

### The bug that ate an evening

Symptoms:

- local: `posts/foo.md` loads fine
- Pages: list works, post fetch returns **404** for `.md` files

Cause: **GitHub Pages runs Jekyll by default.** Jekyll “helpfully” processes the site and can omit or transform files — including markdown — unless you stop it.

Fix: add an empty **`.nojekyll`** file at the repo root. Pages then serves raw files. `.md` files stay `.md`.

Lesson worth writing down:

> On GitHub Pages, mystery 404s on known files are often Jekyll, not your JavaScript.

### Relative URLs are non-negotiable

Project Pages serves the site from `/tech-blog/`, not `/`. Absolute paths like `/assets/foo.svg` break immediately. Everything in this codebase is relative: `css/styles.css`, `posts/x.md`, `assets/y.svg`, `index.html?tag=js`.

Asset helpers strip accidental leading slashes so a cover written as `/assets/x.svg` still resolves under the subpath.

### Hardcoded repo config (a small wart, on purpose)

The GitHub Contents API needs owner and repo names. Those constants live in `js/api.js`. When the site is on Pages, the URL is built from that config (currently also a literal URL in the fetch — a known simplification).

Is a hardcoded repo name elegant? No. Is it honest for a static site with no secrets? Yes. The alternative — build-time env vars — is a build step wearing a disguise.

---

## Design system: warm paper, ink, and one A4 joke that stuck

Visual choices were intentional, not accidental:

| Decision | Rationale |
| --- | --- |
| Background `#f7f6f3` (warm off-white) | Pure `#fff` is harsh; paper feel matches long-form reading |
| Dark ink `#141413` not pure black | Easier on eyes, still high contrast |
| Georgia for article body | Serif = “this is an essay,” sans = “this is chrome” |
| System UI sans for UI chrome | Fast, native, no font downloads |
| A4-width sheet for posts | Focuses line length; looks like a printed page |
| Tables with stripe + borders | Readable without a UI kit |
| Syntax tokens in earth tones | Color without rainbow carnival |

No icon font. No webfont request. The only SVGs are hand-drawn diagrams in `assets/` matching the same palette (off-white ground, ink boxes, Georgia labels).

---

## What I would tell someone building the same thing

### Do this

1. **Write the constraints first.** “No dependencies” is a design input, not a slogan.
2. **One job per module.** `api.js` loads; `frontmatter.js` splits; `markdown-parser.js` renders; `theme.js` toggles.
3. **Early returns, flat functions.** Parsers and DOM code get unreadable when nested three ifs deep.
4. **Escape before you decorate.** Non-negotiable for markdown → HTML.
5. **Error messages are UI.** “The list of posts could not be loaded from GitHub” beats `TypeError: undefined`.
6. **Test the parser with a script.** Even five golden cases prevent embarrassing regressions.
7. **Relative paths everywhere** if you might live under a subpath.

### Skip this (for a blog)

1. A database.
2. A CMS admin.
3. SSR/hosted functions for a list of markdown files.
4. A component framework for one list page and one article page.
5. Perfect YAML support.
6. A plugin ecosystem.

### The tradeoffs I accepted

| Tradeoff | Cost | Why I accepted it |
| --- | --- | --- |
| Custom parser | I maintain edge cases | Full control; small feature surface |
| GitHub API for slugs | Rate limits; needs public repo | Avoids build-generated index |
| Hardcoded owner/repo | Rename = edit one file | No build-time config |
| Client-side filtering | No SEO magic for filtered views | Blog scale is tiny; UX is instant |
| Only four highlight languages | Other languages are plain | Matches what I actually publish |

None of these are hidden. They are design decisions with receipts.

---

## Results: what exists today

A working static blog where:

- **Add a post** = create `posts/<slug>.md` → `git push` → it appears
- **Dark mode** works on first paint, persists in `localStorage`, prints light
- **Search and tags** filter in memory with shareable `?q=` / `?tag=` URLs
- **Markdown** covers the real-world set: tables, code, lists, quotes, images
- **Diagrams** are SVGs that follow the site palette
- **Local and Pages** share the same frontend; only slug discovery differs
- **Production deps: none**

The parser alone is a few hundred lines. The whole site fits in a mental model you can hold in one sitting — which was the point.

---

## What might come next

Ideas that fit the constraints (no build step, no heavy deps):

- **Related posts** — same-tag links computed client-side after load
- **Reading time** — word count from the body we already fetch
- **RSS** — either a tiny `server.js` route locally, or a committed `feed.xml` when I accept a one-file handoff
- **Anchor headings** — deep links into long posts (the Kubernetes article begs for this)
- **Slightly better highlighting** — still hand-rolled, still four languages, better token accuracy

What will **not** come next: a database, a framework migration for its own sake, or `node_modules` on the critical path of publishing a sentence.

---

## Recap — the story in STAR form

1. **Situation:** I wanted a personal blog and a real systems project at the same time; off-the-shelf tools optimized for one, not both.
2. **Task:** publish markdown from git, zero production dependencies, nice light/dark reading experience, static hosting.
3. **Action:** built a two-pass markdown parser, dual-mode slug loading for local vs Pages, token-based theming with pre-paint boot, relative-everything URLs, and a tiny local server for API parity.
4. **Result:** a site where writing is `git push`, the production dependency count is zero, and every behavior on screen has a file in this repository you can read.

The boring part is the feature. **Boring systems you understand beat clever systems you fear.**

If you build your own, keep the constraint list short, escape your HTML, and ship the `.nojekyll` file before you debug 404s for an hour. Ask me how I know.
