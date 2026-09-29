# Featherlog

A logging SDK for Node.js (and browsers) that sends structured **wide events** to your Featherlog server.

Inspired by [canonical log lines / wide events](https://loggingsucks.com/): emit one context-rich event per request instead of many sparse log lines.

## Installation

```bash
npm install featherlog
# or
pnpm add featherlog
```

## Quick start

```typescript
import { Logger } from "featherlog";

const logger = new Logger({
  "project-id": "your-project-id",
  service: "checkout-service",
  version: "2.4.1",
  environment: "production",
  // Tail sampling: always keep errors/slow/VIP; sample 5% of the rest
  sampleRate: 0.05,
  slowThresholdMs: 2000,
  alwaysKeepUserIds: ["enterprise_user_1"],
});

logger.setContext({ region: "us-east-1", deployment_id: "deploy_789" });

// Preferred: one wide event per request
const event = logger.createEvent({
  request_id: "req_8bf7ec2d",
  method: "POST",
  path: "/api/checkout",
});

event.set({
  user: { id: "user_456", subscription: "premium" },
  cart: { id: "cart_xyz", total_cents: 15999 },
});

try {
  // ... handle request ...
  event.set({ status_code: 200, outcome: "success" });
} catch (error) {
  event.set({ status_code: 500, outcome: "error" }).setError(error);
  throw error;
} finally {
  await event.emit(); // duration_ms filled automatically
}

// Still supported: sparse logs + error capture for Issues
await logger.capture(error, { userId: 123 });
await logger.error("Payment failed", { orderId: "abc" });
await logger.warn("Something might be wrong", { userId: 123 });
await logger.info("User logged in", { userId: 123 });
```

## Why wide events?

String-searchable log diaries don't help at 2am. A wide event is a structured record of **what happened to this request**: user, cart, payment attempt, feature flags, error code, duration — queryable by field in the admin UI (`user.id=user_456`, `outcome=error`, `request_id=...`).

## API

### `new Logger(options)`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `project-id` | string | required | Project identifier |
| `service` | string | — | Attached to every event |
| `version` | string | — | Release / version |
| `environment` | string | — | e.g. `production` |
| `sampleRate` | number | `1` | Keep rate for non-critical events (0–1) |
| `slowThresholdMs` | number | `2000` | Always keep slower events |
| `alwaysKeepUserIds` | string[] | `[]` | Always keep these `user.id` / `user_id` values |

**Endpoint:** `FEATHERLOG_ENDPOINT`, else production default or `http://localhost:5000/api/logs`.

### Context

- `logger.setContext(fields)` — merge persistent fields into every event
- `logger.clearContext()` — reset
- `logger.getContext()` — snapshot

### Wide events

- `logger.createEvent(initial?)` → `WideEvent`
- `event.set(fields)` / `event.set(key, value)` — enrich
- `event.setError(error)` — structured error + `outcome: "error"`
- `event.emit(message?, level?)` — send once; infers level from error/status; sets `duration_ms`

### Classic methods

- `logger.capture(error, metadata?)` — error + stack for Issues fingerprinting
- `logger.error` / `warn` / `info`

All send methods fail silently (`console.warn`) so logging never breaks callers.

## Tail sampling

When `sampleRate < 1`, events are kept if any of:

1. level is `error`, or metadata has `error` / `outcome: "error"` / `status_code >= 500`
2. `duration_ms >= slowThresholdMs`
3. user id is in `alwaysKeepUserIds`
4. otherwise random keep at `sampleRate`

## Authentication

Origin-based: configure allowed origins for the project in the admin panel. Node requests without an Origin header are allowed when the project exists.

## Requirements

- Node.js 18.0.0 or higher (native `fetch`)

## License

ISC
