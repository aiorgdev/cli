# @aiorg/cli

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
| `idea-os` | Free | AI-powered business idea validation |
| `marketing-os` | Paid | AI-powered marketing automation |
| `saas-dev-team` | Paid | Full-stack SaaS template |
| `landing-page` | Paid | High-converting landing page |

Visit [aiorg.dev](https://aiorg.dev) to purchase paid kits.

## Requirements

- Node.js 18+
- npm, pnpm, or yarn

## License

MIT
