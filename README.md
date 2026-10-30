# sninsinsino.github.io

VS Code in the browser (monaco-vscode-api) with a real Node sandbox.

- Default backend: Wasmer (`wasmer/edgejs`, Node 24 + pnpm + bash in WebAssembly). Runs Vite 8.
- `?backend=lifo` selects the lightweight lifo VM instead (also the automatic fallback).
- Dev servers are previewed at `/<key>/` (the default is `/app/`) or as an editor tab.
- Network goes through a public Wisp relay, selectable under "Relays" (auto, manual or custom).

Your files in `/workspace/home` are saved in the browser (IndexedDB) and restored on reload. Each project's `node_modules` is saved too, as one compressed archive (symlinks included). Use "Reset" to wipe the saved workspace.
