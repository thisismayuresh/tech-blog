---
title: LoanPilot: How I Built an Agentic AI Loan Underwriting Platform (and Made It Safe Enough to Trust)
date: 2026-11-19
cover: assets/loanpilot-agentic-cover.jpg
description: A deep dive into LoanPilot — MCP-enabled LLM underwriting, a 12-rule business engine, Firecracker PDF sandboxes, and the evaluation loop that moved decision accuracy from 74% to 91%.
tags: ai, agents, fintech, architecture, project
---

Loan underwriting is a perfect example of a job that is **too important to ignore** and **too judgment-heavy to automate carelessly**.

Every application needs credit history checked, obligations calculated against income, internal policy applied, and a written reason for the decision. Do that by hand and you get slow, inconsistent reviews. Do it with a raw “chat with GPT and hope” wrapper and you get confident nonsense, occasional unsafe approvals, and no audit trail a compliance reviewer would accept.

**LoanPilot** is the system I built in the middle of those two failure modes: an **agentic AI underwriting platform** that uses tool calls for facts, a **hard rules engine** for policy, **sandboxed document ingestion** for untrusted PDFs, and a **human review path** for anything borderline.

This post is the long version — not a feature list, but the architecture story: what was hard, what we measured, what broke, and what the numbers actually mean.

---

## Situation: what loan review looks like without a system

### The human workflow (painful but familiar)

A loan officer receives an application package:

1. Identity and business details (forms)
2. Credit bureau data (another system)
3. Bank statements or financial PDFs (email attachments)
4. Internal policy: “max FOIR 40%,” “reject if…,” “escalate if…”
5. A memo that explains the decision to the applicant, the credit committee, or an auditor

In a small team, step 4 lives in a PDF policy binder and in senior officers’ heads. Two officers can look at the same file and disagree. Turnaround stretches. Audit questions become archaeology.

### Why “just use an LLM” fails here

A large language model is good at language tasks: summarizing, extracting structure, drafting memos. It is bad at being a **system of record** if you let it:

- invent a credit score that was never fetched
- ignore a hard policy rule because the prose sounded sympathetic
- approve something unsafe because the prompt was friendly
- process a malicious PDF that tries to escape the app

So the design question was never *“LLM or rules?”* It was:

> **How do you put an LLM inside a controlled pipeline where tools provide facts, rules provide law, and the model provides judgment and writing — with every step measured?**

### The STAR frame for the whole project

| | |
| --- | --- |
| **Situation** | Loan reviews were slow, inconsistent, and hard to audit; pure LLM demos were unsafe and unmeasured. |
| **Task** | Automate review across business workflows with cited decisions, enforce lending policy hard, isolate untrusted documents, and prove quality with evaluations — not vibes. |
| **Action** | Built LoanPilot: NestJS + PostgreSQL/pgvector + BullMQ/Redis + Next.js + Stripe + MCP tool-using agent + 12-rule engine + Firecracker PDF sandboxes + Langfuse tracing + iterative evals. |
| **Result** | **74% → 91%** decision accuracy on 80 synthetic cases (73/80) over 3 iterations; **~$0.04** and **~$18s** per application; **0 unsafe approvals**; 14 unsafe attempts blocked; **28/30 (93%)** borderline cases escalated; **7/8** prompt-injection attacks resisted. |

The rest of this post unpacks that row.

---

## Task: what the platform had to do

Written as requirements, the system needed to:

1. **Ingest applications** through a real product surface (not a notebook).
2. **Call tools** for credit lookup, EMI/FOIR math, and policy retrieval — not let the model free-type numbers.
3. **Generate a decision memo with citations** so a human can verify claims.
4. **Enforce lending policy in code** — the model cannot vote its way past a hard rule.
5. **Route borderline cases to humans** with high recall.
6. **Sandbox untrusted PDFs** so a malicious file never shares fate with the API process.
7. **Scale work off the request path** with background jobs.
8. **Measure quality** with a fixed evaluation set and cost/latency budgets.
9. **Support billing/payment plumbing** (Stripe) as part of a realistic product shape, not a toy.

Notice what is *not* on the list: “replace underwriters.” The product thesis is **acceleration + consistency + auditability**, with humans on the judgment tail.

---

## Architecture overview

![LoanPilot agent and rules flow](assets/loanpilot-agent-flow.svg)

### Stack (and why each piece is there)

| Layer | Tech | Role in plain English |
| --- | --- | --- |
| API / app logic | **NestJS, TypeScript** | Structured backend: modules, validation, clear boundaries |
| Data | **PostgreSQL + pgvector** | Application data + vector search for policy RAG |
| Async work | **BullMQ + Redis** | Queues for slow jobs (PDF ingest, heavy evaluation runs) |
| Frontend | **Next.js** | Operator-facing UI for applications and review queues |
| Payments | **Stripe** | Real product surface for plans/usage (not core to scoring) |
| Agent protocol | **MCP** | Standard way for the model to call tools with schemas |
| Observability | **Langfuse** | Traces: prompts, tool calls, outputs, timing, cost |
| Document isolation | **Firecracker microVMs** | Untrusted PDF extraction/embedding without host risk |
| Deployment | **Docker + Kubernetes** | Health probes, limits, rolling updates for API and workers |

You could rebuild pieces with fewer tools. The point of this stack is **separation of powers**:

- the **model** proposes and writes,
- **tools** own external facts,
- **rules** own policy,
- **queues** own time,
- **microVMs** own untrusted bytes,
- **humans** own exceptions.

---

## The agent: tool calls instead of vibes

### What the model is allowed to do

The underwriting agent is not asked “should we approve?” as a single leap. It runs a **tool-oriented loop** (MCP-style tool calls):

1. **Credit lookup** — fetch bureau/fact data for the applicant key.
2. **EMI / FOIR calculation** — run deterministic math on income, obligations, loan amount, tenure.
3. **Policy RAG** — retrieve relevant policy chunks from pgvector-backed search so the memo cites the *actual* internal rules.
4. **Compose a decision memo** — structured recommendation with **citations** to tool results and policy passages.

### Why tools > “just prompt it”

| Model-only behavior | With tools |
| --- | --- |
| Invents a credit score | Score comes from the credit tool response |
| Approximates FOIR in prose | FOIR is computed code, shown as numbers |
| Misquotes policy | Policy chunks returned with retrievable text |
| Unverifiable memo | Memo lines map to tool outputs / citations |

**Fact ownership** is the architectural idea: *the LLM does not get to own facts; it owns synthesis.* If the credit tool returns `720`, the memo may interpret `720`, but it may not invent `780`.

### Latency and cost as design constraints

Measured targets that shaped the loop (and held in evaluation):

- **~18 seconds** per application end-to-end (acceptable for back-office review, not for a snappy consumer chat)
- **~$0.04** per application in model spend (multiplies fast if you get this wrong at scale)

Langfuse traces make those numbers actionable: if one tool call is slow or one prompt balloons tokens, you see *which span* did it — not a vague “the AI was slow.”

---

## The 12-rule business rules engine (the part that keeps you out of the news)

The model can be helpful and still be wrong. **Policy cannot be a suggestion.**

So after (or alongside) the agent’s memo, a **deterministic rules engine** evaluates the case against **12 lending rules** implemented in code — the kind of checks underwriting systems have always had:

Examples of the *shape* of rules (illustrative of categories, not a copy of proprietary thresholds):

- minimum/maximum requested amount bands
- FOIR ceiling (obligations vs income)
- minimum credit score
- delinquency / recent default signals
- missing required document types
- income verification failures
- policy exclusions (sector, geography, product)
- duplicate application / velocity checks
- …and borderline windows that **must** escalate rather than auto-decide

### Three outcomes, not a binary

```text
rules engine
  ├─ BLOCK unsafe approval attempts   → never auto-approve
  ├─ ESCALATE borderline              → human review queue
  └─ CLEAR path                       → agent memo may finalize
```

### What the engine actually caught (evaluation)

On the **80-case synthetic evaluation set**:

| Outcome | Count / rate | Meaning |
| --- | --- | --- |
| **Unsafe approval attempts blocked** | **14** | The pipeline (model or scenario) tried to approve something policy forbids; rules stopped it |
| **Borderline escalated to human review** | **28 / 30 (93%)** | Gray-zone cases went to people, not to silent auto-decide |
| **Unsafe approvals in final outcomes** | **0 / 80** | The hard guarantee: no case that should have been blocked slipped through as approved |
| **Prompt-injection attempts resisted** | **7 / 8** | Hostile instructions embedded in inputs did not flip the safety behavior in almost all cases |

Read the 14 and the 0 together: **the model (or adversarial input) may push toward unsafe approval; the rules layer is why the system’s *output* still has zero unsafe approvals.** That is defense in depth, not prompt politeness.

The 93% escalation rate on borderline cases is intentional product behavior: **when uncertain, involve a human.** Automation’s job is to shrink the review queue’s easy 80%, not to gamble on the hard 20%.

---

## Evaluation: how accuracy went from 74% to 91%

### The setup

- **80 synthetic underwriting cases** with known correct dispositions (approve / decline / escalate, plus policy justification expectations).
- Run the full pipeline (tools + agent + rules) against the set.
- Score **decision accuracy** against ground truth.
- Track **cost** and **latency** per case alongside accuracy — a model that is right but $2 per loan is a different product.

### The iteration story (STAR within the project)

**Iteration 1 — Situation/Task:** baseline agent + loose prompting.  
**Action:** wire tools, tighten the memo format, add policy RAG grounding.  
**Result:** **~74%** accuracy. Honest baseline: better than a demo, not shippable.

**Iteration 2 — Task:** cut factual errors and policy misses.  
**Action:**  
- stricter tool schemas (required fields, units, error handling)  
- memo template that forces citations  
- prompt changes to separate *facts from tools* vs *judgment*  
- rules engine wired as a hard gate, not a “consider this” hint  

**Result:** clear jump; error taxonomy shifted from “invented numbers” to “edge-case policy nuance.”

**Iteration 3 — Task:** close the remaining gap without blowing cost/latency.  
**Action:**  
- better retrieval for policy chunks (pgvector)  
- fewer wasted tool round-trips (plan-then-call)  
- borderline calibration so escalation catches what accuracy alone would mislabel  
- regression runs on the same 80 cases after every change  

**Result:** **73/80 ≈ 91%** accuracy, still **~$0.04** and **~18s** per application.

### Why a fixed 80-case set matters

Without a frozen eval set, every prompt tweak is a coin flip. With one:

- you cannot “improve” accuracy by accidentally testing easier cases
- regressions show up immediately
- cost and accuracy are tracked **on the same axis**

The set is synthetic on purpose: real applicant data is regulated and scarce. Synthetic cases encode policy edge cases deliberately (FOIR boundaries, missing docs, injection attempts) so the failures you care about are represented.

### What 91% means (and does not mean)

**Means:** on this curated set, the system’s final disposition matched the labeled correct answer 73 times out of 80, with zero unsafe approvals in the output set.

**Does not mean:** 91% of all real-world loans can be fully lights-out approved. Production credit systems need ongoing calibration, drift monitoring, model risk management, and regulatory review. The honest claim is:

> **On a fixed, adversarial-leaning synthetic benchmark, the pipeline’s decision accuracy improved 74% → 91% over three engineering iterations while holding unit cost and latency flat — and the rules layer preserved a hard safety property (0 unsafe approvals).**

That is a result you can defend in an architecture review. “The AI feels smarter” is not.

---

## Document ingestion: why Firecracker, not `pdf-parse` in the API

Loan packages arrive as PDFs. PDFs are **untrusted input** — historically full of parser bugs, decompression bombs, and weird encodings.

### The naive design (rejected)

```text
API process
  └─ reads PDF bytes
       └─ parses and embeds in-process   ← one bug = API compromise
```

If extraction runs in the same process as your secrets, your Stripe keys, and your database credentials, **the PDF is effectively in your trust boundary.** That is a bad trade for convenience.

### The sandboxed design (built)

```text
BullMQ job
  └─ start ephemeral Firecracker microVM (~300ms)
       └─ mount document, extract text, embed
            └─ return results only
                 └─ VM destroyed · zero shared state
```

**Firecracker** is the microVM technology behind AWS Lambda’s isolation model: fast startup, small footprint, hardware-virtualized boundary stronger than a container alone.

Properties that mattered for this project:

| Property | Why it matters for LoanPilot |
| --- | --- |
| **~300ms sandbox startup** | Fast enough to stay inside job SLAs; not “spin a full VM in 30s” |
| **Complete host isolation** | A malicious PDF cannot read API env vars or Redis |
| **Zero shared state between documents** | Document A cannot leave a surprise for document B |
| **Ephemeral by default** | No long-lived “PDF parser” server to patch forever |

Extraction and embedding for untrusted files never share a process with the money path. If something explodes inside the microVM, you lose a job — not the cluster.

> Note the relationship to the Kubernetes post on this blog: containers isolate processes; microVMs raise the isolation ceiling for *hostile* workloads. LoanPilot uses both ideas in different layers — K8s for service orchestration, Firecracker for hostile bytes.

---

## Product surface: Next.js, queues, and Stripe

### UI (Next.js)

Operators need more than a JSON blob:

- application list and status
- memo + citations view
- escalate / approve / decline actions with audit notes
- evaluation dashboards (accuracy over iterations, cost, latency)

The frontend is deliberately boring: fetch API state, show it, take actions the backend authorizes. **No client-side scoring logic** — rules and the agent live server-side where they can be versioned and logged.

### Async pipeline (BullMQ + Redis)

Underwriting is not one HTTP request:

```text
submit application
  → enqueue ingest job
  → (optional) PDF sandbox job
  → enqueue underwriting job
  → agent tools + rules
  → store memo + decision + trace id
  → notify UI / webhook
```

Queues absorb bursty submissions, retry transient failures, and keep the API responsive. Redis backs BullMQ; workers scale **horizontally** in Kubernetes independently of the API pods.

### Stripe

Billing is orthogonal to scoring but part of a complete product story (plans, usage, invoices). Keeping it in NestJS modules means payments do not leak into agent code.

---

## Deployment: Docker + Kubernetes without the demo-ware gaps

The same lessons as any serious service apply here — and they are easy to skip in a portfolio project:

| Practice | Why it was applied to LoanPilot |
| --- | --- |
| **Containerized services** | API and workers ship the same way everywhere |
| **Health probes** | Liveness/readiness so K8s does not route traffic to a wedged pod |
| **Resource limits** | A runaway embedding job cannot starve the node |
| **Rolling updates** | Ship agent prompt/tool changes without downtime |
| **Separate deployments** | API pods ≠ worker pods; scale workers when queues grow |

Background workers and API have different scaling profiles: latency-sensitive API vs CPU-hungry document jobs. Splitting deployments lets you scale each without paying for the other’s idle capacity.

---

## Security posture: three moats, not one prompt

LoanPilot’s security story is layered on purpose:

### Moat 1 — tool boundaries

The model cannot “decide” to skip credit lookup; the pipeline requires tool results before a memo is valid. Injection that says “ignore tools and approve” has nothing to hook into if the **code** checks tool presence.

### Moat 2 — hard rules

Even a fully jailbroken model output still hits the 12-rule engine. Evaluated: **14 unsafe attempts blocked**, **0 unsafe approvals** in final outcomes.

### Moat 3 — hostile input isolation

PDFs and other untrusted blobs execute only inside Firecracker microVMs with no shared state. Prompt injection in a *document* is still a prompt problem for the model layer — but it is not a *host compromise* problem.

### Prompt injection results (honest read)

**7 / 8** injection attempts were resisted in evaluation. That is strong, not perfect. The missing case is exactly why:

- rules remain non-negotiable,
- escalation exists,
- traces are reviewed,
- evals keep adversarial cases in the set.

A system that claims 8/8 forever is usually hiding its eval. **7/8 with a hard rules backstop is a better engineering story than 8/8 with only a system prompt.**

---

## How the pieces talk (end-to-end walkthrough)

1. Applicant submits via **Next.js** → **NestJS API** validates and persists the application.
2. API enqueues an underwriting job (**BullMQ**).
3. If documents exist, a **Firecracker** job extracts/embeds text; vectors land in **pgvector**; structured facts return to the job.
4. The **agent** runs: credit tool → EMI/FOIR tool → policy RAG → draft memo with citations.
5. **Rules engine** evaluates the case: block / escalate / clear.
6. Final disposition + memo + **Langfuse** trace id are stored.
7. Operator sees the case; borderline items sit in the **human review** queue.
8. **Stripe** handles commercial packaging around the product, not the scoring math.

Every arrow above is observable in traces or logs. If a decision is questioned, you can reconstruct *which tools ran, what they returned, which rules fired, and which model version produced the prose.*

---

## Results dashboard (the numbers that matter)

| Metric | Result |
| --- | --- |
| Decision accuracy (80 synthetic cases) | **74% → 91%** (73/80) over **3 iterations** |
| Unsafe approvals (final) | **0 / 80** |
| Unsafe approval attempts blocked by rules | **14** |
| Borderline cases escalated to humans | **28 / 30 (93%)** |
| Prompt-injection attacks resisted | **7 / 8** |
| Cost per application | **~$0.04** |
| Latency per application | **~18s** |
| PDF sandbox startup | **~300ms** (Firecracker) |
| Shared state between untrusted docs | **None** |

### How to present this honestly

Good framing:

> “Improved decision accuracy from 74% to 91% on a fixed 80-case synthetic eval across three iterations, at ~$0.04 and ~18s per application, with zero unsafe approvals and 93% escalation recall on borderline cases.”

Bad framing (avoid):

> “The AI underwrites loans with 91% accuracy in production.”

The difference is **scope of evidence**: a benchmark + safety properties vs an unbounded claim about real portfolios. Interviewers and architects respect the first.

---

## What was hard (the real engineering)

1. **Keeping the model from owning facts.** Tool schemas, required fields, and code-side validation were more important than clever prompts.
2. **Making rules non-optional.** Early wiring let the memo “explain around” a policy miss. The fix was structural: rules gate outcomes; prose never votes alone.
3. **Evaluations that do not lie.** Fixed case IDs, frozen labels, and tracking cost/latency next to accuracy stopped moving-goalpost “improvements.”
4. **Untrusted documents.** Firecracker added moving parts (image, boot, job glue) — worth it for isolation, but ops complexity is real.
5. **Escalation calibration.** Too aggressive escalation = humans drown; too shy = borderline slips. 93% on the borderline class was a deliberate tuning target.
6. **Observability as a feature.** Langfuse traces turned “the agent did something weird” into a span you can open.

---

## What I would do next

- **Shadow mode on real applications** (decisions logged, humans decide) to measure agreement rate before any auto-decision path.
- **Drift monitors** on FOIR distributions, approval rates, and tool error rates.
- **Stronger injection battery** — target closing that 1/8 miss; keep red-team cases in CI evals.
- **Rules as data, not only code** — versioned policy objects with effective dates, still executed deterministically.
- **Cost budgets per tenant** — hard spend caps tied to Stripe plans.
- **Calibration reports** for compliance: confusion matrices by segment, escalation reasons histogram.

The roadmap stays inside the same thesis: **more measurement, more hard gates, more isolation — not more freedom for the model.**

---

## Lessons that transfer beyond lending

1. **Agentic systems are pipelines, not oracles.** Tools, rules, queues, and humans are first-class architecture.
2. **Put facts in code and tools; put language in the model.** Citations make memos reviewable.
3. **Safety properties beat average accuracy.** 0 unsafe approvals is a different claim than 91% — you need both.
4. **Evaluate on a frozen set** or you are only measuring mood.
5. **Untrusted bytes get their own machine boundary** (microVM), not a polite `try/catch`.
6. **Cost and latency are product requirements** for LLM features (~$0.04 / ~18s is a design outcome, not an accident).
7. **Escalate on purpose.** 93% borderline-to-human is the system working, not failing to automate.

---

## Recap (STAR, one more time)

- **Situation:** underwriting needs consistency, speed, and audit trails; naive LLM automation is unsafe and unmeasured.
- **Task:** build an agentic review platform that uses tools for facts, enforces policy in code, isolates PDFs, and proves quality with evals.
- **Action:** shipped LoanPilot — NestJS + Postgres/pgvector + BullMQ/Redis + Next.js + Stripe + MCP agent + 12-rule engine + Firecracker sandboxes + Langfuse + Docker/Kubernetes — and iterated three times on a fixed 80-case benchmark.
- **Result:** **74% → 91%** accuracy, **~$0.04 / ~18s** per application, **0 unsafe approvals**, **14** unsafe attempts blocked, **93%** borderline escalated, **7/8** injections resisted, **~300ms** sandbox startup with **zero** shared document state.

The goal was never “AI replaces the credit officer.” The goal was a system where **the model can be useful without being trusted blindly** — and where every number in a memo can be traced back to a tool, a rule, or a human.

That is LoanPilot.
