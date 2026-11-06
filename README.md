# Remake

<a href="https://discord.gg/U3qrf49NMQ"><img src="https://img.shields.io/discord/883382868427014255?color=%23FEE75C&label=Discord&logo=discord&logoColor=white&style=for-the-badge" /></a>

English | [简体中文](./README-zh_CN.md)

## Environment

Verified versions: Node.js `24.21.0`, pnpm `11.25.0`, and Bun `1.4.4`. The project scripts require `pnpm`, `bun`, and `bunx` on your PATH.

Install Node.js first. To install pnpm and Bun if they are missing:

```sh
npm install --global pnpm@11.25.0 bun@1.4.4
```

Reopen your terminal and check `node --version`, `pnpm --version`, and `bun --version`.

## Run locally

Run these commands from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build:data
pnpm dev --host 127.0.0.1 --port 5173 --strictPort
```

Open **http://127.0.0.1:5173/** in your browser. Keep the terminal open while playing; press `Ctrl+C` to stop. If port 5173 is occupied, stop the old development server and retry. `--strictPort` prevents an automatic port change that would use a different browser save.

The first run requires dependency installation and data generation. The data build may download its Excel conversion tool through `bunx`. For subsequent runs, only the `pnpm dev ...` command is needed. Rebuild data after changing spreadsheets or updating the project, and reinstall dependencies when they change.

Events are maintained in structured JSON; other data is generated from Excel. See the [event format documentation (Chinese)](packages/data/EVENTS.md).

## Import and export saves

The web home screen has **导出存档** (export) and **导入存档** (import) buttons, available even before your first playthrough. Exports use the existing JSON profile format: achievements, completed play count, collected events and talents, property records, and inherited talents. Finish a playthrough and return home before exporting its results. An ongoing life and the separately stored unique character are not included.

1. Export a JSON backup from the home screen; an empty profile can also be exported.
2. Complete another playthrough or prepare another test save.
3. Import the backup to replace your current profile. Achievements and statistics update immediately.
4. Reload the page to verify persistence. Invalid files show an error without replacing the existing profile.

Browser saves use `localStorage`, so different browsers, hostnames, or ports have separate saves. Use the same local URL when testing. In development mode, **http://127.0.0.1:5173/?features=0** makes the achievements page available before completing a playthrough.

## Other commands

```sh
# Build the production web app
pnpm build:web

# Preview the build; open the URL printed in the terminal (default port 4173)
pnpm preview

# Run the terminal app; import/export buttons are available in the web app
pnpm dev:console
```
