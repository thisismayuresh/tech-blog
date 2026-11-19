---
title: "Clarity Moves Mountains: Two Engineers, One Open-Source Monorepo, 1,000+ Users, and Lessons Beyond Code"
date: 2026-11-19
cover: assets/clarity-monorepo-cover.jpg
description: "What I learned running a multi-tenant SaaS monorepo as one of two engineers: why clarity matters more than any tool, how a cluttered screen costs you more than you think, how to talk to stakeholders, and the backend lessons on queues, caching, payments and uptime."
tags: monorepo, nestjs, saas, backend-engineering, microservices, multi-tenancy, open-source, software-engineering, career, clarity, stakeholder-communication, productivity, lessons-learned
---

Most monorepo advice is written for companies with platform teams, dedicated DevOps engineers, and a build-tooling budget. My version of the story is smaller and messier.

The engineering team on Impler, an open-source SaaS with 500+ GitHub stars, was two people: my manager, one of the sharpest engineers I have worked with, and me.

That meant I owned the backend end to end: six services, multi-tenant data, payments, queues, caching, and the production questions that arrive at awkward hours. Along the way, I reviewed 150+ pull requests and onboarded two engineers, which stress-tested every habit in this post.

If I had to compress everything I learned into one sentence, it would be this:

With clarity, you can move mountains, and without it, you can't even kill a mouse.

Clear thinking made hard problems small. Unclear thinking made trivial ones take all day.

The rest of this post is about the technical and human practices that helped me stay clear, including the lessons my manager drilled into me, sometimes by correcting me, sometimes by challenging me, and sometimes by making me rethink the way I approached even the simplest things.

## The setup, in numbers

- A NestJS and Next.js stack, with a React SDK published on npm.
- 1,000+ users across 6 services, at 99.99% uptime.
- p95 API latency reduced from 820ms to 180ms.
- Payments through Stripe, Paystack, and Paytm, with webhooks, recurring billing, and usage-based overage charges.
- A team of two, plus whatever discipline we could automate.

## The idea underneath everything: clarity

When a task goes badly, it is rarely because the code was too hard.

It is usually because something was unclear:

- What exactly does "done" mean?
- Which environment am I working in?
- What does the client actually need?
- Which of the five open tabs contains the information I need?
- Am I solving the actual problem or just treating its symptoms?

Clarity has three layers, and the rest of this post follows them:

1. **Clarity of workspace.** Can I see only what matters for this task?
2. **Clarity of thought.** Can I state the problem and the finish line in a sentence or two?
3. **Clarity of communication.** Can the person reading my message act on it without asking me anything?

A simple test I still use: if I cannot explain what I'm about to do in two sentences, I am probably not ready to start.

Starting anyway is how you spend an afternoon moving things around without killing the mouse.

## Lesson 1: Clarity starts at your desk, so close the windows

My manager would scold me for the state of my screen: browser windows stacked on browser windows, a pile of tabs, Postman full of old requests, and whatever else I had left open from the last three problems.

At first, I thought it was just about keeping things organised.

Later, I understood that it was about clarity.

Every open window is a thread your brain keeps alive. You may not be looking at it, but it is competing for attention.

When you are debugging, you need to hold a mental model of one system. A cluttered screen forces you to rebuild that model every time you switch.

There is also a safety argument. When you have a dozen requests and several environments open at once, it becomes easy to send the right request to the wrong place or to be unsure which tenant, database, or environment you are touching.

With a team of two, a mistake in production is yours to clean up.

What I changed:

| Cluttered habit | Clear habit |
|---|---|
| Many browser windows and dozens of tabs | One window per task; close tabs when the question is answered |
| Tabs used as a to-do list | Write the to-do in a note and close the tab |
| Postman full of untitled requests | Saved requests in named collections |
| One shared Postman setup for every environment | Clearly named environments: local, staging, production |
| Dozens of files open in the editor | Only the files related to the current change |
| Several unnamed terminals | One terminal per service, clearly named |
| Chat and email notifications during deep work | Notifications off until the task is done |
| Leaving everything open overnight | An end-of-day reset: close everything and write the next step in one line |

The routine takes seconds, and it pays back all day.

Before starting a task, I ask myself:

What is the one question I'm answering, and what do I need open to answer it?

Everything else gets closed.

## Lesson 2: A monorepo is a force multiplier for two people, but only if you earn it

The honest case for a monorepo at this size is simple.

One change can touch the API, frontend, and SDK in a single pull request, with one review and one revert if something goes wrong.

Shared types mean the contract between backend and client is checked by the compiler instead of by hope.

With two people, anything that removes coordination overhead is worth a lot.

The catch is that a monorepo makes bad coupling easy.

Nothing stops you from importing a database helper from one service into another, and in a team of two, nobody is constantly policing it.

Left alone, six services slowly become one distributed monolith that is harder to change than either alternative.

My rules for staying out of that trap:

- **Dependencies point one way.** Apps and services depend on shared packages. Shared packages never depend on apps.
- **Shared packages stay small and boring.** Types, validation schemas, logging, and configuration. Business logic does not live there.
- **One owner per service.** Even when the owners are the same two people, writing down responsibility forces clear boundaries.
- **A new shared package needs a reason.** If it only has one consumer, it is not shared yet.
- **Pick one workspace and task-runner setup.** npm or pnpm workspaces, Nx, or Turborepo. The specific tool matters less than using it consistently.

Notice that each rule is a clarity rule.

They exist so that anyone can answer "where does this belong?" without needing another meeting.

## Lesson 3: Boundaries beat folders

Modular NestJS made this easier.

Each module owns its controllers, services, and data access, and exposes a deliberately small surface to the rest of the application.

The same thinking applies one level up: six services only help if each one can be understood, tested, and deployed without reading the other five.

A useful test I kept coming back to:

Could a new engineer fix a bug in this module after reading only this module?

If not, the boundary is leaking.

## Lesson 4: Your public SDK is the one thing you cannot refactor freely

Everything inside the monorepo can change in a single commit.

The React SDK published on npm cannot, because other people's production applications depend on it.

Maintaining it taught me to treat a published package differently from internal code:

- Follow semantic versioning strictly. A breaking change is a major version, even when it feels small.
- Keep the SDK's surface area minimal. Every exported function is a promise.
- Version the SDK and API contract together in your head.
- Deprecate before removing, and communicate changes in the changelog.
- Test compatibility between the API and SDK before releasing changes.

The monorepo helps here because contract tests between the API and SDK can live in the same repository and fail in CI before anyone upgrades.

## Lesson 5: CI is your third engineer

With two people, nobody has time to be the human build server.

CI had to do the repetitive checking so that review time could go to judgment calls.

What mattered most:

- **Fast feedback.** If CI takes long enough that you switch tasks, you lose the benefit and the clarity along with it.
- **Tests where the risk lives.** Tenant isolation, billing logic, and webhook handling deserve far more coverage than a settings page.
- **Style handled by machines.** Linters and formatters settle formatting so reviews are about behaviour.
- **A pull request checklist.** Is this tenant-scoped? Does the query have an index? Is the handler idempotent? Is there a migration?

Coverage percentages are vanity; coverage of money and data boundaries is not.

## Lesson 6: Multi-tenancy is a constraint you design in on day one

Multi-tenancy means every query, job, and log line has to know whose data it is touching.

Retrofitting that is painful, so I treated tenant scoping as a rule of the architecture rather than a feature.

- **Scope at the lowest layer.** Put the tenant filter where data is accessed, so a forgotten check in a controller cannot leak data.
- **Index for the tenant first.** On MongoDB, aggregation pipelines should filter early so indexes can do the work.
- **Isolate the heavy paths.** One tenant's enormous import should not slow down or contaminate another tenant's work.

Here is an illustrative pattern, not code from the repository:

```javascript
db.imports.aggregate([
  {
    $match: {
      tenantId,
      status: "processed",
      createdAt: { $gte: since }
    }
  },
  {
    $group: {
      _id: "$templateId",
      total: { $sum: 1 }
    }
  }
]);
```

Security and compliance fell out of the same mindset.

Encrypted data handling, audit logging, and cryptographically signed webhooks are the kind of controls that SOC 2 and GDPR/DPDP conversations ask about.

I'd call this compliance readiness, not certification.

Building those controls in early is far cheaper than bolting them on when a large customer asks for them.

## Lesson 7: Performance work is mostly measurement

Taking p95 latency from 820ms to 180ms was not one clever trick.

It was a sequence of unglamorous steps, and the order mattered:

- **Measure percentiles, not averages.** The average hides the slow requests that users actually complain about.
- **Fix the queries first.** Missing indexes and N+1 patterns are common and relatively cheap wins.
- **Cache what is hot and stable.** Active subscription data is read constantly and changes rarely, so Redis was an easy fit.
- **Move slow work off the request path.** If the user does not need the result immediately, a worker should do it.

This is clarity applied to performance.

"Make it faster" is a fog.

"Bring p95 on this endpoint under 200ms" is something you can actually work towards.

The caching lesson I would underline:

A cache is only as correct as its invalidation.

The code path that changes a subscription must also update or clear the cached value, or users will see stale entitlements.

## Lesson 8: Async is where small teams get leverage, and pain

Queues let two people build things that would otherwise need a bigger team: slow imports, retries, and fan-out to downstream systems.

But each tool solves a different problem, and mixing them up is a classic source of mystery bugs.

| Problem | Tool | Why |
|---|---|---|
| Hand data between services and route it to the right destination | RabbitMQ | Durable messaging that decouples producers and consumers |
| Background jobs with retries, backoff, and concurrency control | BullMQ | Redis-backed job orchestration |
| CPU-heavy data transformation | Node.js Worker Threads | Keeps the event loop free |
| Hot, rarely changing reads | Redis cache | Removes repeated database lookups |
| Multi-tenant analytical queries | MongoDB aggregation pipelines | Pushes work to the database |

A rule of thumb I like:

I/O-bound work gets async, CPU-bound work gets threads, and anything crossing a service boundary that must not be lost gets a broker.

Combining BullMQ for orchestration with Worker Threads for parallel execution gave me both control over the job lifecycle and real parallelism for transformations.

The habits that keep async sane:

- Idempotent consumers.
- Dead-letter queues for poison messages.
- Logs carrying correlation IDs across services.
- Retries with sensible backoff.
- Monitoring queue depth and processing failures.

## Lesson 9: Money code deserves paranoia

I built payment APIs with NestJS and TypeORM and integrated Stripe, Paystack, and Paytm.

This included webhooks handling 100+ monthly transactions, cron-driven recurring billing, and usage-based overage charges for 1,000+ users.

The lessons:

- **Webhooks are the source of truth, not the browser redirect.** Users close tabs. Gateways retry. Design for both.
- **Verify, deduplicate, then process.** Check the signature, record the event ID, and ignore repeats.
- **Hide gateway differences behind one internal interface.** But keep escape hatches because each gateway has its own quirks.
- **Make billing runs safe to repeat.** Cron jobs can fire twice or be restarted mid-run. Use locks or idempotency keys.
- **Know which environment you're in.** With payment gateways, test keys and live keys can look alike. Clearly named environments matter most here.

An illustrative webhook handler pattern:

```typescript
async handleWebhook(rawBody: Buffer, signature: string) {
  verifySignature(rawBody, signature);

  const event = JSON.parse(rawBody.toString());

  const firstTime = await events.insertIfNew(
    event.id,
    rawBody
  );

  if (!firstTime) return;

  await process(event);
}
```

## Lesson 10: 99.99% uptime without an ops team

Four nines allows roughly 52 minutes of downtime per year, so there is almost no room for heroics.

With no dedicated operations people, the strategy had to be mostly about not creating incidents:

- **Boring technology.** Mature tools with known failure modes beat clever ones.
- **Queues as shock absorbers.** Traffic spikes or slow downstream services should delay work, not drop requests.
- **Health checks and alerts on symptoms.** Monitor error rate, latency, and queue depth.
- **Small, frequent releases.** They are easier to roll back.
- **A short runbook.** Document incidents so the second time is faster than the first.

Uptime numbers also depend on how you measure them, so define the endpoints and measurement period before quoting them.

## Lesson 11: Working next to a tech genius

Being one of two engineers beside someone far stronger is one of the best learning environments I have experienced.

It is also a trap if you handle it badly.

What worked for me:

- **Bring a recommendation, not just a question.** "Here are two options and the trade-offs. I lean toward A."
- **Ask why, not only what.** The reasoning behind a decision is what transfers to the next problem.
- **Disagree with evidence.** Query plans, benchmarks, and logs end debates faster than opinions.
- **Treat code review as a curriculum.** Track recurring comments and fix the habit at its source.
- **Take the scolding as information.** When he corrected me, it was almost never just about the thing itself. It was about the habit underneath, usually a lack of clarity.
- **Write decisions down.** A short note on why we chose something keeps knowledge out of one person's head.
- **Do not let yourself become dependent.** A team of two has a bus factor of two. The goal is that either of us can run the system independently.

One thing that made this mentorship particularly meaningful was that he didn't just want me to complete tasks. He wanted me to develop the ability to think, make decisions, and eventually handle things independently.

That distinction changed how I looked at learning.

## Lesson 12: Stakeholder communication is clarity pointed outward

Another thing my manager taught me was how to talk to stakeholders.

I worked directly with offshore clients through regular calls, production issue triage, and product discussions.

Technical skill alone does not get you through that.

Clients and managers do not want to hear about your stack trace. They want to know what is happening, how it affects them, and what happens next.

The principles I took from it:

1. **Lead with the conclusion.**

   Start with status, impact, and next step. Put the technical details underneath for anyone who wants them.

2. **Translate to impact.**

   "p95 latency dropped from 820ms to 180ms" is true.

   "Nearly every request now feels instant" is what a non-technical stakeholder remembers.

3. **Separate what you know from what you don't.**

   Say what is confirmed, what is a guess, and when you will know more.

4. **Deliver bad news early, with a plan.**

   A problem reported before the deadline is a risk. The same problem reported after is a surprise.

5. **One message, one ask.**

   If a message contains five questions, you will probably get an answer to one.

6. **Say no with options.**

   Instead of "we can't do that," offer trade-offs involving scope, time, or risk.

7. **Write it down after the call.**

   Decisions, owners, and dates should be sent the same day.

8. **Ask what job they are trying to get done.**

   Before debating a feature, understand the actual problem.

For production incidents, I kept a short template:

```text
Status: Investigating / Mitigated / Resolved

Impact: Who is affected and how?

What we know: Confirmed facts only.

What we don't know yet: Open questions.

What we're doing: Current action and owner.

Next update: A specific time.
```

My triage order was always the same:

Reproduce → Assess severity → Mitigate → Find the root cause → Write it up.

Look at how closely this mirrors Lesson 1.

A clear workspace, a clear mind, and a clear message all serve the same goal: leave no room for confusion.

## Lesson 13: Reviewing 150+ pull requests and onboarding engineers

Review volume only works if pull requests are small and standards are explicit.

For onboarding, the goal was that a new engineer could become productive without asking me about every step.

What helped:

- One-command local setup with seed data.
- A short architecture map per service.
- A pull request template carrying the checklist from Lesson 5.
- A real first task, with pairing on the first pull request.
- Clear documentation about environments and deployment.
- Teaching newcomers to understand the system instead of blindly following instructions.

Because Impler is open source, those same docs doubled as contributor documentation.

Good onboarding and good open-source hygiene turned out to be the same work.

## Lesson 14: Build what people actually use

Integrating Amplitude event tracking and heatmap analytics gave visibility into funnels, feature adoption, and interaction patterns across 1,000+ monthly active users.

A few things I learned:

- Define the event taxonomy first. Messy event names make data useless.
- Look at funnels and behaviour patterns. Avoid overinterpreting tiny statistical differences.
- Keep tenant data out of analytics. This ties directly back to the compliance mindset.
- Use data to remove features as well as add them.

Building a feature is only half the job.

Understanding whether people actually use it is the other half.

## Lesson 15: A mentor, an opportunity, and a lesson I'll carry forward

Beyond all the technical lessons, one of the things I will always be grateful for is the opportunity to work alongside someone who genuinely wanted to see me grow.

He once told me something that I will probably remember throughout my career:

> "Just like a father teaches his child how to walk, I will teach you how to walk. But eventually, you have to run by yourself."

That statement meant more to me than just motivation.

It reminded me that a good mentor doesn't simply teach you how to solve today's problems. A good mentor prepares you to face tomorrow's challenges independently.

He taught me, corrected me, challenged my thinking, and pushed me to become more responsible for my decisions.

I was also honoured to receive the "Bright Beginner" award, which made this journey even more special.

It was encouraging to know that my efforts, learning, and contributions were being recognised.

Read my Bright Beginner award announcement on LinkedIn.

Another moment that stayed with me happened during one of our monthly organizational meetings, where developers came together to discuss progress and share company updates.

During the meeting, our CEO appreciated the team's efforts and highlighted something remarkable:

Without a dedicated sales team, we had managed to bring in 12+ new clients in just one week.

Hearing that made me realise how much impact a small, focused, and dedicated team can create when everyone works towards the same vision.

It was not just about the number of clients. It was about seeing what a team can accomplish through collective effort, ownership, trust, and dedication.

These experiences taught me that a workplace is not just about writing code, completing tickets, or delivering features.

It is also about:

- The people around you.
- The culture they create.
- The trust they place in you.
- The knowledge they share.
- The opportunities they provide.
- The way they encourage you to grow beyond your current capabilities.

I sincerely hope and pray that I continue to find such companies, mentors, and talented tech colleagues throughout my career.

People who challenge me, support me, share their knowledge, and inspire me to become better every day.

People who don't just help me become a better developer, but also a better professional and human being.

Because at the end of the day, we don't just remember the projects we worked on. We remember the people who helped us become who we are.

## What I would put in place from day one

If I were starting again tomorrow, I would introduce these practices much earlier:

- Distributed tracing with correlation IDs across all services.
- Short architecture decision records for every non-obvious choice.
- Contract tests between the API and public SDK.
- Load tests for the heaviest import path.
- Restore drills for backups, not just backups.
- Feature flags around risky billing changes.
- A written definition of done on every task before starting.
- Postman environments with production visibly different from everything else.
- Better onboarding documentation.
- Consistent knowledge sharing and written technical decisions.

## A checklist for anyone running a monorepo with a tiny team

- Before each task, write the goal and finish line in two sentences.
- Close everything you don't need: windows, tabs, Postman requests, terminals, and notifications.
- Name your environments clearly and make production impossible to confuse.
- Enforce one-way dependencies between apps and shared packages.
- Keep shared packages small and free of business logic.
- Treat every published package as a public promise.
- Make CI fast, and put the strictest tests around money and tenant boundaries.
- Scope tenants at the data layer, not just the controller.
- Measure percentiles, fix queries first, and design cache invalidation before the cache.
- Match the tool to the problem: broker, job queue, thread, or cache.
- Make every webhook handler and billing job safe to run twice.
- Communicate with stakeholders conclusion first, impact first, and bad news early.
- Write down decisions, runbooks, and meeting outcomes.
- Learn aggressively from the strongest person you work with.
- Appreciate the people who help you grow, but always work towards becoming independent.

## The bottom line

Running a production monorepo as one of two engineers taught me that scale is not always the hardest part.

Clarity is.

A clear screen, a clear task, a clear boundary, and a clear message are what allow two people to carry a system that might otherwise look like it needs ten.

Without them, even the smallest problem turns into an afternoon of fog.

Working beside someone far better than me taught me two skills I did not expect to learn from a backend job: how to keep my own head and workspace uncluttered, and how to explain technical reality to people who do not necessarily care about the technology.

It also taught me something bigger: technical growth becomes much more meaningful when you are surrounded by people who genuinely want to see you succeed.

I started this journey thinking mostly about becoming a better backend developer.

I am moving forward with a much broader understanding of what that means: taking ownership, communicating clearly, thinking independently, helping others grow, and never stopping the learning process.

With clarity, you can move mountains. Without it, you cannot even kill a mouse.

And with the right people beside you, you might just learn how to run after someone has taught you how to walk.
