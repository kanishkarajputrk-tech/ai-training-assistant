import { useEffect, useState } from "react";
import Avatar from "./Avatar";
import "./App.css";

const API = "http://127.0.0.1:8000";
const hasSpeech = typeof window !== "undefined" && "speechSynthesis" in window;

// Fallback when no voice is available: time to read the text aloud
// (about 2.5 words per second), so the lesson still plays silently.
function readingTime(text) {
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

function pickDefaultVoice(voices) {
  return (
    voices.find((v) => v.lang === "en-IN") ||
    voices.find((v) => v.lang.startsWith("en")) ||
    voices[0]
  );
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

  const [voices, setVoices] = useState([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [mouth, setMouth] = useState(0); // 0 = closed, 1 = open

  const steps = lesson && lesson.found ? lesson.steps : [];
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

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

  // Load the voices installed on this computer. Only offline ("local")
  // voices are kept, so no text is ever sent to an online speech service.
  useEffect(() => {
    if (!hasSpeech) return;
    function loadVoices() {
      const local = window.speechSynthesis.getVoices().filter((v) => v.localService);
      setVoices(local);
      setVoiceURI((current) => current || pickDefaultVoice(local)?.voiceURI || "");
    }
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // While "playing": speak the narration, move the mouth, then go to the next step
  useEffect(() => {
    if (!playing || !step) return;

    let stopped = false;
    let gotWordEvent = false;
    let flapTimer = null;
    let closeTimer = null;
    let gapTimer = null;
    let readTimer = null;

    const flap = () => {
      setMouth(1);
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => setMouth(0.25), 200);
    };

    const finishStep = () => {
      if (stopped) return;
      clearInterval(flapTimer);
      setMouth(0);
      if (isLast) setPlaying(false);
      else gapTimer = setTimeout(() => setStepIndex((i) => i + 1), 600);
    };

    // If the voice sends no word events, keep the mouth moving anyway
    flapTimer = setInterval(() => {
      if (!gotWordEvent) flap();
    }, 260);

    const voice = voices.find((v) => v.voiceURI === voiceURI);
    if (hasSpeech && voice) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(step.narration);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = 0.95;
      utterance.onboundary = () => {
        gotWordEvent = true;
        flap();
      };
      utterance.onend = finishStep;
      utterance.onerror = finishStep; // cancel() also lands here; `stopped` ignores it
      window.speechSynthesis.speak(utterance);
    } else {
      readTimer = setTimeout(finishStep, readingTime(step.narration));
    }

    return () => {
      stopped = true;
      clearInterval(flapTimer);
      clearTimeout(closeTimer);
      clearTimeout(gapTimer);
      clearTimeout(readTimer);
      if (hasSpeech) window.speechSynthesis.cancel();
      setMouth(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, stepIndex, step, isLast, voiceURI]);

  function testVoice() {
    const voice = voices.find((v) => v.voiceURI === voiceURI);
    if (!hasSpeech || !voice) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      "Hello, I am your instructor. This is how I will sound."
    );
    utterance.voice = voice;
    utterance.lang = voice.lang;
    window.speechSynthesis.speak(utterance);
  }

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

        <section>
          <h2>Instructor voice</h2>
          {voices.length > 0 ? (
            <>
              <select
                value={voiceURI}
                onChange={(e) => setVoiceURI(e.target.value)}
                aria-label="Instructor voice"
              >
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary" onClick={testVoice}>
                Test voice
              </button>
            </>
          ) : (
            <p className="note">
              No offline voice was found, so lessons will play silently. Add one in
              Windows Settings under Time &amp; language, then Speech.
            </p>
          )}
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
        <Avatar speaking={playing} openness={mouth} />
        <p className="caption" aria-live="polite">
          {step ? step.narration : "Ready when you are."}
        </p>
      </aside>
    </div>
  );
}
