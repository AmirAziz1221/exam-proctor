# Exam Proctor

Run locally:  npm install  ->  npm run dev  ->  http://localhost:3000/exam
(Events/clips are saved in a local .data folder when no Blob token is set.)

Review page: http://localhost:3000/review  (no password)

Deploy on Vercel: import repo, add a Blob store (Storage tab) so BLOB_READ_WRITE_TOKEN is set, redeploy.
Tuning: top of lib/proctor.js (TH, HOLD, SEG, MAXSEGS).
