# FirstRead AI Contract Generator

## Overview

FirstRead is an MVP AI-native contract generator. Users can enter a plain language description of their business context, and the system streams back a **production-ready, styled HTML contract** of 10+ pages, aligned to the request.

The app is designed with **real-time streaming**, **AWS serverless scalability**, and **frontend responsiveness** in mind.

![1755803310986](images/UPDATED_README/1755803310986.png)
![1755803363609](images/UPDATED_README/1755803363609.png)
![1755803438529](images/UPDATED_README/1755803438529.png)

---

## Folder Structure

The repository is organized as follows:

```
.
├── backend/                     # AWS Lambda + SAM backend
│   ├── src/
│   │   ├── generate.mjs         # Lambda entrypoint for contract generation
│   │   ├── prompts.mjs          # Centralized system prompts for quality/legal structure
│   │   └── ...                  # Other backend utilities (helpers, post, etc.)
│   ├── template.yaml            # SAM template (defines Lambda, S3, API Gateway, IAM roles)
│   └── README.md                # Backend-specific notes
│
├── app/                         # Next.js frontend (Vercel-ready, App Router)
│   ├── page.js                  # Main page that wires together components + logic
│   ├── layout.js                # Root layout
│   └── components/              # Organized UI components
│       ├── TopBar.js
│       ├── HistoryDesktop.js
│       ├── HistoryMobile.js
│       ├── Composer.js
│       ├── DesktopPreviewPane.js
│       └── MobilePreviewOverlay.js
│
├── lib/                         # Shared frontend logic/helpers
│   ├── ws.js                    # WebSocket connection helper
│   ├── history.js               # LocalStorage-based history utils
│   ├── sanitize.js              # HTML sanitize & streaming clean-up helpers
│   └── pagination.js            # Pagination split and helpers
│
├── public/
│   └── logo.svg                 # Branding logo
│
├── README.md                    # Main project documentation
└── package.json                 # Root dependencies and scripts
```

This structure separates backend (serverless AI generation pipeline) from frontend (real-time contract drafting UI).

---

## Features

- **Backend (AWS Lambda via SAM):**
  - Streaming AI completions via OpenAI
  - Contract generation with enforced depth and structure
  - Handles token limits, retries, and presigned S3 links
  - Stores completed contracts in S3
  - API Gateway WebSocket for real-time streaming
  - **Production challenges handled:** token limits, API failures, and latency managed via serverless design and retries
- **Frontend (Next.js):**
  - Minimal, responsive UI with textarea, generate/stop, and preview panel
  - Contract streaming with live pagination
  - History rail with saved contracts (S3 presigned fetch) and stored using local-storage since there is no auth
  - Download button exports contracts directly to **Word (.doc)** format
  - Suggestions grid for common contract types

---

## Page Logic in Backend

One of the **core requirements** is that each generated contract must be **10+ pages**.To achieve this, the backend implements **page logic** that maps token/word counts to pages and enforces exact page boundaries.

- **Words per page:** The backend uses a constant of ~510 words per page (`WORDS_PER_PAGE=550`).
- **Target pages:** By default, the system generates at least **10 pages**, but users can select between 3–40 pages via the UI.
- **Markers:** During streaming, the model is instructed to insert explicit markers (`<!--PAGE_BREAK-->`) between pages.
- **Fallbacks:**
  - If markers are missing, the backend heuristically inserts breaks every ~350 words.
  - If the output is shorter than requested pages, a continuation request (appendices) is triggered.
  - If the output exceeds requested pages, it is trimmed to the target count.
- **Font considerations:** The font size and line spacing are standardized in the backend CSS (`11pt/1.5` for HTML, `10.5pt/1.45` for Word export).
  This ensures that the **350 words per page approximation matches the actual printed/Word layout**, making page counts consistent with the 10+ page requirement.

This ensures contracts are **long enough** to meet legal detail requirements, while respecting the user’s requested length.

---

## AWS SSO Configuration

Before deploying or running the backend, configure AWS SSO with a profile (e.g., `firstread-dev`):

```bash
aws configure sso --profile firstread-dev
```

You’ll be prompted for:

- **SSO start URL**
- **SSO region**
- **Account ID**
- **Role name**
- **CLI profile name** (use `firstread-dev`)

Then login:

```bash
aws sso login --profile firstread-dev
```

This must be done before running `sam build`, `sam deploy`, or `sam logs`.

---

* [ ]  Deployment

### Backend (SAM)

```bash
cd backend/src
npm install 
cd ..
sam build
sam deploy --guided --profile firstread-dev
```

After deployment, note:

- API Gateway WebSocket endpoint (eg. wss://your-api-id.execute-api.region.amazonaws.com/stage)
- S3 bucket name
- Lambda function ARN

These are injected into the frontend via environment variables.

### Frontend (Next.js)

Inside the root directory:

```bash
npm install
npm run dev
```

Set environment variables:

```bash
NEXT_PUBLIC_WS_URL=wss://<your-api-id>.execute-api.<region>.amazonaws.com/<stage>
```

Deployable to Vercel or Amplify.

---

## Usage

1. Open the frontend.
2. Enter a plain language prompt, e.g.:

   ```
   Draft Terms of Service for a cloud cyber SaaS company based in New York
   ```
3. Click **Generate**. The contract streams into the right-hand pane.
4. Use the **Download** button to export as `.doc`.

---

## Architecture

- **Frontend:** Next.js (App Router, client components)
- **Backend:** AWS Lambda (Node.js), API Gateway WebSocket, S3, SSM Parameter Store
- **AI:** OpenAI GPT models with system prompts enforcing structure and consistency

---

## Tradeoffs

- Page count normalization ensures contracts are long enough, but could trim/tail if the model under/overshoots.
- Real-time WebSocket streaming chosen over HTTP for responsiveness.
- Contracts expire in S3 (presigned URLs); users can re-request presigned links from history.

---

## Example

Prompt:

```
Draft terms of service for a cloud cyber SaaS company based in New York
```

Output:

- 10+ page HTML contract
- Section numbering (1., 1.1., 1.1.1…)
- Ownership & Content clauses with depth and examples
- Exportable to Word


## Improvements

Over the course of development, several areas for improvement have been identified to make the system more robust, consistent, and user-friendly. These touch on page control, content quality, model experimentation, and resilience.

### 1. Words-per-Page Enforcement

Originally, page counts were loosely based on estimated word counts (≈350–550 words). This caused inconsistencies such as pages with **340 words or 590 words**, leading to uneven document lengths.We improved this by:

- Implementing **strict word-budget slicing**: every page is capped at the configured `WORDS_PER_PAGE` (default 550).
- Introducing **precise HTML tokenization** that splits content while respecting tags, ensuring pages break at logical points without corrupting the markup.
- Guaranteeing that all generated contracts have a **consistent number of words per page**, making output more predictable and aligned with the “10+ pages” requirement.

### 2. Content Quality Improvements

While initial drafts were structurally correct, content depth varied. Improvements included:

- Adding **top-up generation** logic: if a document does not reach the minimum word/page requirement, the system asks the model to generate **appendices, elaborations, or examples** to fill gaps.
- Enforcing **structured depth** in clauses (e.g., detailed Ownership & Content subsections, Acceptable Use examples, etc.) so the model outputs more comprehensive text.
- Normalizing output styles with **consistent typography and CSS** for readability in both web previews and Word exports.

### 3. Experimenting with Different Models

Different OpenAI models handle legal-style generation differently:

- **Larger models** (e.g., GPT-4.1) provide richer content but sometimes overshoot token budgets, leading to **empty or truncated pages**.
- **Smaller/faster models** generate text more efficiently but may produce less detailed legal clauses.
  To mitigate this:
- We built a **retry-and-fallback system** with exponential backoff.
- If the primary model fails, the system retries or falls back to a more conservative model while preserving user prompts and target pages.
- This ensures content is generated reliably even under latency spikes or API quota issues.

### 4. Other Improvements

- **Resilience**: Added robust error handling for API failures, token overruns, and context length errors. The system now trims conversation context intelligently and retries safely.
- **User Experience**: Skeleton loaders were added to prevent empty previews during generation. Pagination controls allow users to **browse one page at a time**, matching the strict word budgets.
- **History Management**: Documents are saved in S3 with presigned links, and a lightweight local history (using localStorage) enables quick retrieval even without authentication.
- **Export Fidelity**: Word export templates now ensure that fonts and spacing match the enforced word-per-page settings, keeping visual consistency between the web preview and `.doc` downloads.

---

These improvements make the system **more consistent, reliable, and user-friendly**, while ensuring compliance with the MVP requirement of generating well-structured 10+ page contracts.

## Credits

Built as an MVP by Richard Obiri (FirstRead).
