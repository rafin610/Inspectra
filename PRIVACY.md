# Privacy Policy for Inspectra — Frontend AI Auditor

**Effective Date:** October 5, 2026  
**Last Updated:** October 5, 2026

Inspectra ("we", "our", or "the extension") is a developer productivity Chrome Extension designed to analyze rendered webpage frontends and generate implementation-ready prompts for coding AIs.

We are committed to user privacy and data minimization. Inspectra operates entirely client-side on your device. We do not operate any tracking servers, analytics services, or proprietary backend APIs.

---

### 1. Information Handled by Inspectra

Inspectra only processes data when you explicitly request a frontend scan or autonomous audit:

1. **Rendered Frontend Elements & Layout Geometry:**
   - Tag names, computed CSS style properties, bounding box dimensions, and semantic roles of visible webpage elements (up to ~220 elements).
   - Geometric layout signals (e.g., detected overflow, element overlaps, contrast ratios, and touch target sizes).
   - Page URL and document title for the audited page.

2. **Visual Screenshot Evidence (Optional):**
   - If enabled in Settings (enabled by default), Inspectra captures a downscaled, compressed JPEG screenshot of the visible viewport of the active tab. This is sent directly to your configured AI provider as visual context. You can disable screenshots at any time in Settings.

3. **AI Provider Credentials & Settings:**
   - Your API format choice, base endpoint, selected model, and API key.
   - These credentials are stored strictly on your local machine using Chrome's secure storage (`chrome.storage.local`). They are never synchronized to any cloud server operated by Inspectra.

---

### 2. Information Inspectra NEVER Collects

- **No Passwords or Sensitive Input:** Form inputs of type `password`, `email`, `tel`, `number`, or `credit-card` are explicitly excluded from data collection.
- **No Cookies or Authentication Tokens:** Cookies, session storage, authorization headers, and credential cookies are never inspected, accessed, or transmitted.
- **No Browsing History:** We do not track websites you visit, browsing patterns, search queries, or background tabs.
- **No Analytics or Telemetry:** There are no analytics libraries, crash reporters, or tracking pixels bundled in Inspectra.

---

### 3. How Data is Transmitted

Inspectra has **no backend server**.

When you trigger a scan:
- Webpage analysis evidence is packaged into a structured prompt.
- The prompt (and optional downscaled screenshot) is sent directly from your browser to your configured AI endpoint (such as Google Generative AI, OpenAI, OpenRouter, or your own local/custom LLM server) using encrypted HTTPS.
- Your API key is used strictly for authentication directly with your chosen provider.

---

### 4. Data Retention and Storage

- All user settings and provider API keys are stored solely on your local device via `chrome.storage.local`.
- Inspectra does not retain scan history. Once you close or reload the extension panel, audit results are discarded from browser memory.
- You can remove your API keys or delete configured providers at any time directly in Settings.

---

### 5. Third-Party Services

When you use Inspectra with a third-party AI provider (such as Google Gemini or OpenAI), the transmission of audit prompts to that provider is governed by their respective privacy policies and terms of service:
- Google Generative AI / Gemini API Privacy Policy
- OpenAI API Data Privacy Policy

---

### 6. Chrome Web Store Compliance

Inspectra complies fully with the Chrome Web Store Developer Program Policies, including the Single Purpose Policy and Limited Use Requirements:
- Inspectra does not sell user data.
- Inspectra does not use user data for advertising, credit scoring, or data brokering.
- Inspectra requests only the minimal necessary permissions (`activeTab`, `scripting`, `storage`, and `http://*/*`, `https://*/*`).

---

### 7. Contact & Support

If you have questions regarding this Privacy Policy or Inspectra, please open an issue on the project GitHub repository:  
https://github.com/rafin610/Inspectra
