"""
examples/buggy_project/report.py

High-level reporting layer that calls stats.summarise.
"""

from examples.buggy_project.stats import summarise
from examples.buggy_project.utils import format_report


def generate_report(labels: list[str], values: list[float], total: float) -> list[str]:
    """Generate a formatted percentage report for *values* against *total*."""
    percentages = summarise(values, total)
    return [format_report(label, pct) for label, pct in zip(labels, percentages)]
