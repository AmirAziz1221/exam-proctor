"use client";
import { useEffect, useState } from "react";

const LABEL = { gaze_away: "Looking away", no_face: "Face not visible", multiple_faces: "Multiple faces", tab_hidden: "Tab switched", window_blur: "Window lost focus", fullscreen_exit: "Left fullscreen", clipboard: "Copy/paste/right-click" };
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function Player({ clips }) {
  const [i, setI] = useState(0);
  if (!clips?.length) return <span className="mut">no clip</span>;
  return (
    <div>
      <video key={i} src={clips[i]} controls autoPlay muted playsInline width={260} onEnded={() => setI((x) => (x + 1 < clips.length ? x + 1 : 0))} />
      <div className="mut" style={{ fontSize: 12 }}>part {i + 1}/{clips.length} (auto-plays in sequence)</div>
    </div>
  );
}

export default function Review() {
  const [evs, setEvs] = useState(null), [err, setErr] = useState("");
  async function load() {
    const r = await fetch("/api/events", { cache: "no-store" });
    if (!r.ok) { const j = await r.json().catch(() => ({})); return setErr(j.error || "Could not load events"); }
    setErr(""); setEvs(await r.json());
  }
  useEffect(() => { load(); }, []);
  const by = {};
  (evs || []).forEach((e) => { (by[e.sessionId] ||= { student: e.student, list: [] }).list.push(e); });

  return (
    <main>
      <div className="card">
        <h1>Review flagged moments</h1>
        <button onClick={load}>Refresh</button> {err && <span className="bad">{err}</span>}
      </div>
      {evs && !evs.length && <p className="mut">No flags recorded.</p>}
      {Object.entries(by).map(([sid, s]) => (
        <div className="card" key={sid}>
          <h3>{s.student} <span className="mut">— {s.list.length} flags, {Math.round(s.list.reduce((a, e) => a + e.durationMs, 0) / 1000)}s total</span></h3>
          <table>
            <thead><tr><th>Exam time</th><th>Type</th><th>Length</th><th>Clip</th></tr></thead>
            <tbody>
              {s.list.map((e) => (
                <tr key={e.id}>
                  <td>{mmss(e.offsetSec)}<div className="mut" style={{ fontSize: 12 }}>{new Date(e.start).toLocaleTimeString()}</div></td>
                  <td>{LABEL[e.type] || e.type}</td>
                  <td>{(e.durationMs / 1000).toFixed(1)}s</td>
                  <td><Player clips={e.clips} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </main>
  );
}
