# Featherlog

A simple logging SDK for Node.js that sends logs to your Featherlog server.

## Installation

```bash
npm install featherlog
# or
pnpm add featherlog
# or
yarn add featherlog
```

## Usage

```typescript
import { Logger } from "featherlog";

const logger = new Logger({
  "project-id": "your-project-id",
});

// Capture errors (recommended) — includes stack/type for issue fingerprinting
try {
  // your code
} catch (error) {
  await logger.capture(error, { userId: 123 });
}

// Log errors as plain messages
await logger.error("Payment failed", { orderId: "abc" });

// Log warnings
await logger.warn("Something might be wrong", { userId: 123 });

// Log info
await logger.info("User logged in", { userId: 123 });
```

## API

### `new Logger(options: LoggerOptions)`

Creates a new Logger instance.

**Options:**

- `project-id` (string, required): Your unique project identifier

**Note:** The SDK uses origin-based authentication. Make sure to configure allowed origins for your project in the Featherlog admin panel. The SDK automatically sends the `Origin` header with requests.

**Endpoint Configuration:**

The endpoint is automatically determined based on `NODE_ENV`:

- `development` (or unset): Uses `FEATHERLOG_ENDPOINT` env var or defaults to `http://localhost:3000/api/logs`
- `production`: Uses `FEATHERLOG_ENDPOINT` env var or defaults to `https://featherlog.lekkerklooien.nl/api/logs`

You can override the endpoint by setting the `FEATHERLOG_ENDPOINT` environment variable.

### `logger.capture(error: unknown, metadata?: LogMetadata)`

Captures an `Error` (or any thrown value) as an error log with structured `error.name` and `error.stack`. The server uses this to fingerprint and group occurrences into Issues in the admin UI.

### `logger.error(message: string, metadata?: LogMetadata)`

Sends an error log to the server.

### `logger.warn(message: string, metadata?: LogMetadata)`

Sends a warning log to the server.

### `logger.info(message: string, metadata?: LogMetadata)`

Sends an info log to the server.

All methods are async and return `Promise<void>`. They will silently fail if the server is unreachable to prevent breaking your application.

## Authentication

Featherlog uses origin-based authentication. When you create a project in the Featherlog admin panel, you configure a list of allowed origins (e.g., `https://yourdomain.com`, `http://localhost:3000`). The SDK automatically includes the `Origin` header in requests, and the server validates it against your project's allowed origins list.

**Important:** Make sure to add your application's origin(s) to your project's allowed origins list in the admin panel before using the SDK.

## Requirements

- Node.js 18.0.0 or higher (for native `fetch` support)

## License

ISC
