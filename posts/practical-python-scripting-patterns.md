---
title: Practical Python Scripting Patterns
date: 2026-08-14
cover: assets/python-tooling.svg
description: Small, explicit patterns for scripts you have to debug six months later.
tags: python, scripting
---

# Boring scripts last longer

A script that only you will read should optimize for the day you return to it half-asleep. That means fewer abstractions, clear names, and the standard library first.

![Project layout at a glance](assets/python-tooling.svg)

## Prefer `pathlib` over string paths

```python
from pathlib import Path

posts_directory = Path('posts')

for post_file in sorted(posts_directory.glob('*.md')):
    slug = post_file.stem
    text = post_file.read_text(encoding='utf-8')
    print(f'{slug}: {len(text)} characters')
```

String concatenation for paths breaks across platforms. `pathlib` does not.

## Parse arguments with `argparse`

```python
import argparse

def build_parser():
    parser = argparse.ArgumentParser(
        description='Render markdown posts to HTML.'
    )
    parser.add_argument(
        'source',
        help='Directory containing .md files',
    )
    parser.add_argument(
        '--output',
        default='dist',
        help='Destination directory (default: dist)',
    )
    return parser

args = build_parser().parse_args()
```

Help text is part of the interface. Write it while the design is fresh.

## Log instead of printing

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
)

logger = logging.getLogger(__name__)

def load_posts(directory):
    logger.info('Loading posts from %s', directory)
    # ...
```

`print` is fine for experiments; `logging` is what you want in anything that runs unattended.

## Type hints that earn their keep

```python
def extract_title(markdown_text: str, fallback: str) -> str:
    for line in markdown_text.splitlines():
        if line.startswith('# '):
            return line[2:].strip()
    return fallback
```

Hints on public functions pay off. Hinting every local variable does not.

## Quick reference

| Goal | Use |
| --- | --- |
| Paths | `pathlib.Path` |
| CLI | `argparse` |
| Output | `logging` |
| Types | hints on exported functions |

> If you cannot explain a helper function in one sentence, inline it until you can.

---

The goal is not cleverness. The goal is a script that still runs — and still makes sense — next season.
