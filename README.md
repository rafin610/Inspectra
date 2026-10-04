# Inspectra — Frontend AI Auditor (V1)

A production-quality Chrome Extension (Manifest V3) that scans the **rendered
frontend** of the currently open website, identifies meaningful UI/UX and
responsive problems, and generates **one comprehensive, copy-ready prompt**
that another coding AI (Cursor, Claude Code, Gemini, ChatGPT, Copilot…) can
use to fix them.

> Frontend only. No backend auditing, no database, no security scanning,
> no source-code analysis, no accounts.

## Flow

```text
Open a website → Open Inspectra → Scan Frontend
  → structured evidence → AI analysis → categorized issues
  → one Fix Prompt → Copy Prompt → paste into your coding AI
```

## Install (developer mode)

1. `npm install`
2. `npm run build` — outputs the loadable extension to `dist/`
3. Open `chrome://extensions`, enable **Developer mode**
4. **Load unpacked** → select the `dist/` folder
5. Pin Inspectra, open any website, click the toolbar icon → **Open Auditor**
6. In the side panel: **Settings** → pick Gemini or OpenAI → paste your
   API key → **Save Settings** → **Scan Frontend**

## Configuration

- **You bring your own provider.** Add any number of AI providers, each with
  a name, API format (`OpenAI Compatible`, `Gemini Native`, `Custom`),
  endpoint, API key, and model. The active provider is selectable per scan.
- **No default models.** Inspectra never substitutes a model. If the model
  (or endpoint/key) is missing, the scan is blocked with a message naming
  exactly what to configure.
- **Test Connection** verifies reachability, key acceptance, and model
  availability before you scan. **Fetch Models** optionally lists server
  models; manual entry always works.
- Keys are stored only in `chrome.storage.local` on your device and sent
  directly to your configured endpoint. There is no backend.
- V1 single-provider settings migrate automatically on first run.

## Project structure

```text
src/
  background/   service-worker.ts, message-handler.ts
  content/      scanner.ts (orchestrator) + dom/element/style/layout/
                responsive/visibility scanners + screenshot-manager.ts
  ai/           adapters.ts (OpenAI-compatible, Gemini-native, custom
                registry + structured errors), analyzer.ts (prompt
                construction + adapter dispatch), schemas.ts,
                prompt-generator.ts
  sidepanel/    App.tsx, hooks/useScan.ts, components/
  popup/        toolbar entry point
  settings/     Settings.tsx (provider list + add/edit form), storage.ts
                (multi-provider store + V1 migration), options page
  shared/       types.ts, constants.ts, messages.ts
  styles/       globals.css (Tailwind v4)
```

## Key design decisions

- **Compact evidence, not HTML dumps.** At most ~220 visible, relevant
  elements with rects + a narrow computed-style subset + geometric signals
  (overflow, overlap, clipping, misalignment, contrast, tap targets…).
  Passwords, emails, cookies, and tokens are never collected or sent.
- **Non-destructive scanning.** The page is never resized or mutated; the
  scanner waits for SPA stability via a short mutation-quiet window.
- **Evidence-driven AI.** The system prompt forces structured JSON only,
  bans hallucinations, and separates *Actual Problem / Design Improvement /
  Potential Cleanup*. Malformed replies are parsed defensively (fences,
  prose wrappers) and validated item-by-item.
- **Self-contained content script.** `content/scanner.js` is built as a
  classic script with zero runtime imports (shared constants duplicated
  locally by design) so it runs on every page.
- **Screenshots are best-effort.** A downscaled JPEG is attached for both
  providers (Gemini inline data / OpenAI image URL) when enabled.

## Restricted pages

`chrome://`, `edge://`, `about:`, extension pages, etc. cannot be touched by
extensions — the UI says so instead of hanging.

## Scripts

| Command          | What it does                              |
| ---------------- | ----------------------------------------- |
| `npm run build`  | Typecheck + Vite build + copy manifest to `dist/` |
| `npm run typecheck` | `tsc --noEmit`                         |
| `npm run dev`    | Vite dev server (UI preview only)         |

## Privacy

- No passwords, cookies, auth tokens, or form values leave the page.
- No scan history stored, no analytics, no remote servers.
- The only network calls are the direct AI audit requests you trigger.
