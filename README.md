# Articulation Lab — Stage 2 PWA

This is the Progressive Web App version of Articulation Lab.

## Included
- Responsive iPhone + desktop interface
- Camera and microphone recording
- Browser speech transcription when supported
- Local transcript analysis
- WPM, filler-word, sentence-length, and structure checks
- Self-review scores
- Saved local session history
- Progress dashboard
- Session comparison
- PWA manifest
- Offline service worker
- Home-screen install support
- GitHub Pages-ready project structure

## Files
- `index.html` — app interface
- `styles.css` — visual design
- `app.js` — app logic
- `manifest.json` — installable PWA metadata
- `sw.js` — offline caching/service worker
- `icons/` — app icons

## Run locally
Camera/microphone and service workers generally require HTTPS or localhost.
For development, use a local web server rather than opening `index.html` directly.

Example with Python:

```bash
python3 -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## Deploy with GitHub Pages
1. Create a new GitHub repository, e.g. `articulation-lab`.
2. Upload all files and folders from this project.
3. Commit them to the `main` branch.
4. In GitHub: **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Choose `main` and `/ (root)`.
7. Save.
8. GitHub will provide an HTTPS site URL.

## Install on iPhone
After deployment:
1. Open the GitHub Pages URL in Safari.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Name it `Articulation Lab`.
5. Tap **Add**.

The app will then launch from the iPhone Home Screen in standalone mode.

## Current storage
Session history is stored with browser `localStorage`.
It stays on the current device/browser only.

Stage 3 should replace local-only storage with authentication + cloud sync (for example, Supabase).

## Important browser note
Live SpeechRecognition support differs by browser and iOS version. Recording can still work even when live transcription is unavailable; the transcript field remains editable.
