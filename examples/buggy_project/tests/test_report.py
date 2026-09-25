"""
examples/buggy_project/tests/test_report.py

Failing test that exercises the known ZeroDivisionError bug in utils.percentage.

Running this test with an empty dataset (total == 0) triggers:

    ZeroDivisionError: float division by zero
      File ".../utils.py", line N, in percentage
        return (part / total) * 100.0
"""

import pytest

from examples.buggy_project.report import generate_report


class TestGenerateReport:
    def test_normal_case(self) -> None:
        """Sanity check: non-zero totals work correctly."""
        lines = generate_report(["alpha", "beta"], [25.0, 75.0], 100.0)
        assert lines[0] == "alpha: 25.00%"
        assert lines[1] == "beta: 75.00%"

    def test_empty_dataset_zero_total(self) -> None:
        """
        BUG: when total is 0 the pipeline raises ZeroDivisionError.
        generate_report should return all-zero percentages for an empty dataset,
        but instead it crashes because utils.percentage does not guard against
        division by zero.
        """
        # Calling with total=0 triggers the bug in utils.percentage
        lines = generate_report(["x", "y"], [0.0, 0.0], 0.0)
        assert lines == ["x: 0.00%", "y: 0.00%"]
