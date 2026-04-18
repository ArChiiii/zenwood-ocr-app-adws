"""Eval harness (Phase 0b).

Runs each feature against a fixture corpus, collects per-metric scores
(pixel SSIM, text-tree equality, table cells, HW redaction, per-block OCR
accuracy) and writes a JSONL report. Baselines the monolithic pipeline
*before* the architecture rewrite so every subsequent change is measured.
"""
