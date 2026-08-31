# Articulation Lab — Stage 2.1

This update addresses issues discovered during desktop and iPhone testing.

## Changes
- Fixes the repeat-recording lifecycle so a new attempt can start without refreshing.
- Replaces punctuation-only sentence analysis with heuristic thought-unit segmentation.
- Adds Suggested Breaks to show conceptual boundaries.
- Adds estimated pause count and average pause length using microphone amplitude.
- Stops interpreting low WPM as proof of long pauses.
- Adds one specific next-round coaching target.
- Adds a “Try again with suggested structure” workflow.
- Preserves Stage 2 local session history by using the same localStorage key.
- Adds idea and pause counts to future saved sessions and comparisons.

## Limits
Thought segmentation and pause detection are heuristic coaching signals. They are not a full semantic AI model or clinical speech/acoustic analysis.

## Deployment
Upload the updated root files (`index.html`, `styles.css`, `app.js`, `manifest.json`, `sw.js`, `README.md`) to the existing `articulation-lab` repository and replace the old versions. Keep/upload the `icons/` directory. Commit the update; GitHub Pages will redeploy automatically.
