    # AI Training Assistant

    A fully local, offline AI tutor that answers questions from uploaded
    training material using Retrieval-Augmented Generation (RAG).
    No cloud APIs. Runs on a laptop.

    ## Status
    Stage 1 complete: PDF ingestion and question answering with source pages.

    ## Tech
    Python, Ollama (Llama 3.2), ChromaDB, pypdf

    ## Run it
    1. Install Ollama, then:
    ollama pull llama3.2:3b
    ollama pull nomic-embed-text
    2. pip install -r requirements.txt
    3. python step1_rag.py ingest your_file.pdf
    4. python step1_rag.py ask "your question"
