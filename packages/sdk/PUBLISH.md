# Publishing Featherlog SDK to npm

## Prerequisites

1. Have an npm account (create at https://www.npmjs.com/signup)
2. Be logged in: `npm login`
3. Ensure you're in the `packages/sdk` directory

## Pre-publish Checklist

- [ ] Update version in `package.json` (use semantic versioning: MAJOR.MINOR.PATCH)
- [ ] Ensure `dist/` folder is built and up-to-date (`pnpm build`)
- [ ] Test the package locally: `pnpm pack` and verify contents
- [ ] Update README.md if needed
- [ ] Verify repository URL in package.json is correct

## Publishing

### First Time Publishing

```bash
cd packages/sdk
pnpm build
npm publish --access public
```

### Updating Version and Publishing

```bash
cd packages/sdk

# Update version (choose one):
npm version patch  # 0.0.1 -> 0.0.2 (bug fixes)
npm version minor  # 0.0.1 -> 0.1.0 (new features)
npm version major  # 0.0.1 -> 1.0.0 (breaking changes)

# Or manually edit package.json version

# Build and publish
pnpm build
npm publish
```

## Testing Before Publishing

Test the package locally:

```bash
cd packages/sdk
pnpm pack
# This creates a .tgz file you can test with
```

## Post-Publish

After publishing, verify the package is available:

```bash
npm view featherlog
```

## Notes

- The `prepublishOnly` script will automatically run `pnpm build` before publishing
- Only files listed in the `files` field will be published (dist/ and README.md)
- Source maps are included for better debugging experience
- TypeScript definitions are included for TypeScript users

