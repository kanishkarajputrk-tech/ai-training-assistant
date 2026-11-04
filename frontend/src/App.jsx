import { useEffect, useState } from "react";
import Avatar from "./Avatar";
import "./App.css";

const API = "http://127.0.0.1:8000";

// Rough time to speak a narration aloud (about 2.5 words per second).
// In Stage 5 this is replaced by the real length of the audio.
function speakingTime(text) {
  const words = text.trim().split(/\s+/).length;
  return Math.max(3000, (words / 2.5) * 1000);
}

function describeError(err) {
  // fetch() throws a TypeError when the server can't be reached at all
  if (err instanceof TypeError) {
    return "Can't reach the backend. Start it with: python -m uvicorn main:app --reload (run inside the backend folder).";
  }
  return err.message;
}

export default function App() {
  const [backendUp, setBackendUp] = useState(true);
  const [chunks, setChunks] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lesson, setLesson] = useState(null);

  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  const steps = lesson && lesson.found ? lesson.steps : [];
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  // Ask the backend how much material is stored
  async function refreshHealth() {
    try {
      const res = await fetch(`${API}/health`);
      const data = await res.json();
      setChunks(data.chunks_stored);
      setBackendUp(true);
    } catch {
      setBackendUp(false);
    }
  }

  useEffect(() => {
    refreshHealth();
  }, []);

  // While "playing", move to the next step after the narration time is up
  useEffect(() => {
    if (!playing || !step) return;
    const timer = setTimeout(() => {
      if (isLast) setPlaying(false);
      else setStepIndex((i) => i + 1);
    }, speakingTime(step.narration));
    return () => clearTimeout(timer);
  }, [playing, stepIndex, step, isLast]);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg("");
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API}/upload`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      setUploadMsg(`Added ${data.chunks_added} sections from ${data.filename}.`);
      refreshHealth();
    } catch (err) {
      setUploadMsg(`Upload failed. ${describeError(err)}`);
    } finally {
      setUploading(false);
      e.target.value = ""; // lets you pick the same file again
    }
  }

  async function startLesson(e) {
    e.preventDefault();
    if (!topic.trim() || loading) return;
    setLoading(true);
    setError("");
    setLesson(null);
    setPlaying(false);
    setStepIndex(0);
    setShowAnswer(false);
    try {
      const res = await fetch(`${API}/teach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not create the lesson");
      setLesson(data);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }

  function togglePlay() {
    if (playing) {
      setPlaying(false);
    } else {
      if (isLast) setStepIndex(0);
      setPlaying(true);
    }
  }

  function goTo(index) {
    setPlaying(false);
    setStepIndex(index);
  }

  return (
    <div className="room">
      <aside className="library">
        <h1>AI Training Assistant</h1>

        <section>
          <h2>Training material</h2>
          <p className={backendUp ? "status" : "status status-bad"}>
            {!backendUp
              ? "The backend is not running."
              : chunks === null
              ? "Checking…"
              : `${chunks} sections stored`}
          </p>
          <label className="btn btn-secondary file-btn">
            {uploading ? "Reading the PDF…" : "Upload a PDF"}
            <input
              type="file"
              accept="application/pdf"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
          {uploadMsg && <p className="note">{uploadMsg}</p>}
        </section>

        <form onSubmit={startLesson}>
          <h2>Lesson topic</h2>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="A topic from your PDF"
            aria-label="Lesson topic"
          />
          <button className="btn btn-primary" disabled={loading || !topic.trim()}>
            {loading ? "Preparing…" : "Start lesson"}
          </button>
        </form>

        <p className="footnote">Runs on this computer. Nothing is sent online.</p>
      </aside>

      <main className="stage">
        {loading && (
          <p className="message">
            Preparing your lesson. The first one can take up to a minute while the
            model loads.
          </p>
        )}

        {!loading && error && <p className="message message-bad">{error}</p>}

        {!loading && !error && !lesson && (
          <p className="message">
            The board is empty. Upload a PDF, enter a topic, and the instructor
            will teach it here.
          </p>
        )}

        {!loading && lesson && !lesson.found && (
          <p className="message">
            The uploaded material doesn’t cover “{lesson.topic}”. Try a topic from
            your PDF, or upload more material.
          </p>
        )}

        {!loading && step && (
          <>
            <div className="board" key={stepIndex}>
              <h2 className="board-title">{step.title}</h2>
              <ul className="board-points">
                {step.board.map((point, i) => (
                  <li key={i} style={{ animationDelay: `${0.5 + i * 0.6}s` }}>
                    {point}
                  </li>
                ))}
              </ul>
              {step.source_page && (
                <p className="board-source">From page {step.source_page}</p>
              )}
            </div>

            <div className="controls">
              <button
                className="btn btn-secondary"
                onClick={() => goTo(stepIndex - 1)}
                disabled={stepIndex === 0}
              >
                Previous
              </button>
              <button className="btn btn-primary" onClick={togglePlay}>
                {playing ? "Pause" : isLast ? "Replay lesson" : "Play lesson"}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => goTo(stepIndex + 1)}
                disabled={isLast}
              >
                Next
              </button>
              <span className="indicator">
                Step {stepIndex + 1} of {steps.length}
              </span>
            </div>

            {isLast && lesson.check_question && (
              <section className="check">
                <h3>Check your understanding</h3>
                <p>{lesson.check_question.question}</p>
                {showAnswer ? (
                  <p className="answer">{lesson.check_question.answer}</p>
                ) : (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowAnswer(true)}
                  >
                    Show answer
                  </button>
                )}
              </section>
            )}
          </>
        )}
      </main>

      <aside className="instructor">
        <h2 className="sr-only">Instructor</h2>
        <Avatar speaking={playing} />
        <p className="caption" aria-live="polite">
          {step ? step.narration : "Ready when you are."}
        </p>
      </aside>
    </div>
  );
}
