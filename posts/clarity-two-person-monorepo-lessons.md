---
title: "Clarity Moves Mountains: Two People, One Monorepo, 1,000+ Users, and What I Learned Next to a Tech Genius"
date: 2026-11-19
cover: assets/two-person-monorepo.svg
description: "What I learned running a multi-tenant SaaS monorepo as one of two engineers: why clarity matters more than any tool, how a cluttered screen costs you more than you think, how to talk to stakeholders, and the backend lessons on queues, caching, payments and uptime."
tags: monorepo, nestjs, saas, backend-engineering, microservices, multi-tenancy, open-source, software-engineering, career, clarity, stakeholder-communication, productivity, lessons-learned
---

Most monorepo advice is written for companies with platform teams, dedicated DevOps and a build-tooling budget. My version of the story is smaller and messier. The engineering team on Impler, an open-source SaaS with 500+ GitHub stars, was two people: my manager, one of the sharpest engineers I have worked with, and me.

That meant I owned the backend end to end: six services, multi-tenant data, payments, queues, caching, and the production questions that arrive at awkward hours. Along the way I reviewed 150+ pull requests and onboarded two engineers, which stress-tested every habit in this post.

If I had to compress everything I learned into one sentence, it would be this: **with clarity you can move mountains, and without it you can't even kill a mouse.**

Clear thinking made hard problems small. Unclear thinking made trivial ones take all day. The rest of this post is the technical and human practice of staying clear, including the lesson my manager drilled into me by scolding me about my screen.

## The setup, in numbers

- A NestJS and Next.js stack, with a React SDK published on npm
- 1,000+ users across 6 services, at 99.99% uptime
- p95 API latency cut from 820ms to 180ms
- Payments through Stripe, Paystack and Paytm, with webhooks, recurring billing and usage-based overage charges
- A team of two, plus whatever discipline we could automate

<!-- Add a real story here: one moment early on when owning the whole backend felt overwhelming, and what you did about it. -->

## The idea underneath everything: clarity

When a task goes badly, it is rarely because the code was too hard. It is because something was unclear: what "done" meant, which environment I was in, what the client actually needed, which of five open tabs held the thing I was debugging.

Clarity has three layers, and the rest of this post follows them:

1. **Clarity of workspace.** Can I see only what matters for this task?
2. **Clarity of thought.** Can I state the problem and the finish line in a sentence or two?
3. **Clarity of communication.** Can the person reading my message act on it without asking me anything?

A simple test I still use: if I cannot explain what I'm about to do in two sentences, I am not ready to start. Starting anyway is how you spend an afternoon moving things around without killing the mouse.

## Lesson 1: Clarity starts at your desk, so close the windows

My manager would scold me for the state of my screen: browser windows stacked on browser windows, a pile of tabs, Postman full of old requests, and whatever else I had left open from the last three problems. At first I read it as fussiness. Later I understood it was about clarity.

Every open window is a thread your brain keeps alive. You may not be looking at it, but it is competing for attention. When you are debugging, you need to hold a mental model of one system. A cluttered screen forces you to rebuild that model every time you switch.

There is also a safety argument. When you have a dozen requests and several environments open at once, it becomes easy to send the right request to the wrong place, or to be unsure which tenant, database or environment you are touching. With a team of two, a mistake in production is yours to clean up.

What I changed:

| Cluttered habit | Clear habit |
| --- | --- |
| Many browser windows and dozens of tabs | One window per task; close tabs when the question is answered |
| Tabs used as a to-do list | Write the to-do in a note and close the tab |
| Postman full of untitled, half-finished requests | Saved requests in named collections; close what I'm not using |
| One shared Postman setup for every environment | Clearly named environments (local, staging, production), with production unmistakable at a glance |
| Dozens of files open in the editor | Only the files in the current change |
| Several unnamed terminals | One terminal per service, named |
| Chat and email notifications during deep work | Notifications off until the task is done |
| Leaving everything open overnight | An end-of-day reset: close everything, write the next step in one line |

The routine takes seconds, and it pays back all day. Before starting a task I ask: *what is the one question I'm answering, and what do I need open to answer it?* Everything else gets closed.

<!-- Add a real story here: a moment when a cluttered screen cost you time, or when he walked over and you finally understood why. -->

## Lesson 2: A monorepo is a force multiplier for two people, but only if you earn it

The honest case for a monorepo at this size is simple. One change can touch the API, the frontend and the SDK in a single pull request, with one review and one revert if it goes wrong. Shared types mean the contract between backend and client is checked by the compiler instead of by hope. With two people, anything that removes coordination overhead is worth a lot.

The catch is that a monorepo makes bad coupling easy. Nothing stops you from importing a database helper from one service into another, and in a team of two nobody is policing it. Left alone, six services slowly become one distributed monolith that is harder to change than either alternative.

My rules for staying out of that trap:

- **Dependencies point one way.** Apps and services depend on shared packages. Shared packages never depend on apps.
- **Shared packages stay small and boring.** Types, validation schemas, logging, config. Business logic does not live there.
- **One owner per service, even when the owners are the same two people.** Writing down who is responsible for what forces clear boundaries.
- **A new shared package needs a reason.** If it only has one consumer, it is not shared yet.
- **Pick one workspace and task-runner setup and stick with it.** The specific tool (npm or pnpm workspaces, Nx, Turborepo) matters far less than using it consistently and caching builds.

Notice that each rule is a clarity rule. They exist so that anyone can answer "where does this belong?" without a meeting.

## Lesson 3: Boundaries beat folders

Modular NestJS made this easier. Each module owns its controllers, services and data access, and exposes a deliberately small surface to the rest of the app. The same thinking applies one level up: six services only help if each one can be understood, tested and deployed without reading the other five.

A useful test I kept coming back to: *could a new engineer fix a bug in this module after reading only this module?* If not, the boundary is leaking.

## Lesson 4: Your public SDK is the one thing you cannot refactor freely

Everything inside the monorepo can change in a single commit. The React SDK on npm cannot, because other people's production apps depend on it. Maintaining it taught me to treat a published package differently from internal code:

- Follow semantic versioning strictly. A breaking change is a major version, even when it feels small.
- Keep the SDK's surface area minimal. Every exported function is a promise.
- Version the SDK and the API contract together in your head. A backend change that quietly breaks an old SDK version is a production incident that you cannot see on your own dashboards.
- Deprecate before removing, and say so in the changelog.

The monorepo helps here, because a contract test between the API and the SDK can live in the same repository and fail in CI before anyone upgrades.

## Lesson 5: CI is your third engineer

With two people, nobody has time to be the human build server. CI had to do the repetitive checking so that review time could go to judgment calls. What mattered most:

- **Fast feedback.** If CI takes long enough that you switch tasks, you lose the benefit, and the clarity along with it. Cache dependencies and build outputs, and run only what a change affects.
- **Tests where the risk lives.** Tenant isolation, billing logic and webhook handling deserve far more coverage than a settings page. Coverage percentages are vanity; coverage of money and data boundaries is not.
- **Style handled by machines.** Linters and formatters settle formatting so reviews are about behavior.
- **A pull request checklist.** Is this tenant-scoped? Does the query have an index? Is the handler idempotent? Is there a migration?

## Lesson 6: Multi-tenancy is a constraint you design in on day one

Multi-tenant means every query, job and log line has to know whose data it is touching. Retrofitting that is painful, so I treated tenant scoping as a rule of the architecture rather than a feature.

- **Scope at the lowest layer.** Put the tenant filter where data is accessed, so a forgotten check in a controller cannot leak data.
- **Index for the tenant first.** On MongoDB, aggregation pipelines should filter early so indexes can do the work, and compound indexes should lead with the tenant.
- **Isolate the heavy paths.** Isolated import pipelines mean one tenant's enormous file cannot slow down or contaminate another tenant's work.

Here is an illustrative pattern, not code from the repository:

```js
// Tenant filter first, so an index can do the work
db.imports.aggregate([
  { $match: { tenantId, status: "processed", createdAt: { $gte: since } } },
  { $group: { _id: "$templateId", total: { $sum: 1 } } },
]);
```

Security and compliance fell out of the same mindset. Encrypted data handling, audit logging and cryptographically signed webhooks (so receivers can verify a call really came from us) are the kind of controls that SOC 2 and GDPR/DPDP conversations ask about. I'd call this **compliance readiness, not certification**: building those controls in early is far cheaper than bolting them on when a large customer asks for them.

## Lesson 7: Performance work is mostly measurement

Taking p95 latency from 820ms to 180ms was not one clever trick. It was a sequence of unglamorous steps, and the order mattered:

1. **Measure percentiles, not averages.** The average hides the slow requests that users actually complain about.
2. **Fix the queries first.** Missing indexes and N+1 patterns (one query per item in a loop) are the most common and cheapest wins.
3. **Cache what is hot and stable.** Active subscription data is read constantly and changes rarely, so Redis was an easy fit.
4. **Move slow work off the request path.** If the user does not need the result immediately, a worker should do it.

This is clarity applied to performance: "make it faster" is a fog, while "bring p95 on this endpoint under 200ms" is something you can actually do.

The caching lesson I would underline: **a cache is only as correct as its invalidation.** The code path that changes a subscription must be the same code path that updates or clears the cached value, or users will see stale entitlements.

## Lesson 8: Async is where small teams get leverage, and pain

Queues let two people build things that would otherwise need a bigger team: slow imports, retries, fan-out to downstream systems. But each tool solves a different problem, and mixing them up is a classic source of mystery bugs.

| Problem | Tool | Why |
| --- | --- | --- |
| Hand data between services and route it to the right destination | RabbitMQ | Durable messaging that decouples producers from consumers |
| Background jobs with retries, backoff and concurrency control | BullMQ | Redis-backed job orchestration with good visibility |
| CPU-heavy data transformation | Node.js Worker Threads | Keeps the event loop free; queues schedule work, threads do the heavy computing |
| Hot, rarely-changing reads | Redis cache | Removes repeated database lookups |
| Multi-tenant analytical queries | MongoDB aggregation pipelines with proper indexes | Pushes the work to the database |

A rule of thumb I like: **I/O-bound work gets async, CPU-bound work gets threads, and anything crossing a service boundary that must not be lost gets a broker.** Combining BullMQ for orchestration with Worker Threads for parallel execution gave me both control over the job lifecycle and real parallelism for transformations.

The habits that keep async sane: idempotent consumers (processing a message twice must be safe), dead-letter queues for poison messages, and logs that carry a correlation ID across services so you can follow one import from start to finish.

## Lesson 9: Money code deserves paranoia

I built payment APIs with NestJS and TypeORM and integrated Stripe, Paystack and Paytm, with webhooks handling 100+ monthly transactions, plus cron-driven recurring billing and usage-based overage charges for 1,000+ users. The lessons:

- **Webhooks are the source of truth, not the browser redirect.** Users close tabs. Gateways retry. Design for both.
- **Verify, deduplicate, then process.** Check the signature, record the event ID, and ignore repeats.
- **Hide gateway differences behind one internal interface,** but keep escape hatches, because each gateway has its own quirks.
- **Make billing runs safe to repeat.** Cron jobs can fire twice or be restarted mid-run. Use locks or idempotency keys, and log every charge decision.
- **Know which environment you're in.** With payment gateways, a test key and a live key look alike. This is exactly why Lesson 1's habit of clearly named environments matters most here.

An illustrative webhook handler pattern:

```ts
// Illustrative pattern, not the repository's code
async handleWebhook(rawBody: Buffer, signature: string) {
  verifySignature(rawBody, signature);                 // reject forged calls
  const event = JSON.parse(rawBody.toString());
  const firstTime = await events.insertIfNew(event.id, rawBody);
  if (!firstTime) return;                              // gateway retry, already handled
  await process(event);
}
```

<!-- Add a real story here: a billing or webhook edge case you hit, and how you handled it. -->

## Lesson 10: 99.99% uptime without an ops team

Four nines allows roughly 52 minutes of downtime per year, so there is almost no room for heroics. With no dedicated operations people, the strategy had to be mostly about not creating incidents:

- **Boring technology.** Mature tools with known failure modes beat clever ones.
- **Queues as shock absorbers.** A traffic spike or a slow downstream service should delay work, not drop requests.
- **Health checks and alerts on symptoms** (error rate, latency, queue depth) rather than on every internal metric.
- **Small, frequent releases** that are easy to roll back.
- **A short runbook** for the incidents you have already had, so the second time is faster than the first.

Uptime numbers also depend on how you measure them, so define it explicitly (which endpoints, over what period) before you quote it.

## Lesson 11: Working next to a tech genius

Being one of two engineers beside someone far stronger is the best learning environment I have had, and also a trap if you handle it badly. What worked:

- **Bring a recommendation, not just a question.** "Here are two options and the trade-offs, I lean toward A" respects their time and shows your thinking.
- **Ask why, not only what.** The reasoning behind a decision is what transfers to the next problem.
- **Disagree with evidence.** Query plans, benchmarks and logs end debates faster than opinions.
- **Treat code review as a curriculum.** I kept track of recurring comments and fixed the habit at its source instead of fixing each pull request.
- **Take the scolding as information.** When he told me off, it was almost never about the thing itself. It was about the habit underneath, usually a lack of clarity. The cluttered screen was one example. Vague messages were another.
- **Write decisions down.** A short note on why we chose something keeps knowledge out of one person's head, including mine.
- **Do not let yourself become dependent.** A team of two has a bus factor of two. The goal is that either of us can run the system alone for a week.

<!-- Add a real story here: something your manager taught you that changed how you work. -->

## Lesson 12: Stakeholder communication is clarity pointed outward

Another thing my manager taught me was how to talk to stakeholders. I worked directly with offshore clients: regular calls, production issue triage, product questions. Technical skill alone does not get you through that. Clients and managers do not want to hear about your stack trace. They want to know what is happening, how it affects them, and what happens next.

The principles I took from it:

**1. Lead with the conclusion.** Start with status, impact and next step. Put the technical detail underneath for anyone who wants it.

**2. Translate to impact.** "p95 latency dropped from 820ms to 180ms" is true. "Nearly every request now feels instant" is what a non-technical stakeholder remembers.

**3. Separate what you know from what you don't.** Say what is confirmed, what is a guess, and when you will know more. Presenting a guess as a fact is the fastest way to lose trust.

**4. Deliver bad news early, with a plan.** A problem reported before the deadline is a risk. The same problem reported after is a surprise. Never make a stakeholder discover something you already knew.

**5. One message, one ask.** If a message contains five questions, you will get an answer to one. Make the thing you need obvious and easy to answer.

**6. Say no with options.** Instead of "we can't do that," offer trade-offs: scope, time or risk. "We can ship the full version in three weeks, or this smaller version by Friday."

**7. Write it down after the call.** Decisions, owners and dates, sent the same day. With offshore time zones, a clear written summary is worth more than another meeting.

**8. Ask what job they are trying to get done.** Before debating a feature, find out the real problem. It prevents building the wrong thing precisely.

For production incidents, I kept a short template so that updates were calm and complete:

```text
Illustrative incident update template

Status: Investigating / Mitigated / Resolved
Impact: Who is affected and how (in plain language)
What we know: Confirmed facts only
What we don't know yet: Open questions
What we're doing: Current action and who owns it
Next update: A specific time
```

My triage order was always the same: reproduce, assess severity, mitigate, find the root cause, then write it up. Keeping incident time separate from planning time meant neither got done badly.

Look at how closely this mirrors Lesson 1. A clear workspace, a clear mind and a clear message all serve the same goal: leave no room for confusion.

<!-- Add a real story here: a client call or incident where communicating clearly (or not) changed the outcome. -->

## Lesson 13: Reviewing 150+ pull requests and onboarding engineers

Review volume only works if pull requests are small and the standards are explicit. For onboarding, the goal was that a new engineer could be productive without asking me for every step:

- One-command local setup with seed data
- A short architecture map per service
- A pull request template carrying the checklist from Lesson 5
- A real first task, with pairing on the first pull request
- A habit I borrowed from Lesson 1: teach newcomers to work with one thing open at a time

Because Impler is open source, those same docs doubled as contributor documentation. Good onboarding and good open-source hygiene turned out to be the same work.

## Lesson 14: Build what people actually use

Integrating Amplitude event tracking and heatmap analytics gave visibility into funnels, feature adoption and interaction patterns across 1,000+ monthly active users. A few cautions:

- **Define the event taxonomy before sprinkling events everywhere.** Messy names make the data useless.
- **At this scale, look at funnels and behavior patterns,** not tiny statistical differences.
- **Keep tenant data out of analytics.** It ties directly back to the compliance mindset.
- **Use the data to cut features as well as to add them.**

## What I would put in place from day one

If I were starting again tomorrow, I would do these earlier:

- Distributed tracing with correlation IDs across all services
- Short architecture decision records for every non-obvious choice
- Contract tests between the API and the public SDK
- Load tests for the heaviest import path
- Restore drills for backups, not just backups
- Feature flags around risky billing changes
- A written "definition of done" on every task before I start it
- Postman environments with production visibly different from everything else

## A checklist for anyone running a monorepo with a tiny team

1. Before each task, write the goal and the finish line in two sentences.
2. Close everything you don't need: windows, tabs, Postman requests, terminals, notifications.
3. Name your environments clearly and make production impossible to confuse.
4. Enforce one-way dependencies between apps and shared packages.
5. Keep shared packages small and free of business logic.
6. Treat every published package as a public promise.
7. Make CI fast, and put the strictest tests around money and tenant boundaries.
8. Scope tenants at the data layer, not just the controller.
9. Measure percentiles, fix queries first, and design cache invalidation before the cache.
10. Match the tool to the problem: broker, job queue, thread, cache.
11. Make every webhook handler and billing job safe to run twice.
12. Communicate with stakeholders conclusion first, impact first, bad news early.
13. Write down decisions, runbooks and meeting outcomes so no single person is the system.
14. Learn aggressively from the strongest person you work with, then make sure you can stand on your own.

## The bottom line

Running a production monorepo as one of two engineers taught me that scale is not the hard part. Clarity is. A clear screen, a clear task, a clear boundary and a clear message are what let two people carry a system that looks like it needs ten. Without them, even the smallest problem turns into an afternoon of fog.

Working beside someone far better than me taught me two skills I did not expect to learn from a backend job: how to keep my own head and workspace uncluttered, and how to explain technical reality to people who do not care about the technology. With clarity you can move mountains. Without it, you cannot kill a mouse.