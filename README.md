# Articulation Lab — Stage 2.2

Stage 2.2 is a reliability and coaching-intelligence update based on desktop, iPhone, and independent-user testing.

## Fixes and changes

### Recording lifecycle
- Adds an explicit **New recording** action after a completed recording.
- A new recording always clears old playback and restores the visible **LIVE** camera preview before recording can begin.
- **Retry same prompt** uses the same reliable reset path.
- The recording state is labeled `LIVE`, `LIVE · RECORDING`, or `PLAYBACK` so the user can tell what the video element is showing.
- Uses a browser-supported MediaRecorder MIME type when possible.

### Hierarchical speech structure
- Separates **Main Ideas** from **Supporting Thought Units**.
- Merges short grammatical fragments instead of counting every fragment as an independent idea.
- Suggested structure is rendered hierarchically:
  - Main idea
    - Supporting thought
    - Supporting thought
- Structure remains separate from delivery quality.

### Pause reliability
- Pause analysis no longer reports `0 pauses` when timing capture is insufficient.
- It reports **Unavailable** when the audio-boundary signal is not reliable.
- WPM is never used as proof that the speaker left long gaps.
- Pause evidence is used only when capture passes a basic reliability check.

### Coaching
- Meaning/organization and delivery are diagnosed separately.
- Analysis confidence is shown separately for semantic and delivery evidence.
- The next-round target is selected from the weakest **reliable** signal.

## Existing history
Stage 2.2 keeps the existing `articulationLabSessionsV3` localStorage key so earlier sessions remain available on the same browser/device. Older sessions will not have Stage 2.2-only fields.

## Acceptance tests
1. Record → Stop → **New recording** → confirm LIVE camera preview returns without refresh.
2. Start the second recording and confirm the preview stays live while recording.
3. Analyze a response containing grammatical fragments and verify they are not all counted as separate main ideas.
4. If pause timing cannot be captured reliably, confirm the app shows **Unavailable**, not `0`.
5. Compare a Stage 2.2 session with an older session without errors.

## Deployment
Upload/replace these root files in the existing `articulation-lab` repository:
- `index.html`
- `styles.css`
- `app.js`
- `manifest.json`
- `sw.js`
- `README.md`

The existing icons can remain unchanged. Commit the update and GitHub Pages will redeploy automatically.
