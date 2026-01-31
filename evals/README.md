# Evaluation Harness

This folder is a lightweight, reproducible eval harness for StudyBuddy. It is designed to catch regressions when prompts, chunking, or models change.

## What to measure

- **Faithfulness**: Is the answer grounded in retrieved context?
- **Context precision**: Are retrieved chunks actually used?
- **Quiz correctness**: Do generated questions align with source material?

## How to use

1. Replace `sample_questions.jsonl` with your own fixed dataset.
2. Run your normal StudyBuddy pipeline (upload → chunk → generate).
3. Compare outputs before/after changes and record results in a table.

## Suggested tools

- Ragas / DeepEval for faithfulness + context precision
- Manual spot checks for quiz quality and coverage

> This harness is intentionally small—use it as a regression guard, then expand as needed.
