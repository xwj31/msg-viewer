# MSG Viewer

A minimal VS Codium / VS Code extension to **preview Outlook `.msg` files** — no external tools, no uploads, everything is parsed locally.

![Preview](https://img.shields.io/badge/works-dark%20%26%20light-eee?style=flat)

## What it does

Double-click any `.msg` file and get a clean, readable preview of:

- **Subject, sender, To/Cc/Bcc** — parsed from the binary MAPI properties
- **HTML body** — rendered as a live HTML preview, with inline images resolved from attachments
- **Plain text fallback** — toggle between HTML and text views
- **Attachments** — images shown inline, other files listed with download links
- **Headers** — raw transport headers at the bottom
- **Dark theme** — respects VS Codium's theme, strips hardcoded colors so text is always visible

## MCP server

The extension bundles an [MCP](https://modelcontextprotocol.io) stdio server so AI agents can read `.msg` files too. In VS Codium / VS Code 1.102+ it is registered automatically (via the `mcpServerDefinitionProviders` contribution) and shows up as **MSG Viewer** in the MCP server list.

Tools:

- `read_msg` — parse a `.msg` file: subject, sender, To/Cc/Bcc, date, plain-text body (optionally HTML), and attachment list
- `extract_msg_attachment` — write one attachment to disk by index

To use it outside the editor (e.g. Claude Code), point any MCP client at the bundled server:

```bash
claude mcp add msg-viewer -- node ~/.vscode-oss/extensions/hovecapital.msg-viewer-*/out/mcp.js
```

## How it works

Uses [`@kenjiuno/msgreader`](https://github.com/kenjiuno/msgreader) — a pure JavaScript library that parses the Outlook Item (.msg) binary format. No network calls, no external API, no data leaves your machine.

## Install

From the [Open VSX Registry](https://open-vsx.org/extension/hovecapital/msg-viewer) (VS Codium's built-in extension gallery) — search for **MSG Viewer**, or:

```bash
codium --install-extension hovecapital.msg-viewer
```

Or grab the `.vsix` from [releases](https://github.com/xwj31/msg-viewer/releases) and install it via Extensions view → ... → **Install from VSIX**.

## Build from source

```bash
git clone https://github.com/xwj31/msg-viewer
cd msg-viewer
npm install
npm run package   # produces msg-viewer-<version>.vsix
```

## Releases

Versioning and changelogs are automated with [release-please](https://github.com/googleapis/release-please). Commits to `main` must follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `chore:`, …); release-please maintains a release PR, and merging it tags a release, updates `CHANGELOG.md`, and publishes to Open VSX.

## License

MIT
