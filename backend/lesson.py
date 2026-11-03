"""
Stage 3: turn retrieved training material into a step-by-step lesson script
that the whiteboard (Stage 4) can show one step at a time.

The LLM is asked for JSON; pydantic checks that the JSON has the right shape.
"""
import json
from typing import Optional

import ollama
from pydantic import BaseModel, Field, ValidationError

import rag


class Step(BaseModel):
    title: str                       # heading shown on the whiteboard
    board: list[str]                 # short bullet points written on the board
    narration: str                   # what the avatar says out loud
    source_page: Optional[int] = None


class CheckQuestion(BaseModel):
    question: str
    answer: str


class Lesson(BaseModel):
    found: bool                      # False if the material doesn't cover the topic
    topic: str = ""
    steps: list[Step] = Field(default_factory=list)
    check_question: Optional[CheckQuestion] = None


EXAMPLE = {
    "found": True,
    "topic": "example topic",
    "steps": [
        {
            "title": "Step title",
            "board": ["short point one", "short point two"],
            "narration": "One to three simple spoken sentences explaining this step.",
            "source_page": 3,
        }
    ],
    "check_question": {"question": "A question to test understanding?", "answer": "The answer."},
}


def build_prompt(topic, context):
    return f"""You are an instructor teaching from training material.
Return ONLY a JSON object with exactly this shape:
{json.dumps(EXAMPLE, indent=2)}

Rules:
- Use ONLY the training material below. Do not add outside facts.
- Write 3 to 5 steps. Each step has a short title, 2 to 4 board bullets
  (under 12 words each) and a narration of 1 to 3 simple spoken sentences.
- source_page must be a page number taken from the material labels, or null.
- check_question: one question a trainee can answer from the lesson, with its answer.
- If the material does not cover the topic, return
  {{"found": false, "topic": "{topic}", "steps": [], "check_question": null}}

TRAINING MATERIAL:
{context}

TOPIC: {topic}
JSON:"""


def make_lesson(topic, k=5, attempts=2):
    """Retrieve material for the topic and ask the LLM for a lesson script."""
    total = rag.collection.count()
    if total == 0:
        return Lesson(found=False, topic=topic)

    results = rag.collection.query(
        query_embeddings=[rag.embed(topic)], n_results=min(k, total)
    )
    context = "\n\n".join(
        f"[{m['source']}, page {m['page']}]\n{d}"
        for d, m in zip(results["documents"][0], results["metadatas"][0])
    )
    prompt = build_prompt(topic, context)

    for _ in range(attempts):
        reply = ollama.chat(
            model=rag.LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            format="json",                    # forces valid JSON output
            options={"temperature": 0.2},     # low = more consistent structure
        )
        try:
            lesson = Lesson.model_validate_json(reply["message"]["content"])
        except ValidationError:
            continue                          # wrong shape: try again
        if lesson.found and not lesson.steps:
            continue                          # claimed it found material but wrote nothing
        lesson.topic = topic
        return lesson

    raise ValueError("The model did not return a valid lesson. Please try again.")
