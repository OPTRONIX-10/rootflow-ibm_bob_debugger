"""
examples/buggy_project/stats.py

Statistics helpers that depend on utils.percentage.
"""

from examples.buggy_project.utils import clamp, percentage


def compute_ratio(numerator: float, denominator: float) -> float:
    """Compute a ratio in [0, 100], clamped to valid range."""
    raw = percentage(numerator, denominator)
    return clamp(raw, 0.0, 100.0)


def summarise(values: list[float], total: float) -> list[float]:
    """Return each value as a percentage of *total*."""
    return [compute_ratio(v, total) for v in values]
