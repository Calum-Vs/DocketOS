# DocketOS

A Windows desktop app for managing engineering project files with AI-assisted organisation.

Built with Electron 28, React 18, and Vite 5.

> **Version 0.1.9** — This is the standalone DocketOS repository, fully separated from the Roamlee project. It contains only DocketOS source and history.

## Features

- **Project management** — track projects with job numbers, clients, councils, and project managers
- **File browser** — pannable folder tree with drag-and-drop filing and file search
- **Kanban board** — auto-buckets files by folder name (incoming → todo, wip → in progress, outgoing → done)
- **Note canvas** — freeform rich-text notes with connectors, zoom, and pan; persisted per project/subproject
- **AI audit** — Gemini-powered file analysis with document summarisation
- **Quick filing** — drag files to pre-configured destinations (Outgoing, Data Room, custom paths)
- **Report generation** — printable project reports with tasks, timeline, and notes
- **Subproject browser** — navigate and activate subprojects under the Technical folder
- **System launchers** — one-click open for AutoCAD, 12D Model, Excel, and Word

## Requirements

- Windows 10/11
- Node.js 18+

## Getting Started

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Architecture

| Layer | Tech |
|---|---|
| Main process | Electron 28, Node.js, better-sqlite3 |
| Renderer | React 18, Tailwind CSS, Vite 5 |
| AI | Google Gemini API |
| Database | SQLite (userData directory) |

See [CLAUDE.md](CLAUDE.md) for codebase guidance.

## Updates

The GitHub repository is **public**, so installed clients receive automatic updates with no authentication. On startup (and via Help → Check for Updates), `electron-updater` reads the latest GitHub Release and downloads the new installer. Release the update with `npm run publish` after bumping the `version` in `package.json`.
