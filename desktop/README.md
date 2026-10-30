# Firebirds Nest desktop app

The store's 3D world in its own full-screen window, on the computer's fast
graphics card. It opens the real website, so accounts, cash, houses and
cars are the same as on the web, and the game updates by itself (no need
to download it again).

Why it runs better than a browser tab: it switches on the computer's
high-performance graphics card (laptops with two pick the slow one for
browsers), ignores the graphics blocklist, isn't slowed down in the
background, has no other tabs or extensions competing, and starts the
graphics on Ultra (it drops a level by itself if the computer can't keep
up; the Graphics button changes it).

- **F11** full screen, **F5** reload.
- **Game → Preview** opens the preview of changes that aren't live yet
  (sign in to Vercel the first time).
- **Help → Graphics card in use** shows which graphics card it's using.

## Getting it

The **Desktop app** GitHub Action builds it whenever this folder changes
and attaches the downloads to the repo's **Firebirds Nest app** release:

- Windows: `Firebirds-Nest-…-win-x64.exe` (installer) or `…-portable.exe`
  (runs without installing; good on school computers). Windows may say it
  "protected your PC" because the app isn't signed: **More info → Run anyway**.
- Mac: `…-mac-universal.dmg`. The first time, right-click the app →
  **Open** → **Open** (it isn't signed by Apple).
- Linux: `…-linux-x86_64.AppImage`.

Chromebooks can't run downloaded apps; use the website there.

To build it yourself: `cd desktop && npm install && npm run dist`.
