# Exam Proctor

A web-based exam proctoring system. While a student takes a test, it watches the webcam, detects suspicious behaviour (mainly **looking away from the screen**), shows a warning, and saves the time and a short video clip of every flagged moment so a reviewer only has to watch those clips.

> Flags are evidence for a human reviewer, **not proof of cheating**. Never fail a student automatically based on flags alone.

## Features

- **Eye + head tracking** (MediaPipe Face Landmarker) with automatic 3-second calibration per student
- Detects: looking away, face not visible, multiple faces, tab switching, window losing focus, leaving fullscreen, copy/paste/right-click
- Live on-screen warnings with a running flag count
- Automatic clips: about 4 s before + the event + about 4 s after
- Reviewer page: flags grouped by student, with exam time, type, length and clip playback
- Runs in the browser, so it works on Vercel without any video server
- Fast start: the model preloads while the student types their name

## How it works

1. The student opens `/exam`, enters a name, and starts. The camera and fullscreen are requested.
2. Calibration records where the student's eyes and head point when looking at the screen.
3. About 10 times per second the browser checks eye direction and head yaw/pitch against that baseline.
4. A condition must last long enough (for example 1.5 s for looking away) before it becomes a flag. This ignores normal glances and blinks.
5. Rolling 4-second video segments are kept; when a flag closes, its segments are uploaded and the event is saved.
6. On submit, all uploads finish first, then a **Review** button opens `/review`.

## Tech stack

Next.js 14 (App Router), React 18, MediaPipe Tasks Vision 0.10.14, Browser MediaRecorder, Vercel Blob, deployed on Vercel.

## Project structure

```
lib/proctor.js          proctoring engine (browser): tracking, flags, clip recorder, uploads
lib/store.js            storage helpers (Vercel Blob or local .data folder)
app/exam/page.js        student exam page
app/review/page.js      reviewer page
app/api/upload/         issues upload tokens for clips
app/api/event/          saves one event
app/api/events/         lists all events
app/api/local/          local-only clip storage (testing)
```

## Run locally

Requirements: Node.js 18+, Chrome or Edge, a webcam.

```bash
npm install
npm run dev
```

Open http://localhost:3000/exam, allow the camera, take the test, look away for about 2 seconds (or switch tabs), click **Submit exam**, then **Review**.

With no Blob token, events and clips are saved in a local `.data` folder (delete it to clear test data).

## Deploy (GitHub + Vercel)

1. Push the project to GitHub (`git add .`, `git commit`, `git push`).
2. In Vercel: **Add New -> Project**, import the repository, **Deploy**.
3. In the project's **Storage** tab, create a **Blob** store with **Public** access and connect it to the project (this adds `BLOB_READ_WRITE_TOKEN`).
4. **Redeploy** so the token takes effect.
5. Students: `https://<your-project>.vercel.app/exam` Reviewers: `/review`

## Configuration

Tuning values are at the top of `lib/proctor.js`:

| Constant | Default | Purpose |
|---|---|---|
| `TH.h`, `TH.v` | 0.5, 0.55 | Allowed eye-direction deviation from baseline |
| `TH.yaw`, `TH.pitch` | 25, 20 degrees | Allowed head turn/tilt |
| `HOLD.gaze_away` | 1500 ms | Time before looking away becomes a flag |
| `HOLD.no_face` | 2500 ms | Time before a missing face becomes a flag |
| `SEG`, `MAXSEGS` | 4000 ms, 8 | Clip segment length and maximum segments per clip |

Change one value at a time and test with several people, with and without glasses.

## Limitations

- Exam **answers are not saved** (sample questions are hard-coded in `app/exam/page.js`)
- **No login**: the review page and `/api/events` are open to anyone with the link
- Blob links are unguessable but technically **public**
- Thresholds are untested starting values; glasses, dim light and distance reduce accuracy
- Browser-side checks can be bypassed (second device, virtual camera); no audio or phone detection
- Check privacy and consent requirements for recording students in your region

## Troubleshooting

| Problem | Fix |
|---|---|
| Camera does not start | Use Chrome/Edge, click Allow, close other camera apps, use `https://` on Vercel |
| "Face not detected" | Improve lighting, face the camera, move closer |
| Review shows a token error | Create/connect a Blob store, then redeploy |
| Uploads rejected | The Blob store must be **Public** |
| Changes not showing locally | Restart `npm run dev` |

## Research basis

- Gupta, Sharma, Tripathi - *Tracking Eye Movement Using Facial Keypoints and Image Processing* (2023)
- Belmonte et al. - *Impact of Facial Landmark Localization on Facial Expression Recognition* (IEEE T-AFFC)
- Iskra, Gabrijelcic Tomc - *Eye-tracking analysis of face observing and face recognition* (2016)

Full details are in `Exam-Proctor-Documentation.pdf`.

## Roadmap

Student login and saved answers, reviewer login and private storage, audio and phone detection, reviewer workflow (confirm/dismiss, notes, reports), risk scores.