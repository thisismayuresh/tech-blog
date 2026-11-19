---
title: JavaScript Event Loop in Practice
date: 2026-11-10
cover: assets/event-loop.svg
description: A practical walkthrough of call stacks, microtasks, and task queues.
tags: javascript, async, event-loop
---

# The short version

JavaScript runs one call stack at a time. Work that cannot finish immediately is queued. The event loop drains queues between turns of the stack.

![Event loop, queues, and stack](assets/event-loop.svg)

## Reading the diagram

- The **call stack** holds the functions currently executing.
- The **microtask queue** holds promise callbacks; it is emptied after every task.
- The **task queue** holds `setTimeout` callbacks and browser events.

```javascript
console.log('first');

setTimeout(() => {
  console.log('third');
}, 0);

Promise.resolve().then(() => {
  console.log('second');
});

// Output: first, second, third
```

Promises win because microtasks always run before the next task.

## Why order matters

```javascript
async function fetchData() {
  try {
    const response = await fetch('/api/posts');
    const posts = await response.json();
    return posts;
  } catch (error) {
    console.error('Request failed:', error.message);
    return [];
  }
}

fetchData().then((posts) => {
  console.log(`Loaded ${posts.length} posts`);
});
```

Each `await` suspends the async function and returns control to the event loop. When the awaited value settles, the continuation is scheduled as a microtask.

## Practical rules

1. Do not assume `setTimeout(fn, 0)` runs "immediately" — it waits for the current task and all microtasks.
2. Prefer `Promise` scheduling over timers for ordering guarantees.
3. Keep stack frames short; long synchronous work blocks every queue.

> If UI feels frozen, the stack is busy — not the queues.

See also [MDN's event loop guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Event_loop) for the full spec wording.
