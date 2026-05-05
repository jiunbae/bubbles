<div align="center">

# 🫧 Bubbles

### A multiplayer bubble-blowing community

**Create places. Blow bubbles. Pop together.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-r173-000000?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Hono](https://img.shields.io/badge/Hono-4-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![Bun](https://img.shields.io/badge/Bun-runtime-F9F1E1?logo=bun&logoColor=black)](https://bun.sh/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

</div>

---

## What is Bubbles?

Inspired by [damta.world](https://www.damta.world/) — if smokers get a cigarette break (담타), non-smokers deserve a bubble break.

Bubbles is a real-time multiplayer web app where people gather in virtual **places** to blow and pop bubbles together. No signup, no rules, just open a link and blow bubbles. A chill, interactive community space with beautiful 3D visuals powered by custom GLSL shaders.

### Highlights

- **Real-time multiplayer** — WebSocket-powered bubble blowing & popping with live cursor tracking
- **Deterministic physics** — Seeded PRNG + server timestamps ensure all clients see identical bubble motion
- **3D bubble rendering** — Custom GLSL shaders with postprocessing effects via React Three Fiber
- **Community places** — Create themed spaces (Rooftop, Park, Alley) for people to hang out in
- **Multiple bubble styles** — 3 sizes (S/M/L), 8 colors, 4 patterns (plain, spiral, dots, star)
- **Dynamic lifespans** — Bubbles float and expire naturally (6s–30s based on size)
- **Visual & Stealth modes** — Switch between full 3D rendering and a spreadsheet-style disguise (`Ctrl+Shift+M`)
- **Bubble break timer** — 1/3/5 minute break timer to step away and blow some bubbles
- **i18n** — English and Korean language support
- **Zero-downtime deploys** — Rolling updates with graceful WebSocket draining

---

## Architecture

```
bubbles/
├── apps/
│   ├── server/        # Hono + Bun API & WebSocket server
│   └── web/           # React 19 + Three.js SPA
├── packages/
│   └── shared/        # Shared types, constants & WS message schemas
├── docker-compose.yml
└── turbo.json         # Turborepo build orchestration
```

| Layer | Stack |
|-------|-------|
| **Frontend** | React 19, React Router 7, Three.js + R3F, Zustand, Tailwind CSS, Vite |
| **Backend** | Hono, Bun, WebSockets, JWT auth |
| **State** | Redis 7 (pub/sub + room state for multi-pod sync) |
| **Database** | MongoDB 7 (places, logs) |
| **Infra** | Kubernetes (ArgoCD), Nginx, Cloudflare Tunnel, Prometheus + Grafana |

### Multi-Pod Architecture

```
                    ┌─────────────┐
                    │   Ingress   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Server-1 │ │ Server-2 │ │   Web    │
        │ (Hono)   │ │ (Hono)   │ │ (Nginx)  │
        └────┬─────┘ └────┬─────┘ └──────────┘
             │             │
             └──────┬──────┘
                    ▼
             ┌─────────────┐
             │    Redis     │◄── Pub/Sub + Room State
             └─────────────┘
                    │
             ┌─────────────┐
             │   MongoDB    │◄── Places, Logs
             └─────────────┘
```

Server pods share state via Redis:
- **Pub/Sub**: Cross-pod WebSocket message relay (bubble events, user join/leave)
- **Hash maps**: Room members and active bubbles (survives individual pod restarts)
- **Graceful shutdown**: SIGTERM → close WS with code 1012 → clients auto-reconnect to healthy pod

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- Or: [pnpm](https://pnpm.io/) + [Bun](https://bun.sh/) for local dev

### Run with Docker

```bash
git clone <repo-url> && cd bubbles
cp .env.example .env   # configure your secrets

docker compose up
```

| Service | URL |
|---------|-----|
| Web | `http://localhost:8080` |
| API | `http://localhost:3002` |
| MongoDB | `localhost:27017` |

### Local Development

```bash
pnpm install
pnpm dev          # starts all services via Turborepo
```

Or run individually:

```bash
# Server (port 3001)
cd apps/server && bun run --watch src/index.ts

# Web (port 5173)
cd apps/web && pnpm dev
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | JWT signing secret | *required* |
| `SESSION_SECRET` | Session signing secret | *required* |
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/bubbles` |
| `REDIS_URL` | Redis connection string | *optional* (runs local-only without it) |
| `CORS_ORIGINS` | Allowed origins (comma-separated) | `http://localhost:5173` |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare Tunnel token | *optional* |

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Liveness check |
| `GET` | `/health/ready` | Readiness check (503 during shutdown) |
| `GET` | `/metrics` | Prometheus metrics |
| `GET` | `/places` | List active places |
| `POST` | `/places` | Create a new place |
| `GET` | `/places/:id` | Get place details |
| `WS` | `/ws/place/:id` | Real-time bubble session |

### WebSocket Messages

**Client → Server:** `blow`, `pop`, `set_name`, `cursor`, `ping`

**Server → Client:** `room_state`, `bubble_created`, `bubble_popped`, `bubble_expired`, `user_joined`, `user_left`, `user_renamed`, `cursor_moved`, `pong`, `error`

---

## Observability

Built-in Prometheus metrics at `GET /metrics`:

| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | counter | HTTP requests by method, path, status |
| `http_request_duration_seconds` | histogram | Response time with standard buckets |
| `ws_connections_active` | gauge | Current WebSocket connections |
| `ws_connections_total` | counter | Total WS connections since start |
| `bubbles_blown_total` | counter | Bubbles created (by size) |
| `bubbles_popped_total` | counter | Bubbles popped |
| `bubbles_expired_total` | counter | Bubbles expired |
| `rooms_active` | gauge | Active rooms |

---

## Deployment

Deployed on Kubernetes via ArgoCD with GitOps (IaC repo).

| Feature | Detail |
|---------|--------|
| **Rolling updates** | `maxSurge: 1`, `maxUnavailable: 0` |
| **Graceful shutdown** | SIGTERM → WS close 1012 → 2s drain → exit |
| **Client reconnect** | Close code 1012 triggers immediate reconnect (no backoff) |
| **Readiness probe** | `/health/ready` returns 503 during shutdown |
| **Pre-stop hook** | `sleep 5` for K8s endpoint propagation |
| **Replicas** | 2 server pods for high availability |

---

## Rate Limits

| Action | Authenticated | Anonymous |
|--------|--------------|-----------|
| Blow / Pop | 300 | 200 |
| Create Place | 20 | 5 |

---

## Build

```bash
pnpm build        # builds all packages via Turborepo
```

---

<div align="center">
<sub>Built with bubbles and love</sub>
</div>
