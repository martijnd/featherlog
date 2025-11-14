# Changelog

All notable changes to the Featherlog SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.2]: https://github.com/martijnd/featherlog/releases/tag/sdk-v1.0.2
[1.0.1]: https://github.com/martijnd/featherlog/releases/tag/sdk-v1.0.1
[1.0.0]: https://github.com/martijnd/featherlog/releases/tag/sdk-v1.0.0
