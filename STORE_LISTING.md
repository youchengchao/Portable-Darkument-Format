# Chrome Web Store Publication Listing & Reviewer Manifest

This document contains the official text, metadata, privacy declaration, and reviewer permission justifications for submitting **PDF Dark Mode** to the Chrome Web Store.

---

## 1. Storefront Metadata

### Extension Name
`PDF Dark Mode`

### Short Tagline (Max 132 characters)
`Customizable OLED dark mode viewer for Chrome PDFs with zero white flashes, smart diagram color protection, Bionic reading & notes.`

### Category
`Productivity` / `Developer Tools`

### Language
`English (United States)` / `Traditional Chinese (繁體中文)`

---

## 2. Detailed Storefront Description

```markdown
🚀 **PDF Dark Mode — The S-Tier Reading & Productivity Workspace**

Transform your Chrome PDF reading experience with zero eye strain, zero white screen flashes, and powerful productivity tools built for students, researchers, developers, and power users.

### ✨ Key Features

- **🌙 5 Premium Color Schemes**:
  - **OLED Pure Black**: High-contrast `#000000` designed for dark room reading.
  - **Warm Sepia & Amber**: Soft amber tint that significantly reduces blue light fatigue.
  - **Slate Blue**: Modern deep slate aesthetic matching popular code editors.
  - **Mono Contrast**: Crisp black & white grayscale inversion.
  - **Classic Invert**: Ultra-lightweight native color inversion.

- **⚡ Zero-Flicker Viewport Engine**: Pre-renders dark background viewports so you never experience blinding white screen flashes when opening or scrolling PDFs.

- **🖼️ Smart Image & Diagram Protection**: Automatically detects embedded charts, photos, formulas, and SVG diagrams to preserve their original natural colors instead of creating harsh inverted negatives.

- **📌 Reading Progress Memory**: Automatically saves scroll position, page number, and zoom ratio for every document. Close a 200-page paper and return days later right where you left off.

- **🧠 Bionic Speed Reading**: Emphasizes initial characters of words to guide your eyes for faster reading and concentration on dense research papers and textbooks.

- **📏 Reading Ruler Line Focus Guide**: Movable semi-transparent guide bar following cursor to maintain laser focus during long study sessions.

- **🖍️ Neon Highlighting & Note Exporter**: Highlight text in neon colors, attach personal notes, and export highlights in 1 click to Markdown (`.md`), Plain Text (`.txt`), or Full Document Text (`.txt`).

- **🔍 Dark Find-In-Page Overlay (`Ctrl+F`)**: In-viewer search bar highlighting matches across text layers with Enter/Shift+Enter navigation.

- **🔥 Reading Analytics & Habit Dashboard**: Tracks daily reading time, pages read, and maintains your daily reading streak counter ("🔥 7 Day Streak").

- **☕ 100% Free & Open-Source**: All features are completely free with zero ads, zero tracking, and zero paywalls. Supported by voluntary community donations.

---

### ⚡ Global Keyboard Shortcuts
- `Alt + Shift + D`: Toggle Dark Mode ON/OFF
- `Alt + Shift + B`: Toggle Bionic Reading Mode
- `Alt + Shift + R`: Toggle Reading Ruler Guide
- `Ctrl + F`: Open Dark Find-In-Page Search Bar
- `J` / `K`: Smooth Next / Previous Page Navigation
```

---

## 3. Chrome Web Store Reviewer Permission Justifications

Below are the explicit technical justifications for every permission requested in `manifest.json`:

| Permission | Technical Justification for Web Store Reviewer |
| :--- | :--- |
| **`storage`** | Used to persist user settings (active theme, brightness/contrast sliders, custom domain rules), reading scroll position per PDF URL, highlighted notes, and daily reading stats locally via `chrome.storage.local`. No external data transfer occurs. |
| **`scripting`** | Used to inject lightweight content script (`content.js`) into PDF tab contexts to apply CSS filter inversion when in Classic Mode. |
| **`activeTab`** | Required to detect the active tab URL and apply dark mode filters or display status badges in the extension popup menu. |
| **`webNavigation`** | Used in `background.js` via `chrome.webNavigation.onBeforeNavigate` to intercept PDF URLs (e.g. `file:///` local PDFs or direct `.pdf` web URLs) and seamlessly route them to the enhanced extension viewer (`viewer.html`). |
| **`webRequest`** | Used via `chrome.webRequest.onHeadersReceived` to detect dynamic PDF responses serving `Content-Type: application/pdf` headers, ensuring dynamic PDFs served via web APIs open seamlessly in dark mode. |
| **`alarms`** | Used via `chrome.alarms` to schedule low-overhead periodic checks for the Auto-Night Schedule feature (sunset/sunrise dark mode toggling). |
| **`<all_urls>`** | Required so the extension can apply dark mode styling to PDF documents accessed across any web domain. |
| **`file:///*`** | Required so users can read local PDF files stored on their computer's hard drive in dark mode. |

---

## 4. Privacy Policy Summary

**100% Private & Local Processing**:
- PDF Dark Mode operates **entirely client-side** inside the user's browser.
- **Zero Telemetry / Zero Tracking**: No analytics scripts, tracking pixels, or external API calls are included.
- **Zero Data Collection**: All bookmarks, highlights, reading statistics, and settings remain 100% local on the user's device inside `chrome.storage.local`.
