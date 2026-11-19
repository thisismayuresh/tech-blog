---
title: Building a Custom Markdown Parser
date: 2026-09-26
cover: assets/parser-pipeline.svg
description: How a two-pass parser turns plain text into HTML without any external libraries.
tags: javascript, markdown, parser
---

# Why build your own?

Most markdown libraries do far more than a blog reader needs. Writing a small parser yourself keeps the whole project dependency-free and makes every behavior explicit: you know exactly which syntax is supported and why.

![The two-pass parsing pipeline](assets/parser-pipeline.svg)

## The two passes

A parser is easiest to reason about when it does one job per pass.

1. **Block parsing** splits the document into structural units: headings, paragraphs, code fences, lists, blockquotes, tables, and rules.
2. **Inline parsing** walks each block's text and applies emphasis, links, images, and code spans — after HTML-escaping the raw text.

> Keep the passes separate. Mixing structure and inline logic in one loop is where parsers become hard to debug.

## What the block pass handles

| Block type | Trigger | Notes |
| --- | --- | --- |
| Heading | `#` through `######` | ATX style only |
| Code fence | ``` or `~~~` | language tag optional |
| List | `-`, `*`, `+`, `1.` | nests by indentation |
| Blockquote | `>` | re-enters the block pass |
| Table | pipe row + delimiter | GFM alignment supported |

### Inline styles

Inline rules run on **escaped** text so raw HTML in a post never reaches the browser:

- **Bold** with double asterisks
- *Italic* with single asterisks
- ~~Strikethrough~~ with tildes
- `inline code` with backticks
- [A normal link](https://example.com "Optional title")
- An image: ![Sample diagram](assets/parser-pipeline.svg)

## Code without highlighting rules

When a fence has no recognized language, the parser still escapes and renders it safely:

```
plain fenced block
no tokens, no spans
```

## A deliberate list of omissions

A short parser stays maintainable by *not* supporting everything:

1. Setext headings (`Title` underlined with `===`)
2. Reference-style links (`[text][ref]`)
3. Raw HTML passthrough
4. Bare-URL autolinking

Each omission removes a class of edge cases. If a feature is never used in these posts, it does not belong in the parser.

---

That is the whole idea: *boring code, predictable output.*
