---
title: Kubernetes Architecture in a Very Simple Way
date: 2026-11-19
cover: assets/k8s-control-plane.svg
description: Control plane, nodes, pods, and the request flow — explained with plain diagrams and almost no jargon.
---

Kubernetes has a reputation for scary diagrams. Half the posts out there start with twenty boxes and acronyms nobody defined.

Here's the whole idea in one sentence: **Kubernetes is a system that keeps asking one question — "what should be running?" — and keeps making it true.**

That's it. The architecture below only exists to answer that question reliably.

## The big picture: one brain, many muscles

![Control plane versus worker nodes](assets/k8s-control-plane.svg)

There are two halves:

- **Control plane** — the brain. It stores what *should* exist and makes decisions.
- **Worker nodes** — the muscles. Machines where your containers actually run.

You talk to the brain. The brain tells the muscles what to do. Your app never needs to know the muscles exist.

## Inside the control plane (four things, that's all)

| Component | Plain-English job |
| --- | --- |
| **API Server** | The front desk. Every command — from you, from scripts, from other components — goes through here. Nothing touches the cluster except via the API Server. |
| **etcd** | The notebook. A key-value store that holds the *desired state*: "I want 3 copies of this app." If it's not in etcd, it doesn't exist as far as K8s is concerned. |
| **Scheduler** | The placement decider. When a new pod needs a home, it picks a node with enough CPU and memory. |
| **Controller Manager** | The babysitter. Controllers watch reality, compare it to the notebook, and fix gaps (a pod died → start another). |

> **Key idea:** the control plane stores *intent*, not containers. You say "I want 3 web pods." Kubernetes figures out the rest and keeps it that way.

## Inside a worker node (three things)

![Node anatomy: pods, kubelet, runtime, kube-proxy](assets/k8s-pod-lifecycle.svg)

- **kubelet** — the node's foreman. It listens to the control plane and makes sure the pods it's responsible for are actually running.
- **Container runtime** — the engine that starts containers (`containerd`, or Docker in older setups).
- **kube-proxy** — the doorman. It routes network traffic to the right pods.

### Pods are the unit of work

You don't schedule containers — you schedule **pods**. A pod is a small wrapper around one or more containers that share the same network and disk.

- One pod, one container: the common case (a web server, a worker).
- One pod, several containers: when containers must live together (app + logging sidecar).

Think of a pod as a tiny, disposable VM that usually runs exactly one process.

## What happens when you run `kubectl apply`

![Request flow from kubectl apply to a running pod](assets/k8s-request-flow.svg)

```text
1. kubectl apply -f deploy.yaml
2.   → sends the manifest to the API Server
3.   → API Server validates it and writes desired state to etcd
4.   → Scheduler notices an unscheduled pod, picks a node
5.   → kubelet on that node starts the containers
6.   → Pod is running — controllers keep watching from here on
```

Every step goes through the API Server. That's deliberate: one front desk means one place for auth, validation, and logging.

And the loop never stops. If a node dies, controllers notice the gap between *is* and *should be* and create replacements. That continuous correction is called **reconciliation** — it's the heart of Kubernetes.

## A tiny manifest you can read

Here's the smallest useful Deployment — the thing you'd actually `kubectl apply`:

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

Read it as a sentence: *"I want a Deployment named `web` that keeps **3 copies** of the nginx container running."* The control plane handles placement, restarts, and rollouts from there.

## What to learn next

Once this picture feels solid, the natural next steps are:

- **Service** — how pods get a stable address that survives restarts
- **Ingress** — how outside traffic reaches your services
- **ConfigMaps & Secrets** — configuration without rebuilding images
- **Namespaces** — dividing one cluster into logical rooms
- **Helm / Kustomize** — templating manifests for real projects

## Recap

1. **Control plane** stores desired state; **nodes** run containers.
2. **API Server** is the only door in or out.
3. **etcd** is the notebook — if it's not written there, it doesn't exist.
4. **Pods** are the unit of scheduling, not raw containers.
5. **Controllers reconcile forever** — that's why K8s feels "alive."

You don't need to memorize every acronym. You need the loop: *describe what should be → Kubernetes makes it true → keep watching.*

That's the architecture. Everything else is detail on top of that sentence.
