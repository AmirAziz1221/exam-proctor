"use client";
import { useEffect, useRef, useState } from "react";
import { Proctor, loadModel } from "../../lib/proctor";

// Replace with your real questions (or fetch them from your own API).
const QS = [
  { q: "What is 12 × 12?", o: ["124", "144", "148", "132"] },
  { q: "Which planet is closest to the Sun?", o: ["Venus", "Earth", "Mercury", "Mars"] },
  { q: "HTML stands for?", o: ["HyperText Markup Language", "High Tech Modern Language", "Hyperlink Text Mode Language", "None"] },
];

export default function Exam() {
  const vid = useRef(), pr = useRef();
  const [phase, setPhase] = useState("intro");
  const [name, setName] = useState("");
  const [warn, setWarn] = useState(null);
  const [flags, setFlags] = useState(0);
  const [ans, setAns] = useState({});
  const [err, setErr] = useState("");

  useEffect(() => { loadModel().catch(() => {}); }, []); // preload model while student types their name
  useEffect(() => { if (!warn) return; const t = setTimeout(() => setWarn(null), 4000); return () => clearTimeout(t); }, [warn]);

  async function start() {
    setErr("");
    try {
      document.documentElement.requestFullscreen?.().catch(() => {});
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 15 } });
      vid.current.srcObject = stream;
      await vid.current.play();
      const p = new Proctor({
        video: vid.current, stream, sessionId: crypto.randomUUID(), student: name.trim(),
        onWarn: (m, n) => { setWarn(m); setFlags(n); },
      });
      pr.current = p;
      setPhase("calibrating");
      await p.start();
      await p.calibrate(3000);
      setPhase("exam");
    } catch (e) {
      setErr(e.message || "Could not start camera");
      setPhase("intro");
    }
  }

  async function submit() {
    setPhase("saving");
    await pr.current.stop();
    pr.current.stream.getTracks().forEach((t) => t.stop());
    document.exitFullscreen?.().catch(() => {});
    setPhase("done");
  }

  return (
    <main>
      <video ref={vid} className="cam" muted playsInline style={{ display: phase === "intro" || phase === "done" ? "none" : "block" }} />
      {warn && <div className="warn">⚠ {warn} (flag {flags})</div>}
      {phase === "calibrating" && <div className="ov"><div><h2>Look at the centre of your screen</h2><p>Calibrating for 3 seconds…</p></div></div>}

      {phase === "intro" && (
        <div className="card">
          <h1>Online exam</h1>
          <p className="mut">This exam is proctored. Your camera is analysed in your browser to detect looking away, missing face, extra people, tab switching and copy/paste. Short clips around flagged moments are saved for the reviewer. Use a well-lit room and face the camera.</p>
          <p><input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} /></p>
          {err && <p className="bad">{err}</p>}
          <button disabled={name.trim().length < 2} onClick={start}>I agree — start exam</button>
        </div>
      )}

      {phase === "exam" && (
        <>
          {QS.map((q, i) => (
            <div className="card" key={i}>
              <b>{i + 1}. {q.q}</b>
              {q.o.map((o) => (
                <label key={o}><input type="radio" name={"q" + i} checked={ans[i] === o} onChange={() => setAns({ ...ans, [i]: o })} /> {o}</label>
              ))}
            </div>
          ))}
          <button onClick={submit}>Submit exam</button>
        </>
      )}

      {phase === "saving" && <div className="card">Saving your exam…</div>}
      {phase === "done" && <div className="card"><h2>Submitted</h2><p className="mut">Flags recorded: {flags}</p><a href="/review"><button>Review</button></a></div>}
    </main>
  );
}
