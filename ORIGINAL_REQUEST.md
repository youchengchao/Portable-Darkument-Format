# Original User Request

## Initial Request — 2026-07-22T18:12:39Z

Upgrade the PDF Dark Mode Chrome extension by implementing four new features: Custom Preference Profiles, a GitHub-style Reading Heatmap, a Multi-Tab Workspace in the viewer, and a Text-to-Speech (TTS) Narration panel with synchronized highlighting.

Working directory: C:\src\pdf-dark
Integrity mode: development

## Requirements

### R1. Custom Preference Profiles
- Allow users to save their current adjustment settings (Theme, Brightness, Contrast, Grayscale, Reading Ruler height, Bionic Reading state) as a named profile (e.g. "Late Night Reading", "Sunny Study").
- Users should be able to create new profiles, select and apply saved profiles, and delete profiles from the popup UI.

### R2. GitHub-style Reading Heatmap
- In the "Stats" tab of the popup, render a grid representing a 12-month calendar (or a detailed multi-week contribution matrix) of reading history.
- The intensity of the color in each cell should reflect the reading time (minutes or pages) for that day, using shades of the theme color (or green/gold depending on the user's supporter status).

### R3. Multi-Tab PDF Workspace
- In the Enhanced Mode viewer (based on PDF.js), add a tab bar at the top that supports opening multiple PDF files.
- Selecting a tab switches the active document in the viewer without reloading the extension.
- Each tab should independently preserve its reading position (scroll/page) and bookmarks.

### R4. Text-to-Speech (TTS) Narration
- Provide a voice reader utility in the viewer.
- Users can highlight text or click a play button to read the page content aloud using the browser's SpeechSynthesis API.
- Highlight/outline the active sentence or phrase being read in real-time.

## Acceptance Criteria

### Preference Profiles
- [ ] A profile selection dropdown and "Save Profile" / "Delete Profile" buttons exist in the settings popup.
- [ ] Saving a profile stores it in `chrome.storage.local`. Loading a profile successfully applies all saved brightness, contrast, grayscale, ruler, and theme settings.

### Reading Heatmap
- [ ] A visual grid exists in the Stats tab, displaying at least the past 30 days (up to 12 months) of daily reading activity.
- [ ] Cells display different color intensities based on the stored daily reading minutes.

### Multi-Tab Workspace
- [ ] Tab navigation controls are visible in `viewer.html` when multiple PDFs are loaded.
- [ ] Switching tabs updates the PDF view to the selected file, retaining the scroll position of the previous file when switching back.

### Text-to-Speech (TTS)
- [ ] A TTS player control panel (Play/Pause/Stop/Speed control) is integrated into `viewer.html`.
- [ ] Clicking Play reads the text, and the reading cursor/highlight matches the text being spoken.
