"""
FastAPI backend.

Run from inside the backend folder:
    uvicorn main:app --reload
Then open http://127.0.0.1:8000/docs to test it in the browser.
"""
import pathlib
import shutil

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import rag

app = FastAPI(title="AI Training Assistant")

# Lets the React app (Stage 4, runs on port 5173) call this API from the browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Question(BaseModel):
    question: str


@app.get("/health")
def health():
    """Quick check that the server is up and how much material is stored."""
    return {"status": "ok", "chunks_stored": rag.collection.count()}


@app.post("/upload")
def upload(file: UploadFile = File(...)):
    """Upload a PDF; it is saved, split into chunks, embedded and stored."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    rag.UPLOAD_DIR.mkdir(exist_ok=True)
    save_path = rag.UPLOAD_DIR / pathlib.Path(file.filename).name
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    chunks = rag.ingest(str(save_path))
    return {"filename": save_path.name, "chunks_added": chunks}


@app.post("/ask")
def ask(body: Question):
    """Ask a question; returns the answer and the source pages."""
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    return rag.ask(body.question)
