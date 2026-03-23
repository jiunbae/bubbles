<div align="center">

# 🫧 Bubbles

### A multiplayer bubble-blowing community

**Create places. Blow bubbles. Pop together.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-r173-000000?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Hono](https://img.shields.io/badge/Hono-4-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![Bun](https://img.shields.io/badge/Bun-runtime-F9F1E1?logo=bun&logoColor=black)](https://bun.sh/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

</div>

---

## What is Bubbles?

Bubbles is a real-time multiplayer web app where people gather in virtual **places** to blow and pop bubbles together. Think of it as a chill, interactive community space with beautiful 3D visuals powered by custom GLSL shaders.

### Highlights

- **Real-time multiplayer** — WebSocket-powered bubble blowing & popping with live cursor tracking
- **3D bubble rendering** — Custom GLSL shaders with postprocessing effects via React Three Fiber
- **Community places** — Create themed spaces (Rooftop, Park, Alley) for people to hang out in
- **Multiple bubble styles** — 3 sizes (S/M/L), 8 colors, 4 patterns (plain, spiral, dots, star)
- **Dynamic lifespans** — Bubbles float and expire naturally (6s–30s based on size)
- **Visual & Stealth modes** — Switch between full 3D rendering and a minimal view

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
| **Database** | MongoDB 7 |
| **Infra** | Docker Compose, Nginx reverse proxy, Cloudflare Tunnel |

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- Or: [pnpm](https://pnpm.io/) + [Bun](https://bun.sh/) for local dev

### Run with Docker

```bash
# Clone and start
git clone <repo-url> && cd bubbles
cp .env.example .env   # configure your secrets

docker compose up
```

Services start on:
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
| `CORS_ORIGINS` | Allowed origins (comma-separated) | `http://localhost:5173` |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare Tunnel token | *optional* |

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/places` | List active places |
| `POST` | `/places` | Create a new place |
| `GET` | `/places/:id` | Get place details |
| `WS` | `/ws/place/:id` | Real-time bubble session |

### WebSocket Messages

**Client → Server:** `blow`, `pop`, `cursor`, `ping`
**Server → Client:** `bubble_created`, `bubble_popped`, `bubble_expired`, `user_joined`, `user_left`, `cursor_update`

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
