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

// Log errors
try {
  // your code
} catch (error) {
  logger.error(error.message, {
    stack: error.stack,
    // any additional metadata
  });
}

// Log warnings
logger.warn("Something might be wrong", { userId: 123 });

// Log info
logger.info("User logged in", { userId: 123 });
```

## API

### `new Logger(options: LoggerOptions)`

Creates a new Logger instance.

**Options:**

- `project-id` (string, required): Your unique project identifier
- `endpoint` (string, optional): The Featherlog server endpoint. If not provided, automatically determined based on `NODE_ENV`:
  - `development` (or unset): Uses `FEATHERLOG_ENDPOINT` env var or defaults to `http://localhost:3000/api/logs`
  - `production`: Uses `FEATHERLOG_ENDPOINT` env var or defaults to `https://lekkerklooien.nl/api/logs`

You can also set the `FEATHERLOG_ENDPOINT` environment variable to override the default endpoint for your environment.

### `logger.error(message: string, metadata?: LogMetadata)`

Sends an error log to the server.

### `logger.warn(message: string, metadata?: LogMetadata)`

Sends a warning log to the server.

### `logger.info(message: string, metadata?: LogMetadata)`

Sends an info log to the server.

All methods are async and return `Promise<void>`. They will silently fail if the server is unreachable to prevent breaking your application.

## Requirements

- Node.js 18.0.0 or higher (for native `fetch` support)

## License

ISC
