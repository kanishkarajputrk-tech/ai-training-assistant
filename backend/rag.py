"""
RAG logic, reused by the API (main.py).
Same pipeline as step1_rag.py, but functions RETURN data instead of printing it.
"""
import pathlib

import chromadb
import ollama
from pypdf import PdfReader

LLM_MODEL = "llama3.2:3b"          # use "llama3.2:1b" if your laptop is slow
EMBED_MODEL = "nomic-embed-text"

# Absolute paths, so it works no matter which folder you start the server from
BASE_DIR = pathlib.Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"

client = chromadb.PersistentClient(path=str(BASE_DIR / "chroma_data"))
collection = client.get_or_create_collection("training_material")


def read_pdf(path):
    reader = PdfReader(path)
    return [(i + 1, page.extract_text() or "") for i, page in enumerate(reader.pages)]


def chunk_text(text, size=800, overlap=150):
    chunks, start = [], 0
    while start < len(text):
        chunks.append(text[start:start + size])
        start += size - overlap
    return chunks


def embed(text):
    return ollama.embed(model=EMBED_MODEL, input=text)["embeddings"][0]


def ingest(pdf_path):
    """Store a PDF in the database. Returns how many chunks were stored."""
    name = pathlib.Path(pdf_path).name
    count = 0
    for page_no, text in read_pdf(pdf_path):
        for j, chunk in enumerate(chunk_text(text)):
            if not chunk.strip():
                continue
            collection.upsert(
                ids=[f"{name}-p{page_no}-c{j}"],
                documents=[chunk],
                embeddings=[embed(chunk)],
                metadatas=[{"source": name, "page": page_no}],
            )
            count += 1
    return count


def ask(question, k=4):
    """Answer a question from stored material. Returns {"answer": ..., "sources": [...]}."""
    total = collection.count()
    if total == 0:
        return {"answer": "No training material has been uploaded yet.", "sources": []}

    results = collection.query(query_embeddings=[embed(question)], n_results=min(k, total))
    docs = results["documents"][0]
    metas = results["metadatas"][0]

    context = "\n\n".join(
        f"[{m['source']}, page {m['page']}]\n{d}" for d, m in zip(docs, metas)
    )
    prompt = (
        "You are a patient instructor. Answer the question using ONLY the "
        "training material below. If the answer is not in the material, say "
        "'I could not find this in the training material.'\n\n"
        f"TRAINING MATERIAL:\n{context}\n\n"
        f"QUESTION: {question}\n\nANSWER:"
    )

    reply = ollama.chat(model=LLM_MODEL, messages=[{"role": "user", "content": prompt}])
    sources = [{"source": m["source"], "page": m["page"]} for m in metas]
    return {"answer": reply["message"]["content"], "sources": sources}
