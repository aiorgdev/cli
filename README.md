# @aiorg/cli

[![npm](https://img.shields.io/npm/v/@aiorg/cli)](https://www.npmjs.com/package/@aiorg/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Claude Code](https://img.shields.io/badge/built%20for-Claude%20Code-blueviolet)](https://docs.anthropic.com/en/docs/claude-code)

Official CLI for downloading and managing [aiorg](https://aiorg.dev) kits - Claude Code starter kits for founders.

## Installation

```bash
# Global install
npm install -g @aiorg/cli

# Or use npx (no install needed)
npx @aiorg/cli <command>
```

## Commands

### `aiorg login`

Save your license key for future use.

```bash
aiorg login
# → Enter your license key: ak_live_xxxxx
# → ✓ Logged in as user@email.com
```

### `aiorg init <kit> [path]`

Download and extract a kit to a folder. Free kits work without login.

```bash
# Free kits - no login needed
aiorg init idea-os ~/Projects/my-idea

# Paid kits - requires login first
aiorg init marketing-os ~/Projects/my-marketing
aiorg init saas-dev-team ~/Projects/my-saas
```

Options:
- `--force` - Overwrite existing folder

### `aiorg upgrade`

Upgrade a kit in the current directory to the latest version.

```bash
cd ~/Projects/my-marketing
aiorg upgrade
# → Update available: v1.5.0 → v1.6.0
# → ✓ Applied 15 files (your data preserved)
```

Options:
- `--yes, -y` - Skip confirmation prompts
- `--backup` - Always create git backup commit before upgrade

### `aiorg version`

Show CLI and kit versions.

```bash
aiorg version
# → CLI: v1.0.0
# → Marketing OS: v1.5.0 (latest: v1.6.0)
```

### `aiorg logout`

Remove saved credentials.

```bash
aiorg logout
# → ✓ Logged out
```

## Environment Variables

- `AIORG_LICENSE_KEY` - Your license key (alternative to `aiorg login`)
- `AIORG_API_URL` - Custom API URL (default: https://aiorg.dev)

## Config Storage

Configuration is stored in `~/.aiorg/config.json`:

```json
{
  "licenseKey": "ak_live_xxxxx",
  "email": "user@email.com",
  "kits": {
    "marketing-os": {
      "tier": "paid",
      "purchasedAt": "2026-01-01"
    }
  }
}
```

## How Upgrades Work

When you run `aiorg upgrade`, the CLI:

1. Checks for new versions via the API
2. Downloads the new version ZIP
3. Applies updates based on `fileCategories` in the kit's `version.json`:
   - `alwaysReplace`: Files that get overwritten (CLI code, commands)
   - `neverTouch`: Files that are preserved (your config, data, content)
4. Creates a git backup commit (optional)

Your customizations and data are preserved during upgrades.

## Available Kits

| Kit | Type | Description |
|-----|------|-------------|
| [`idea-os`](https://aiorg.dev/kits/idea-os) | Free | AI-powered business idea validation |
| [`landing-page`](https://aiorg.dev/kits/landing-page) | Free | GEO optimization for Astro projects |
| [`marketing-os`](https://aiorg.dev/kits/marketing-os) | Paid | AI-powered marketing automation |
| [`saas-dev-team`](https://aiorg.dev/kits/saas-starter) | Paid | Full-stack SaaS template |
| [`product-os`](https://aiorg.dev/kits/product-os) | Paid | Product management with AI |
| [`qa-team`](https://aiorg.dev/kits/qa-team) | Paid | AI-powered QA testing |
| [`support-team`](https://aiorg.dev/kits/support-team) | Paid | AI customer support |
| [`investor-os`](https://aiorg.dev/kits/investor-os) | Paid | Fundraising preparation |

Visit [aiorg.dev](https://aiorg.dev) to see all kits.

## Requirements

- Node.js 18+
- npm, pnpm, or yarn

## Links

- **Website:** [aiorg.dev](https://aiorg.dev)
- **Documentation:** [aiorg.dev/docs](https://aiorg.dev/docs)
- **All kits:** [aiorg.dev/#kits](https://aiorg.dev/#kits)
- **Issues:** [github.com/aiorgdev/cli/issues](https://github.com/aiorgdev/cli/issues)

## License

MIT
