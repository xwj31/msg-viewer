const esbuild = require('esbuild');

// Bundle both entry points so the .vsix ships two self-contained files
// instead of the full node_modules tree (the MCP SDK alone pulls in
// express/hono/jose). `vscode` is provided by the extension host.
Promise.all([
  esbuild.build({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: 'out/extension.js',
    external: ['vscode'],
    minify: true,
  }),
  esbuild.build({
    entryPoints: ['src/mcp.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: 'out/mcp.js',
    minify: true,
  }),
]).catch(() => process.exit(1));
