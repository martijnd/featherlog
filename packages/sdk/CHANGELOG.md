# Changelog

All notable changes to the Featherlog SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1] - 2024-12-14

### Fixed

- **Improved NODE_ENV detection** - The SDK now properly detects `NODE_ENV` in both Vite-based applications and Node.js environments. Vite automatically replaces `process.env.NODE_ENV` at build time based on the build mode, ensuring the correct endpoint is used:
  - Development mode (`vite dev`): Uses `http://localhost:3000/api/logs`
  - Production builds (`vite build`): Uses `https://featherlog.lekkerklooien.nl/api/logs`
  - Node.js environments: Uses runtime `NODE_ENV` value

### Changed

- **Simplified endpoint detection logic** - The SDK now handles environment detection internally, requiring no configuration changes in consuming applications. The SDK automatically works correctly whether you're developing locally or building for production.

## [2.0.0] - 2024-11-14

### BREAKING CHANGES

- **Removed `secret` parameter** - The SDK no longer requires a `secret` parameter in the Logger constructor. Authentication is now handled via origin-based checking on the server side.
- **Simplified Logger initialization** - The Logger constructor now only requires `project-id`:

  ```typescript
  // Before (v1.x)
  const logger = new Logger({
    "project-id": "your-project-id",
    secret: "your-secret",
  });

  // After (v2.0)
  const logger = new Logger({
    "project-id": "your-project-id",
  });
  ```

### Changed

- **Origin-based authentication** - Projects now use origin-based authentication instead of shared secrets. Configure allowed origins for each project in the Featherlog admin panel. The SDK automatically sends the `Origin` header with requests, and the server validates it against the project's allowed origins list.
- **Improved security** - Origin-based authentication provides better security by restricting log submissions to specific domains/origins, preventing unauthorized log submissions even if a project ID is known.

### Migration Guide

To migrate from v1.x to v2.0:

1. **Remove `secret` from Logger initialization**:

   ```typescript
   // Remove this
   const logger = new Logger({
     "project-id": "your-project-id",
     secret: "your-secret", // ❌ Remove this
   });

   // Use this instead
   const logger = new Logger({
     "project-id": "your-project-id", // ✅ Only project-id needed
   });
   ```

2. **Configure allowed origins in admin panel**:

   - Log into your Featherlog admin panel
   - Navigate to the Projects section
   - Edit your project and add the allowed origins (e.g., `https://yourdomain.com`, `http://localhost:3000`)
   - The server will automatically validate requests based on the `Origin` header

3. **No code changes needed for log methods** - All logging methods (`error()`, `warn()`, `info()`) work exactly the same way.

### Notes

- The SDK automatically includes the `Origin` header in requests (browser) or uses the `Referer` header (Node.js)
- Server-side requests (Node.js) without an origin header are allowed if the project's origins list is empty (for backward compatibility)
- Wildcard origins are supported (e.g., `https://*.example.com`) but `*` alone is not allowed for security reasons

## [1.0.2] - 2024-11-14

### Changed

- Updated package.json homepage and readme links to point to SDK-specific documentation on GitHub

## [1.0.1] - 2024-11-14

### Fixed

- **FEATHERLOG_ENDPOINT environment variable support** - The SDK now properly checks for `FEATHERLOG_ENDPOINT` environment variable to override default endpoints. Previously documented but not implemented.

### Added

- **Comprehensive unit test suite** - Added 21 unit tests with 94.44% code coverage
- **Test infrastructure** - Set up Vitest testing framework with coverage reporting
- **Test scripts** - Added `test`, `test:watch`, and `test:coverage` npm scripts

### Changed

- Improved endpoint detection logic to prioritize `FEATHERLOG_ENDPOINT` environment variable

## [1.0.0] - 2024-11-14

### Added

- Initial release of Featherlog SDK
- **Logger class** with support for three log levels:
  - `error()` - Send error logs to the server
  - `warn()` - Send warning logs to the server
  - `info()` - Send informational logs to the server
- **Automatic endpoint detection** based on `NODE_ENV`:
  - Development: `http://localhost:3000/api/logs` (default)
  - Production: `https://featherlog.lekkerklooien.nl/api/logs` (default)
  - Override via `FEATHERLOG_ENDPOINT` environment variable
- **Custom metadata support** - Attach any additional data to log entries
- **Silent failure handling** - Logging errors won't break your application
- **TypeScript support** - Full type definitions included
- **Cross-platform support** - Works in both Node.js and browser environments
- **ES Module support** - Native ES modules with proper exports
- **Source maps** - Included for better debugging experience

### Features

- Simple, intuitive API with minimal configuration
- Secure authentication using project secrets
- Automatic timestamp generation
- Promise-based async API
- Zero dependencies (uses native `fetch` API)
- Works with modern bundlers (Vite, Webpack, etc.)

### Requirements

- Node.js 18.0.0 or higher (for native `fetch` support)

### Documentation

- Comprehensive README with usage examples
- TypeScript type definitions for IDE autocomplete
- Clear API documentation

[2.0.1]: https://github.com/martijnd/featherlog/releases/tag/sdk-v2.0.1
[2.0.0]: https://github.com/martijnd/featherlog/releases/tag/sdk-v2.0.0
[1.0.2]: https://github.com/martijnd/featherlog/releases/tag/sdk-v1.0.2
[1.0.1]: https://github.com/martijnd/featherlog/releases/tag/sdk-v1.0.1
[1.0.0]: https://github.com/martijnd/featherlog/releases/tag/sdk-v1.0.0
