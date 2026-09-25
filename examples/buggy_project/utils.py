"""
examples/buggy_project/utils.py

Utility functions for the buggy example project.
"""


def clamp(value: float, low: float, high: float) -> float:
    """Return *value* clamped to [low, high]."""
    return max(low, min(high, value))


def percentage(part: float, total: float) -> float:
    """Return *part* as a percentage of *total*.

    BUG: does not guard against zero division — raises ZeroDivisionError when
    *total* is 0.  The correct implementation should return 0.0 in that case.
    """
    return (part / total) * 100.0


def format_report(label: str, value: float) -> str:
    """Format a labelled numeric value for display."""
    return f"{label}: {value:.2f}%"
