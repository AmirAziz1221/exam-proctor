// Browser-side proctoring engine: face/eye/head tracking + rolling clip recorder.
import { upload } from "@vercel/blob/client";

// ---- Tunable config (values are deviations from the student's own calibrated baseline) ----
const TH = { h: 0.5, v: 0.55, yaw: 25, pitch: 20 };            // eye-H, eye-V (0..1), head yaw/pitch (deg)
const HOLD = { gaze_away: 1500, no_face: 2500, multiple_faces: 1500 }; // ms before an event opens
const GRACE = 700;      // ms the condition must be gone before an event closes
const SEG = 4000;       // clip segment length (ms)
const MAXSEGS = 8;      // max ~32s per event clip
const MSG = {
  gaze_away: "Please keep your eyes on the screen.",
  no_face: "Your face is not visible. Please face the camera.",
  multiple_faces: "More than one person detected.",
  tab_hidden: "Do not switch tabs.",
  window_blur: "Please stay in the exam window.",
  fullscreen_exit: "Please return to fullscreen.",
};

let lmPromise;
export function loadModel() {
  if (!lmPromise) lmPromise = (async () => {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fs = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
    const o = (delegate) => ({
      baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate },
      runningMode: "VIDEO", numFaces: 2, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
    });
    try { return await FaceLandmarker.createFromOptions(fs, o("GPU")); }
    catch { return await FaceLandmarker.createFromOptions(fs, o("CPU")); }
  })();
  return lmPromise;
}

function readSignals(r) {
  const faces = r.faceLandmarks?.length || 0;
  if (!faces) return { faces: 0 };
  const m = {};
  for (const c of r.faceBlendshapes?.[0]?.categories || []) m[c.categoryName] = c.score;
  const h = ((m.eyeLookOutRight + m.eyeLookInLeft) - (m.eyeLookOutLeft + m.eyeLookInRight)) / 2;
  const v = ((m.eyeLookUpLeft + m.eyeLookUpRight) - (m.eyeLookDownLeft + m.eyeLookDownRight)) / 2;
  const t = r.facialTransformationMatrixes?.[0]?.data;
  let yaw = 0, pitch = 0;
  if (t) {
    yaw = Math.atan2(t[8], t[10]) * 180 / Math.PI;
    pitch = Math.asin(Math.max(-1, Math.min(1, -t[9]))) * 180 / Math.PI;
  }
  return { faces, h: h || 0, v: v || 0, yaw, pitch };
}

export class Proctor {
  constructor({ video, stream, sessionId, student, onWarn }) {
    Object.assign(this, { video, stream, sessionId, student, onWarn });
    this.base = { h: 0, v: 0, yaw: 0, pitch: 0 };
    this.ring = []; this.ev = {}; this.cond = {}; this.pending = [];
    this.warnings = 0; this.running = false; this.cal = null; this.t0 = Date.now();
  }

  async start() {
    this.lm = await loadModel();
    this.running = true;
    this.mime = ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
    this.ext = this.mime.includes("mp4") ? "mp4" : "webm";
    this.cycle();
    this.bind();
    this.loop();
  }

  calibrate(ms) {
    this.cal = [];
    return new Promise((res, rej) => setTimeout(() => {
      const a = this.cal; this.cal = null;
      if (a.length < 8) return rej(new Error("Face not detected. Check lighting and camera position."));
      const med = (k) => a.map((s) => s[k]).sort((x, y) => x - y)[a.length >> 1];
      this.base = { h: med("h"), v: med("v"), yaw: med("yaw"), pitch: med("pitch") };
      res();
    }, ms));
  }

  loop = () => {
    if (!this.running) return;
    const v = this.video;
    if (v.readyState >= 2 && v.currentTime !== this.lastT) {
      this.lastT = v.currentTime;
      try { this.step(readSignals(this.lm.detectForVideo(v, performance.now()))); } catch {}
    }
    setTimeout(this.loop, 90); // ~10 checks/sec is plenty for 1.5s hold rules
  };

  step(s) {
    const now = Date.now();
    if (this.cal) { if (s.faces === 1) this.cal.push(s); return; }
    let away = false;
    if (s.faces === 1) {
      const d = (k) => Math.abs(s[k] - this.base[k]);
      away = d("h") > TH.h || d("v") > TH.v || d("yaw") > TH.yaw || d("pitch") > TH.pitch;
    }
    this.track("no_face", s.faces === 0, now);
    this.track("multiple_faces", s.faces > 1, now);
    this.track("gaze_away", away, now);
  }

  track(type, on, now) {
    const c = this.cond[type] || (this.cond[type] = { since: null, off: null });
    if (on) {
      c.off = null;
      if (c.since == null) c.since = now;
      if (!this.ev[type] && now - c.since >= HOLD[type]) this.open(type, c.since);
    } else {
      c.since = null;
      if (this.ev[type]) {
        if (c.off == null) c.off = now;
        else if (now - c.off >= GRACE) this.close(type, c.off);
      }
    }
  }

  flag(type, on) { // instant (no hold) conditions
    if (!this.running || this.cal) return;
    const now = Date.now();
    if (on && !this.ev[type]) this.open(type, now);
    else if (!on && this.ev[type]) this.close(type, now);
  }

  open(type, start) {
    this.ev[type] = { id: crypto.randomUUID(), type, start, segs: [...this.ring], closing: false };
    this.warnings++;
    this.onWarn?.(MSG[type] || "Suspicious activity", this.warnings);
  }
  close(type, end) { const e = this.ev[type]; if (e) { e.end = end; e.closing = true; } }

  // ---- rolling clip recorder: 4s standalone segments; event clip = pre-roll + event + post-roll ----
  cycle() {
    if (!this.running || !this.mime) return;
    const mr = new MediaRecorder(this.stream, { mimeType: this.mime, videoBitsPerSecond: 350000 });
    const ch = [];
    mr.ondataavailable = (e) => e.data.size && ch.push(e.data);
    mr.onstop = () => this.onSeg(new Blob(ch, { type: this.mime.split(";")[0] }));
    mr.start();
    setTimeout(() => { if (mr.state !== "inactive") mr.stop(); this.cycle(); }, SEG);
  }

  onSeg(blob) {
    this.ring = [...this.ring, blob].slice(-1); // 1 segment (~4s) of pre-roll
    for (const e of Object.values(this.ev)) {
      e.segs.push(blob);
      if (e.closing || e.segs.length >= MAXSEGS) this.finish(e);
    }
  }

  finish(e) {
    if (this.ev[e.type] === e) delete this.ev[e.type];
    const end = e.end || Date.now();
    const job = (async () => {
      const urls = await Promise.all(e.segs.map((b, i) => this.up(b, `${e.id}-${i}.${this.ext}`)));
      await this.post({ id: e.id, type: e.type, start: e.start, end, durationMs: end - e.start, offsetSec: Math.round((e.start - this.t0) / 1000), clips: urls.filter(Boolean) });
    })();
    this.pending.push(job);
  }

  async up(blob, name) {
    try {
      const r = await upload(`clips/${this.sessionId}/${name}`, blob, { access: "public", handleUploadUrl: "/api/upload", clientPayload: this.sessionId });
      return r.url;
    } catch {
      try { // local fallback (no Blob token configured)
        const r = await fetch(`/api/local?name=${this.sessionId}-${name}`, { method: "POST", body: blob });
        return r.ok ? (await r.json()).url : null;
      } catch { return null; }
    }
  }

  post(ev) {
    return fetch("/api/event", {
      method: "POST", keepalive: true, headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...ev, sessionId: this.sessionId, student: this.student }),
    }).catch(() => {});
  }

  bind() {
    this.h = {
      vis: () => this.flag("tab_hidden", document.hidden),
      blur: () => { clearTimeout(this.bt); this.bt = setTimeout(() => this.flag("window_blur", true), HOLD.gaze_away + 500); },
      focus: () => { clearTimeout(this.bt); this.flag("window_blur", false); },
      fs: () => this.flag("fullscreen_exit", !document.fullscreenElement),
      block: (e) => { e.preventDefault(); if (this.running && !this.cal) this.post({ id: crypto.randomUUID(), type: "clipboard", start: Date.now(), end: Date.now(), durationMs: 0, offsetSec: Math.round((Date.now() - this.t0) / 1000), clips: [] }); },
    };
    document.addEventListener("visibilitychange", this.h.vis);
    window.addEventListener("blur", this.h.blur);
    window.addEventListener("focus", this.h.focus);
    document.addEventListener("fullscreenchange", this.h.fs);
    ["copy", "paste", "cut", "contextmenu"].forEach((t) => document.addEventListener(t, this.h.block));
  }

  async stop() {
    this.running = false;
    document.removeEventListener("visibilitychange", this.h.vis);
    window.removeEventListener("blur", this.h.blur);
    window.removeEventListener("focus", this.h.focus);
    document.removeEventListener("fullscreenchange", this.h.fs);
    ["copy", "paste", "cut", "contextmenu"].forEach((t) => document.removeEventListener(t, this.h.block));
    for (const e of Object.values(this.ev)) { e.end = e.end || Date.now(); this.finish(e); }
    await Promise.all(this.pending);
  }
}
