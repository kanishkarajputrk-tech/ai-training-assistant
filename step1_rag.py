"""
Step 1: a minimal, fully local RAG pipeline.

Usage:
    python step1_rag.py ingest path/to/file.pdf
    python step1_rag.py ask "What is the first aid for a burn?"

Needs Ollama running, with these two models pulled:
    ollama pull llama3.2:3b
    ollama pull nomic-embed-text
"""
import sys
import pathlib

import chromadb
import ollama
from pypdf import PdfReader

LLM_MODEL = "llama3.2:3b"          # change to "llama3.2:1b" if your laptop is slow
EMBED_MODEL = "nomic-embed-text"

# Vectors are stored on disk in the "chroma_data" folder
client = chromadb.PersistentClient(path="chroma_data")
collection = client.get_or_create_collection("training_material")


def read_pdf(path):
    """Return a list of (page_number, text) for every page in the PDF."""
    reader = PdfReader(path)
    return [(i + 1, page.extract_text() or "") for i, page in enumerate(reader.pages)]


def chunk_text(text, size=800, overlap=150):
    """Split text into overlapping pieces so ideas aren't cut in half."""
    chunks, start = [], 0
    while start < len(text):
        chunks.append(text[start:start + size])
        start += size - overlap
    return chunks


def embed(text):
    """Turn text into a vector (list of numbers) using the local embedding model."""
    return ollama.embed(model=EMBED_MODEL, input=text)["embeddings"][0]


def ingest(pdf_path):
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
    print(f"Ingested {count} chunks from {name}")


def ask(question, k=4):
    # 1. Find the k chunks most similar to the question
    results = collection.query(query_embeddings=[embed(question)], n_results=k)
    docs = results["documents"][0]
    metas = results["metadatas"][0]

    # 2. Build a prompt that forces the model to use only that material
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

    # 3. Ask the local LLM
    reply = ollama.chat(model=LLM_MODEL, messages=[{"role": "user", "content": prompt}])
    print("\n" + reply["message"]["content"])
    print("\nSources:")
    for m in metas:
        print(f"  - {m['source']}, page {m['page']}")


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] not in ("ingest", "ask"):
        print(__doc__)
        sys.exit(1)
    if sys.argv[1] == "ingest":
        ingest(sys.argv[2])
    else:
        ask(" ".join(sys.argv[2:]))
