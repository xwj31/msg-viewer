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

## How it works

Uses [`@kenjiuno/msgreader`](https://github.com/kenjiuno/msgreader) — a pure JavaScript library that parses the Outlook Item (.msg) binary format. No network calls, no external API, no data leaves your machine.

## Install

1. Download the `.vsix` from [releases](https://github.com/will/msg-viewer/releases) or build it yourself
2. In VS Codium, open the Extensions view (⇧⌘X) → ... → **Install from VSIX**
3. Pick the `.vsix` file — done

Or via CLI:

```bash
codium --install-extension msg-viewer-0.0.1.vsix
```

## Build from source

```bash
git clone https://github.com/will/msg-viewer
cd msg-viewer
npm install
npx tsc
npx @vscode/vsce package
```

## License

MIT