"""Backward-compatible entry point for the renamed analysis PDF pipeline.

This file exists so older scripts or already-running processes that still
invoke member2_summary_pipeline.py keep working after the rename.
"""

from analysis_pdf_pipeline import main


if __name__ == "__main__":
    main()
