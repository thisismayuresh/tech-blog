---
title: Kubernetes Architecture Explained Properly (Why It Exists, How It Thinks, What Runs Where)
date: 2026-11-19
cover: assets/k8s-control-plane.svg
description: A long, plain-English tour of Kubernetes — the pain that created it, the four control-plane pieces, nodes and pods, the full request flow, and when you should (and should not) use it.
tags: kubernetes, architecture, devops
---

Most Kubernetes articles are either a wall of acronyms or a toy example that falls apart the moment you try to run a real service. This one tries to do neither.

We will go slowly. We will use plain words first and official names second. And we will keep coming back to one question:

> **What problem is this box solving?**

If you can answer that for every piece of Kubernetes, you understand the architecture. Everything else is syntax you can look up.

---

## Why Kubernetes exists at all (the STAR story)

Before we open the hood, it helps to feel the pain that created the machine. Use the STAR frame — **Situation, Task, Action, Result** — because that is exactly how Kubernetes was born.

### Situation — the world before orchestration

Imagine you run a team that ships a web app. In the early days you have two servers. One runs the app. One runs the database. Life is simple.

Then the app gets popular. You need:

- more app servers so one machine does not melt
- a staging environment that matches production
- automatic restarts when something crashes at 3 a.m.
- a way to roll out version 2 without downtime
- consistent config across every machine

So you write shell scripts. You SSH into boxes by hand. You keep a wiki page called “deploy runbook (DO NOT EDIT — ask Dave).”

**Dave goes on holiday.** A node dies. Nobody knows which script still works. Staging is three versions behind production. A deploy takes forty-five minutes and a prayer.

This was the real world for a long time. Containers (Docker) solved the “it works on my machine” packaging problem, but they did **not** solve the “which machine runs this, and what happens when that machine dies?” problem.

### Task — what the industry actually needed

Teams did not need another packaging tool. They needed a **system that could answer these questions continuously**:

1. Which processes should be running right now?
2. Where should they run (which machine has room)?
3. What if a machine or process dies — who notices?
4. How do I change the desired state safely, with rollback?
5. How do different services find each other when IPs change?

In other words: not “how do I start a container,” but **“how do I keep a desired state true over time, across many machines, without a human babysitting it.”**

### Action — what Kubernetes does about it

Kubernetes (often shortened to **K8s**) is an open-source system that treats **desired state as data**.

You write a short file: “I want 3 copies of this app, using this image, with this much memory.” You hand that file to Kubernetes. From then on, Kubernetes runs a permanent loop:

- Look at what **should** exist (the file you declared).
- Look at what **actually** exists (the running containers).
- If they differ, **change reality until they match.**

That loop has a name: **reconciliation**. It is the single most important idea in the whole system. Kubernetes is not a launcher. It is a **reconciler**.

Under the hood it gives you:

- an **API** everything talks through (one front door)
- a **store** for desired state (`etcd`)
- a **scheduler** that picks machines
- **controllers** that notice drift and fix it
- **nodes** that actually run your containers
- a vocabulary of objects (`Pod`, `Deployment`, `Service`, …) that describe what you want

### Result — what you get when it works

When Kubernetes is doing its job, you get:

| Before (manual world) | After (Kubernetes world) |
| --- | --- |
| “Is the app up?” — check 5 servers | The cluster keeps reconciling; crashes get replaced |
| Deploy = SSH + scripts + luck | Deploy = change a file, apply, watch rollout |
| New machine takes a day | New node joins, work gets scheduled onto it |
| Config lives in Dave’s head | Config lives in YAML in git |
| Scaling = panic | Scaling = change `replicas: 3` → `replicas: 10` |

The tradeoff: you now have a **platform to learn**. Kubernetes is not free complexity. It is a trade of *operational toil* for *a learning curve and a control plane to run*. For a single hobby server, it is overkill. For a team running many services across many machines, it pays for itself.

**That is the “why.”** The rest of this post is the “how.”

---

## The big picture: one brain, many muscles

![Control plane versus worker nodes](assets/k8s-control-plane.svg)

Every Kubernetes cluster has two halves. You can understand 80% of architecture diagrams by labeling which half a box lives in.

### The control plane (the brain)

The control plane stores what **should** exist and makes decisions. It does **not** run your business application containers (in normal setups). It runs the machinery of the cluster itself:

- accepting your commands
- remembering desired state
- choosing where things go
- noticing when reality drifts

If the control plane is down, you cannot change the cluster — and existing workloads usually keep running for a while, because the nodes already know their job. Think of it as: **the manager is on vacation; the factory keeps its current shift.**

### Worker nodes (the muscles)

Worker nodes are the machines (virtual or physical) where **your** pods actually run. Each node has small agents that take orders from the control plane and keep containers alive.

You talk to the brain. The brain tells the muscles what to do. Your app never needs to know the muscles exist — that indirection is what lets you replace a machine without rewriting the app.

### A note on words

| Word | Plain meaning |
| --- | --- |
| **Cluster** | The whole thing: control plane + nodes working together |
| **Node** | One machine in the cluster |
| **Control plane** | The brain components (usually on their own machines) |
| **Worker node** | A machine that runs your pods |
| **Pod** | The smallest unit you schedule; a wrapper around one or more containers |
| **Container** | An isolated process (Docker/containerd) with its own filesystem and network view |

If someone says “we scheduled a pod on a node,” they mean: “the brain decided a box of containers should live on that machine, and that machine’s foreman started it.”

---

## Inside the control plane: four pieces, no more

You can build a working mental model of the control plane with exactly four components. Official production setups split them across machines and add a few helpers (cloud controller managers, controllers for this and that), but the core four are what interview questions and design docs care about.

![Control plane components](assets/k8s-control-plane.svg)

### 1. API Server — the only front door

**Job:** accept every request, authenticate it, authorize it, validate it, and write the result to the store.

Nothing in Kubernetes talks to anything else without going through the API Server:

- your `kubectl` command → API Server
- the scheduler → API Server
- controllers → API Server
- kubelet on each node → API Server

**Why one door?** Because one door means:

- one place to check identity (“who are you?”)
- one place to enforce policy (“may you create pods?”)
- one place to log (“what changed, when, by whom?”)
- one place to validate (“is this YAML even legal?”)

If components could poke `etcd` or each other directly, you would get a spider web of trust and no single audit trail. Kubernetes chose **centralization at the API** on purpose.

**Plain analogy:** the front desk of a hospital. You do not walk into the operating room yourself; you check in, get verified, and someone routes you.

### 2. etcd — the notebook

**Job:** a consistent key-value store that holds the **desired state** of the cluster — and usually the observed status too.

Everything Kubernetes “knows” lives in etcd:

- this Deployment wants 3 replicas
- this Secret holds this value
- this Pod exists on node A and is Ready
- this Node has 4 CPUs and 8 GB free

**Critical mindset shift:** Kubernetes does not keep your app’s truth in a mystery database. It keeps **declarations** in etcd. If it is not in etcd (from the API’s point of view), it does not exist.

**Plain analogy:** the notebook on the front desk. The desk may be busy, but if a fact is not written down, the hospital does not treat it as real.

**Operational reality:** etcd is small but precious. Back it up. Do not put it on the same flaky disk as your experiments. Most managed Kubernetes (EKS, GKE, AKS) runs etcd for you so you never touch it — and that is a large part of what you pay for.

### 3. Scheduler — the placement decider

**Job:** when a new pod needs a home, pick a node.

The scheduler does not start containers. It only **assigns** pods to nodes. Its logic in plain steps:

1. Watch for pods that have no node assigned yet (“unschedulable” in the pending sense — not the taint sense).
2. Filter out nodes that cannot fit the request (not enough CPU/memory, wrong architecture, node under maintenance, rules called node selectors / affinity).
3. Score the remaining nodes (where is there spare room? where is data locality better? where is there less cost?).
4. Pick a winner and write “pod X → node Y” back through the API Server.

**Plain analogy:** a seating coordinator at a conference. The keynote does not care which chair; the coordinator finds a chair with a free seat and an open power outlet.

**What the scheduler does *not* do:** restart crashed pods, expose services, or store secrets. Those are other jobs. Keeping jobs separate is why the architecture stays understandable.

### 4. Controller Manager — the babysitters (plural)

**Job:** run the control loops that compare *what should be* with *what is*, and fix the difference.

Despite the singular name, the Controller Manager is a **process that hosts many controllers**. Important ones:

| Controller | What it watches | What it does when reality lags |
| --- | --- | --- |
| **Deployment controller** | Deployments vs ReplicaSets vs Pods | Creates/updates ReplicaSets to match `replicas` |
| **ReplicaSet controller** | Desired pod count vs actual | Starts extra pods, deletes extras |
| **Node controller** | Node health (heartbeats) | Marks nodes NotReady, reschedules pods (with care) |
| **Job controller** | Jobs that should finish | Creates pods until the job’s completions are met |

The pattern is always the same:

```text
desired = read from API/etcd
actual   = observe the world
if desired != actual:
    take action to close the gap
else:
    do nothing (sleep and watch again)
```

**That is reconciliation.** You will hear the word constantly in Kubernetes discussions, because it is the heartbeat of the system.

**Plain analogy:** a restaurant manager who keeps walking the floor: plates empty? seat more guests. Kitchen backed up? slow the host stand. The manager does not cook the food; they keep the restaurant matching the plan for the night.

---

## Inside a worker node: three moving parts

![Node anatomy: pods, kubelet, runtime, kube-proxy](assets/k8s-pod-lifecycle.svg)

A worker node looks busy, but only three pieces of plumbing really matter for architecture conversations.

### kubelet — the node’s foreman

**Job:** talk to the API Server, learn which pods should run **on this node**, and make that true using the container runtime.

In practice kubelet:

- registers the node with the API Server
- watches for pods assigned to this node
- asks the runtime to start/stop containers
- reports status back (running? ready? restart count?)
- runs health checks (**liveness** and **readiness** probes) and restarts things that fail them

If the control plane is the manager at headquarters, **kubelet is the site supervisor**. Headquarters says “three web pods here.” The supervisor starts them and reports progress.

### Container runtime — the engine

**Job:** actually create and run containers.

Kubernetes defines a standard interface (CRI — Container Runtime Interface). Common runtimes:

- **containerd** — the mainstream default today
- **CRI-O** — common in OpenShift/RHEL worlds
- **Docker** — historical; modern Kubernetes removed dockershim; people still say “Docker” out of habit

You can think of the runtime as the **engine** in the car. kubelet is the driver following directions; the engine does the low-level work of isolating processes, mounting filesystems, and wiring networks.

### kube-proxy — the doorman (and its modern replacements)

**Job:** make **Services** work — give a stable network name/IP that forwards traffic to whichever pods currently back it.

Classic modes:

- **iptables mode** — install rules so traffic to a Service IP gets DNAT’d to pod IPs
- **IPVS mode** — same idea, better at large scale (load balancing in kernel)
- newer **eBPF-based** data planes (Cilium, etc.) — do this smarter in the kernel

**Plain analogy:** a hotel switchboard. You call “Housekeeping” (the Service). You do not need to know which room (pod) is free this minute; the switchboard forwards you.

> CNI plugins (pod networking) and kube-proxy are related but not identical: CNI gives each pod an IP and connects nodes; kube-proxy / the data plane makes Services routable. Interviewers love this distinction.

---

## Pods: the unit of scheduling (not containers)

Here is a fact that confuses almost everyone at first:

> **Kubernetes schedules pods, not containers.**

A **pod** is a small wrapper around one or more containers that:

- share the same network namespace (same IP, same `localhost`)
- can share storage volumes
- are always scheduled together on the same node
- are treated as one unit for start/stop/replace

### When one container is enough (the common case)

Most of the time: one pod, one container. A web server. A worker process. A cron job container. Simple.

### When several containers share a pod

Use multiple containers in one pod only when they **must** live together:

- a main app + a log shipper that must read the same files
- a web app + a sidecar that refreshes a TLS certificate
- a worker + a small proxy that fronts it on localhost

**Rule of thumb:** if two processes could run on different machines and still work, they are probably **two pods**, not one pod with two containers. Pods are for tight coupling, not convenience grouping.

### Lifecycle in plain language

1. API Server accepts the pod definition → stored in etcd.
2. Scheduler assigns a node.
3. kubelet on that node sees the assignment.
4. Runtime starts the containers.
5. Readiness probes pass → pod becomes **Ready** (eligible for Service traffic).
6. Something crashes → kubelet restarts the failed container (restart policy).
7. Node dies → higher-level controllers (Deployment, etc.) create replacements elsewhere.

Pods are **disposable**. Treat them like cattle, not pets. If you SSH into a pod and “fix” it by hand, your fix evaporates the next restart — and Kubernetes may have already replaced it.

---

## The full request flow: `kubectl apply`

![Request flow from kubectl apply to a running pod](assets/k8s-request-flow.svg)

Let’s walk through the most common story in Kubernetes: you run a deploy.

```text
kubectl apply -f deploy.yaml
```

### Step 1 — kubectl is just a client

`kubectl` is **not** magic and **not** part of the brain. It:

- reads your YAML
- turns it into a JSON API request
- sends HTTPS to the API Server
- prints the response

You could replace `kubectl` with `curl` and a lot of patience. Other tools (Flux, Argo CD, Helm, custom controllers) are also just API clients. **Everything is an API client.**

### Step 2 — API Server validates and persists

The API Server:

1. Authenticates you (certificate, token, cloud identity…).
2. Authorizes the action (RBAC: may you create Deployments in this namespace?).
3. Validates the schema (is this a legal Deployment?).
4. Optionally mutates it (defaulting, admission webhooks).
5. Writes the object to **etcd**.

Now desired state is durable. Even if everything else restarts, the notebook remembers.

### Step 3 — controllers notice work to do

A Deployment object exists → the **Deployment controller** creates/updates a **ReplicaSet** → the ReplicaSet controller wants N pods → pod objects appear with **no node assigned**.

### Step 4 — scheduler places the pods

The scheduler filters and scores nodes, then binds each pod to a node via the API.

### Step 5 — kubelet makes it real

The kubelet on the chosen node sees “pod assigned to me,” asks the runtime to pull the image (if needed), starts containers, runs probes.

### Step 6 — status flows back

Kubelet writes pod status to the API. Ready endpoints appear for Services. Load balancers (if any) update. Humans watching `kubectl get pods` see `Running` / `3/3 Ready`.

### And then… nothing stops

Controllers keep comparing desired vs actual forever. Node dies → Node controller notices → higher-level controllers reschedule pods onto healthy nodes. Image registry blips → crash loops → kubelet retries with backoff.

**This is why “it works on my laptop” is incomplete.** On a laptop, starting a process is enough. In Kubernetes, **starting is easy; keeping desired state true is the product.**

---

## Core objects you will actually use

Kubernetes has a large API surface. In practice, a small set covers most daily work:

| Object | One-line job | You touch it when… |
| --- | --- | --- |
| **Pod** | One runnable unit | Rarely directly; usually via Deployment |
| **Deployment** | Manages ReplicaSets; rolling updates, rollback | Almost every app deploy |
| **ReplicaSet** | Keeps N identical pods alive | Mostly created for you by Deployment |
| **Service** | Stable name + virtual IP for a set of pods | When something must call your app |
| **Ingress** | HTTP(S) routing into the cluster | Exposing web apps to the internet |
| **ConfigMap** | Non-secret config data | Environment variables, config files |
| **Secret** | Sensitive data (base64, not magic encryption) | Passwords, tokens, certs (use real encryption too) |
| **Namespace** | A folder inside the cluster | Multi-team / multi-env separation |
| **StatefulSet** | Pods with stable identity + storage | Databases, Kafka, things that hate being random |
| **DaemonSet** | One pod per node | Log agents, node exporters, CNI helpers |
| **Job / CronJob** | Run to completion / on a schedule | Batch work, migrations, nightly reports |

### Deployment vs ReplicaSet vs Pod (the nesting doll)

```text
Deployment
  └── ReplicaSet   (one per version during a rollout)
        └── Pod    (N identical pods)
```

- You speak **Deployment** (intent: “run 3 of v2”).
- Deployment manages **ReplicaSet** (mechanism for count + selector).
- ReplicaSet manages **Pods** (actual containers).

During a rolling update you briefly have **two** ReplicaSets: old version draining, new version starting. That is not a bug; that is how zero-downtime rollout is built from small pieces.

### Service in one paragraph

Pods are replaceable, so their IPs change constantly. You cannot hardcode `10.2.3.7` in another app’s config. A **Service** gives you a stable DNS name (`web.default.svc.cluster.local`) and IP. Endpoints (the current pod IPs) are maintained by the control plane as pods come and go. Clients talk to the Service; the data plane forwards to healthy pods.

---

## A tiny manifest, read like English

Here is a minimal Deployment you might actually apply:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
```

Read it as a sentence:

> “I want a Deployment named `web` that keeps **3 copies** of the container built from `nginx:1.27`, all labeled `app: web`, listening on port 80.”

Field by field:

| Field | Meaning |
| --- | --- |
| `kind: Deployment` | Which controller should manage this |
| `replicas: 3` | Desired count — the number the reconciler defends |
| `selector.matchLabels` | Which pods this Deployment owns (must match template labels) |
| `template` | The recipe for each pod |
| `image: nginx:1.27` | What to run — **pin versions** in real life |
| `containerPort` | Documentation + networking hint for the container |

Notice what is **missing**: hostnames, SSH steps, server IPs, “start order.” You did not tell Kubernetes *how* to run it on a machine. You told it *what should exist*. The control plane and kubelet handle the how.

---

## Namespaces: folders, not magic isolation

A **namespace** is a naming scope: `web`, `api`, `staging`, `team-a`. Same name in two namespaces = two different objects.

**What namespaces do:**

- prevent name collisions
- scope RBAC (“this user may only touch `staging`”)
- set quotas (“team A may use 8 CPUs total”)
- make `kubectl get pods -n team-a` a meaningful question

**What namespaces do *not* do by default:**

- fully isolate the network (you need NetworkPolicies for that)
- prevent noisy-neighbor CPU theft (you need ResourceQuotas + limits)
- magically separate trust boundaries between hostile tenants

**Plain analogy:** namespaces are **office room numbers**, not locked safes. Great for organization; you still need doors (policies) for security.

---

## Security in architecture terms (the minimum model)

You do not need to become a security engineer to reason about Kubernetes architecture. You need this stack:

1. **Authentication** — who is calling? (certs, tokens, cloud IAM)
2. **Authorization (RBAC)** — may they do *this* to *that object* in *that namespace*?
3. **Admission control** — policy gates on the way in (deny `:latest`, require labels, block privileged pods)
4. **Secrets handling** — store carefully; prefer real secret managers over plaintext etcd + base64
5. **NetworkPolicy** — which pods may talk to which (default-deny, then allow)
6. **Node/pod isolation** — do not run untrusted code with the kubelet’s privileges

A useful interview sentence:

> “The API Server is the policy enforcement point; RBAC answers *who*, admission webhooks answer *what is allowed to enter*, NetworkPolicies answer *who may talk to whom*, and the scheduler/kubelet only ever act on objects that already passed the front door.”

---

## When Kubernetes is the right tool (and when it is not)

### Good fit

- Many services, many environments, a team that ships daily
- You need rolling updates, self-healing, and consistent config at scale
- Multiple machines already exist and manual glue is hurting
- You want a platform for other platforms (internal developer platform, ML jobs, etc.)

### Poor fit (be honest)

- **One small app on one VPS** — a systemd unit and a reverse proxy win on simplicity
- **Learning “just to put it on your resume” with no workload** — you will forget it in three months without real traffic
- **Extremely stateful systems you barely understand** — running etcd-in-etcd for fun is how weekends die
- **Team with zero ops appetite** — managed Kubernetes still requires judgment; self-managed requires more

### The decision sentence

> Use Kubernetes when the cost of **coordinating many moving parts by hand** is higher than the cost of **learning and operating a control plane.**

That is the whole business case. Everything else is implementation detail.

---

## What to learn next (in a sane order)

Do not try to master the entire API surface in week one. A practical order:

1. **Pods, Deployments, Services** — deploy a real app, break it, watch it heal
2. **Ingress + TLS** — get traffic in from the outside
3. **ConfigMaps & Secrets** — stop baking config into images
4. **Resource requests/limits** — the difference between “scheduled” and “stable”
5. **Liveness vs readiness probes** — avoid restart storms and premature traffic
6. **StatefulSets + volumes** — when identity and storage matter
7. **RBAC + Namespaces** — multi-team reality
8. **Helm or Kustomize** — templating without giving up git as source of truth
9. **Observability** — logs, metrics, traces; you cannot reconcile what you cannot see
10. **GitOps (Argo/Flux)** — cluster state from git, not from someone’s laptop

---

## Recap — the architecture in one page

1. **Why it exists:** manual multi-server operations do not scale; desired-state reconciliation does.
2. **Two halves:** **control plane** (decides) and **worker nodes** (runs).
3. **API Server** is the only door — authn, authz, validation, audit in one place.
4. **etcd** is the notebook — desired state lives there.
5. **Scheduler** places pods; **controllers** close the gap between desired and actual.
6. **kubelet** obeys the API on each node; the **runtime** starts containers; **kube-proxy / data plane** makes Services routable.
7. **Pods** are the scheduling unit; Deployments manage ReplicaSets manage Pods.
8. **`kubectl apply`** is just an API call; the loop after that never stops.
9. **Reconciliation** is the heartbeat: *watch, compare, fix, repeat.*
10. Use it when coordination pain exceeds platform cost — not because every app needs 47 microservices.

If you remember only one sentence from this entire article, make it this one:

> **Kubernetes does not run your app. It runs a loop that keeps your app’s declared reality true — across failures, deploys, and scale — without asking you to SSH at 3 a.m.**

That is the architecture. The acronyms are just labels on that loop.
