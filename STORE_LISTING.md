# Chrome Web Store Submission Guide: Inspectra

This document contains all verified metadata, descriptions, permissions justifications, and privacy declarations required to submit Inspectra to the Chrome Web Store Developer Dashboard.

---

## 1. Extension Information

| Field | Value | Notes |
| :--- | :--- | :--- |
| **Extension Name** | `Inspectra — Frontend AI Auditor` | 31 chars (max 75) |
| **Short Name** | `Inspectra` | 9 chars (max 12) |
| **Version** | `1.0.0` | Matches manifest.json |
| **Primary Category** | `Developer Tools` | CWS standard category |
| **Secondary Category** | `Workflow & Planning` | Optional secondary |
| **Supported Language** | `English` | |

---

## 2. Short Description (Manifest Description)

> Scan the rendered frontend, find meaningful UI/UX & responsive issues, and generate a copy-ready fix prompt for your coding AI.

*(Length: 128 characters — strictly under Chrome Web Store's 132-character manifest limit).*

---

## 3. Detailed Store Listing Description

```markdown
Inspectra is an autonomous frontend auditing assistant designed for modern web developers and designers. It analyzes the rendered frontend of your live website, identifies layout, responsive, contrast, and UX issues, and generates a single, copy-ready prompt tailored for your coding AI (Cursor, Claude Code, Gemini, ChatGPT, Copilot, or local models).

Unlike traditional linters or code analyzers, Inspectra evaluates the actual rendered DOM in real time — detecting overflow, overlapping components, misaligned sibling elements, poor tap targets, and accessibility contrast gaps.

Key Features:

🤖 Autonomous Agent Exploration
Launches an autonomous browser agent that explores your live application, testing tabs, dropdown menus, modals, and accordions to find hidden responsive and layout defects.

⚡ Fast Single-Viewport Snapshot
Run a quick, single-viewport audit on demand to capture immediate layout and visual feedback.

🎯 Non-Destructive In-Page Overlay
Inspectra floats unobtrusively inside your webpage. Minimize it to a compact button while testing, or close it anytime with zero leftover DOM traces.

🔒 Zero Backend & Total Privacy (BYOK)
Inspectra runs 100% locally in your browser. You bring your own API key (Google Gemini, OpenAI, OpenRouter, or custom local endpoints). Your keys and website data never touch any third-party intermediary servers.

📋 Copy-Ready AI Fix Prompt
Instantly copy a meticulously structured, implementation-focused prompt that gives your coding assistant the exact context, selectors, root causes, and CSS fix recommendations needed to resolve findings.

Privacy & Safety:
- No passwords, cookies, or auth tokens are ever collected or sent.
- Form submissions and destructive actions are strictly blocked during autonomous exploration.
- Zero analytics, zero tracking, zero remote scripts.
```

---

## 4. Permissions Justification (For CWS Reviewers)

| Permission | Justification for Reviewer |
| :--- | :--- |
| `storage` | Required to securely save user-configured AI provider settings (provider name, API format, endpoint URL, model selection, and API key) locally on the user's device via `chrome.storage.local`. No credentials leave the browser. |
| `activeTab` | Required to access the active tab when the user clicks the Inspectra toolbar action or interacts with the overlay. |
| `scripting` | Required to programmatically inject the floating UI overlay (`content/overlay.js`) and scanner (`content/scanner.js`) into open web tabs when invoked. |
| `host_permissions` (`http://*/*`, `https://*/*`) | Required for three essential features: (1) injecting the frontend auditor into websites the user chooses to inspect, (2) transmitting structured audit prompts directly to user-configured AI endpoints (e.g. OpenAI, Google Gemini, OpenRouter, or local LLMs), and (3) capturing downscaled screenshots of audited viewports via `chrome.tabs.captureVisibleTab`. |

---

## 5. Chrome Web Store Privacy Disclosures

When completing the **Privacy** tab in the Developer Dashboard, declare the following:

### Single Purpose
- **Description:** "Audits live rendered frontend web pages for UI, UX, and responsive defects and generates structured implementation prompts for developer coding AIs."

### Permissions & Data Usage
- **Does the extension collect or transmit user data?**
  - **Yes, but strictly user-initiated to user-configured endpoints.**
- **Select the data types handled:**
  - ☑ **Website content:** The extension reads rendered DOM element tags, computed styles, and geometry from the page being audited. It transmits this structured evidence exclusively to the user's chosen AI API provider.
  - ☐ **User activity / Browsing history:** NO.
  - ☐ **Personally identifiable information:** NO.
  - ☐ **Authentication credentials / Financial info:** NO.
  - ☐ **Location info:** NO.

### Policy Certifications (Confirm each checkbox)
- ☑ The extension does not sell or transfer user data to third parties outside the approved use cases.
- ☑ The extension does not use or transfer user data for creditworthiness or lending purposes.
- ☑ The extension does not use or transfer user data for targeted advertising.

---

## 6. Release Package

- **File:** `inspectra-release.zip` (Generated via `npm run package`)
- **Package Location:** Root project directory
- **Zip Verification:**
  - `manifest.json` is located at the root of the ZIP.
  - Contains only production compiled assets.
  - No `node_modules`, `.git`, `.env`, or development files.
  - Size: ~97 KB.
