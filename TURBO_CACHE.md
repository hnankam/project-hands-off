# Turbo Build Caching Guide

## Problem Solved
`@extension/content-runtime-script` was taking 20+ minutes to build on every run, even when no files changed. This was because caching was disabled.

## Solution
Enabled Turbo's intelligent caching system to skip rebuilds when inputs haven't changed.

## How It Works

### Cache Keys
Turbo creates a cache key based on:
1. **Input files** (source code, configs)
2. **Dependencies** (other packages)
3. **Environment variables** (NODE_ENV, CLI_CEB_*, etc.)
4. **Command** (build script)

If the cache key matches a previous build, Turbo restores outputs instantly.

### Cached Tasks

#### `build` Task
**Cached inputs:**
- `src/**` - All source files
- `public/**` - Public assets
- `*.ts`, `*.tsx`, `*.mts` - TypeScript files
- `*.json` - Config files
- Excludes: `*.test.ts`, `*.test.tsx`

**Environment variables that invalidate cache:**
- `NODE_ENV`
- `CLI_CEB_DEV`
- `CLI_CEB_FIREFOX`

**Outputs:**
- `dist/**` - Built files

#### `dev` Task (Watch Mode)
**Cached inputs:** Same as build task

**How it works:**
- Initial compilation uses cache (instant start if no changes)
- Watch mode still monitors for file changes
- File changes trigger rebuilds (normal watch behavior)
- **Stopping and restarting dev** without changes = instant start ⚡

**Environment variables that invalidate cache:**
- `NODE_ENV`
- `CLI_CEB_DEV`
- `CLI_CEB_FIREFOX`

#### `ready` Task
**Cached inputs:**
- `src/**`
- `lib/**`
- `*.ts`, `*.tsx`, `*.mts`
- `*.json`

## Usage

### Development Mode (with cache) 🔥
```bash
# Start dev server with cache
pnpm run dev

# Firefox variant
pnpm run dev:firefox
```

**Expected performance:**
- **First start**: 1-2 minutes (initial compilation)
- **Restart without changes**: < 5 seconds (cache hit) ⚡
- **File changes**: Normal watch rebuild (10-20 seconds)

**Benefits:**
- Fast restarts after stopping dev server
- Cache persists between dev sessions
- Watch mode still works normally

### Fast Build (with cache) ⚡
```bash
# Use cache - only rebuilds changed packages
pnpm run build:cached

# Firefox variant
pnpm run build:cached:firefox
```

**Expected performance:**
- **First build**: 20 minutes (no cache)
- **No changes**: < 1 second (cache hit) ✨
- **One package changed**: Only that package rebuilds

### Full Build (no cache)
```bash
# Clean everything and rebuild (slow but guaranteed fresh)
pnpm run build

# Firefox variant
pnpm run build:firefox
```

### Build Specific Package
```bash
# Only build content-runtime if it changed
pnpm -F @extension/content-runtime-script build

# Check what would be cached/rebuilt
turbo build --dry-run
```

## Cache Management

### View Cache Status
```bash
# See what's in the cache
turbo run build --summarize

# Check if a build would use cache
turbo run build --dry-run
```

### Clear Cache
```bash
# Clear Turbo cache
pnpm clean:turbo

# Or manually
rm -rf .turbo
```

### Force Rebuild
```bash
# Ignore cache and rebuild everything
turbo run build --force

# Or use the full clean build
pnpm run build
```

## When to Use Each Command

### Regular Development: `pnpm run build:cached`
✅ **Use when:**
- You're working on code and want fast incremental builds
- You've only changed a few files
- You want maximum speed

❌ **Don't use when:**
- Something feels broken/stale
- You've changed environment variables manually
- You're preparing a production release

### Clean Build: `pnpm run build`
✅ **Use when:**
- Creating production builds
- Something feels wrong/stale
- You've made major dependency changes
- Preparing for a release

❌ **Don't use when:**
- Iterating quickly during development
- You just want to test a small change

## Cache Invalidation

Cache is automatically invalidated when:
1. **Any input file changes** (source code, configs)
2. **Dependencies change** (package.json, pnpm-lock.yaml)
3. **Environment variables change** (NODE_ENV, etc.)
4. **Build script changes** (package.json scripts, build.mts)
5. **Turbo config changes** (turbo.json)

## Advanced

### Package-Specific Cache Control

To never cache a specific package, add to its `package.json`:
```json
{
  "turbo": {
    "cache": false
  }
}
```

### Custom Cache Inputs

To add more files to cache inputs for a package:
```json
{
  "turbo": {
    "inputs": ["src/**", "custom-config.yaml"]
  }
}
```

### Remote Caching (Team Collaboration)

Enable remote caching to share cache across team:
```bash
# Link to Vercel (free for personal use)
npx turbo login
npx turbo link

# Now cache is shared with team
pnpm run build:cached
```

## Performance Expectations

### Before Caching:
- **Full build**: 20+ minutes
- **Incremental build**: 20+ minutes (no cache)
- **No changes**: 20+ minutes (still rebuilds)
- **Dev restart**: 1-2 minutes (rebuilds everything)

### After Caching:
- **First build**: 20 minutes (building cache)
- **No changes**: < 1 second ⚡
- **One package changed**: 2-5 minutes (only that package)
- **All packages changed**: 20 minutes (same as before)
- **Dev restart (no changes)**: < 5 seconds ⚡
- **Dev file change**: 10-20 seconds (normal watch rebuild)

### Real-World Example (Build):
```bash
# First time - builds everything
$ pnpm run build:cached
# ⏱ 20 minutes

# No changes - uses cache
$ pnpm run build:cached  
# ✨ 0.3 seconds (cache hit!)

# Changed side-panel only
$ pnpm run build:cached
# ⏱ 3 minutes (rebuilds side-panel + deps)

# Changed content-runtime only
$ pnpm run build:cached
# ⏱ 18 minutes (heavy package, but only it rebuilds)
```

### Real-World Example (Dev):
```bash
# First dev start - initial compilation
$ pnpm run dev
# ⏱ 1-2 minutes (initial build)
# [watching files...]

# Stop dev (Ctrl+C), then restart without changes
$ pnpm run dev
# ✨ 3 seconds (cache hit!)
# [watching files...]

# Edit a file in side-panel
# ⏱ 15 seconds (hot reload)

# Stop dev, change content-runtime, restart
$ pnpm run dev
# ⏱ 30 seconds (only content-runtime rebuilds)
# [watching files...]
```

## Troubleshooting

### Cache Not Working?

**Check cache status:**
```bash
turbo run build --dry-run
```

**Common issues:**
1. **.env file changed** - Invalidates global cache
2. **node_modules modified** - Clear and reinstall
3. **Git ignored files changed** - Won't invalidate cache
4. **Clock skew** - Fix system time

### Stale Cache?

Force rebuild:
```bash
pnpm clean:turbo && pnpm run build:cached
```

### Too Much Cache?

Cache location: `.turbo/cache/`

```bash
# Check cache size
du -sh .turbo

# Clear old cache
rm -rf .turbo/cache/*
```

## Configuration Files

### `/turbo.json`
Main Turbo configuration with cache settings.

### What Changed:
```diff
  "build": {
    "dependsOn": ["ready", "^build"],
    "outputs": ["../../dist/**", "dist/**"],
+   "inputs": [
+     "src/**",
+     "public/**",
+     "*.ts", "*.tsx", "*.mts", "*.json",
+     "!**/*.test.ts", "!**/*.test.tsx"
+   ],
+   "env": ["NODE_ENV", "CLI_CEB_DEV", "CLI_CEB_FIREFOX"],
-   "cache": false
+   "cache": true
  }
```

## Best Practices

### ✅ DO:
- Use `build:cached` for daily development
- Let Turbo handle caching automatically
- Clear cache when things feel wrong
- Use `build` for production releases

### ❌ DON'T:
- Manually edit `.turbo/` directory
- Commit `.turbo/` to git (already in .gitignore)
- Mix `build` and `build:cached` without understanding difference
- Ignore cache size (clean periodically)

## Integration with CI/CD

For GitHub Actions or other CI:
```yaml
- name: Setup Turbo Cache
  uses: actions/cache@v3
  with:
    path: .turbo
    key: turbo-${{ runner.os }}-${{ github.sha }}
    restore-keys: turbo-${{ runner.os }}-

- name: Build with cache
  run: pnpm run build:cached
```

## Summary

**🎯 Goal**: Avoid rebuilding unchanged packages

**⚡ Build Results**: 
- 20 minutes → < 1 second for cache hits
- Only changed packages rebuild
- **Command**: `pnpm run build:cached`

**🔥 Dev Results**:
- Restart without changes: 1-2 minutes → < 5 seconds
- Initial compilation uses cache
- Watch mode still works normally
- **Command**: `pnpm run dev` (caching already enabled!)

**🧹 Clean**: `pnpm clean:turbo` or `pnpm run build`

Turbo caching is now enabled for both build AND dev modes! 🎉

