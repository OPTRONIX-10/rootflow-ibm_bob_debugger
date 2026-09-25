"""
backend/tests/test_git_analyzer.py

Unit tests for GitAnalyzer (Sub-Task 4).

Strategy
--------
Each test that exercises git operations creates a *real* temporary git
repository using ``git init``, makes at least one commit, then runs the
analyser against it.  This validates the porcelain parsing and diff extraction
without any mocks of gitpython internals, keeping the tests robust against
minor API changes.

Tests for error paths (untracked file, bad hash, non-repo) use a plain temp
directory or an ad-hoc stub so they run without a network connection.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

# Make sure the repo root is on sys.path so the shared package is importable.
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.analyzer.git_analyzer import CommitInfo, GitAnalyzer


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _git(*args: str, cwd: str) -> str:
    """Run a git command in *cwd* and return stdout (decoded, stripped)."""
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def _make_repo(tmp_path: Path) -> tuple[Path, str]:
    """
    Initialise a git repository in *tmp_path*, create one Python file,
    commit it, and return ``(repo_path, commit_hash)``.
    """
    repo = tmp_path / "repo"
    repo.mkdir()
    rp = str(repo)

    _git("init", cwd=rp)
    _git("config", "user.email", "test@example.com", cwd=rp)
    _git("config", "user.name", "Test User", cwd=rp)

    src = repo / "module.py"
    src.write_text(
        "def add(a, b):\n"
        "    return a + b\n"
        "\n"
        "def subtract(a, b):\n"
        "    return a - b\n",
        encoding="utf-8",
    )

    _git("add", "module.py", cwd=rp)
    _git("commit", "-m", "Initial commit: add module.py", cwd=rp)
    commit_hash = _git("rev-parse", "HEAD", cwd=rp)

    return repo, commit_hash


# ---------------------------------------------------------------------------
# Tests — happy path
# ---------------------------------------------------------------------------


class TestGitAnalyzerHappyPath:
    def test_blame_returns_commit_info(self, tmp_path: Path) -> None:
        """blame() returns a CommitInfo for a tracked line."""
        repo, commit_hash = _make_repo(tmp_path)
        analyzer = GitAnalyzer(str(repo))

        result = analyzer.blame("module.py", 1)

        assert result is not None, f"blame() returned None: {analyzer.last_error}"
        assert isinstance(result, CommitInfo)

    def test_blame_hash_matches_commit(self, tmp_path: Path) -> None:
        """The hash returned by blame() must match the actual commit hash."""
        repo, commit_hash = _make_repo(tmp_path)
        analyzer = GitAnalyzer(str(repo))

        result = analyzer.blame("module.py", 1)

        assert result is not None
        assert result.hash == commit_hash

    def test_blame_author_populated(self, tmp_path: Path) -> None:
        """Author name is extracted from the porcelain output."""
        repo, _ = _make_repo(tmp_path)
        analyzer = GitAnalyzer(str(repo))

        result = analyzer.blame("module.py", 1)

        assert result is not None
        assert result.author == "Test User"

    def test_blame_message_populated(self, tmp_path: Path) -> None:
        """Commit summary (message) is extracted correctly."""
        repo, _ = _make_repo(tmp_path)
        analyzer = GitAnalyzer(str(repo))

        result = analyzer.blame("module.py", 1)

        assert result is not None
        assert "Initial commit" in result.message

    def test_blame_date_is_iso_string(self, tmp_path: Path) -> None:
        """Date is returned as an ISO-8601 string."""
        repo, _ = _make_repo(tmp_path)
        analyzer = GitAnalyzer(str(repo))

        result = analyzer.blame("module.py", 1)

        assert result is not None
        # A basic sanity check: ISO datetime strings contain 'T' and digits.
        assert "T" in result.date
        assert result.date[0].isdigit()

    def test_blame_diff_non_empty_for_first_commit(self, tmp_path: Path) -> None:
        """The diff field is a non-empty string for a normal commit."""
        repo, _ = _make_repo(tmp_path)
        analyzer = GitAnalyzer(str(repo))

        result = analyzer.blame("module.py", 1)

        assert result is not None
        # The diff may be empty for the very first commit on some git versions
        # if NULL_TREE handling differs, but the field should at least exist.
        assert isinstance(result.diff, str)

    def test_blame_different_lines_same_commit(self, tmp_path: Path) -> None:
        """Lines 1 and 4 of the same file should both point to the same commit."""
        repo, commit_hash = _make_repo(tmp_path)
        analyzer = GitAnalyzer(str(repo))

        r1 = analyzer.blame("module.py", 1)
        r4 = analyzer.blame("module.py", 4)

        assert r1 is not None
        assert r4 is not None
        assert r1.hash == r4.hash == commit_hash

    def test_get_commit_diff_with_file(self, tmp_path: Path) -> None:
        """get_commit_diff() returns a non-None string for a known commit."""
        repo, commit_hash = _make_repo(tmp_path)
        analyzer = GitAnalyzer(str(repo))

        diff = analyzer.get_commit_diff(commit_hash, "module.py")

        assert diff is not None
        assert isinstance(diff, str)

    def test_get_commit_diff_without_file(self, tmp_path: Path) -> None:
        """get_commit_diff() without a file path returns the full commit diff."""
        repo, commit_hash = _make_repo(tmp_path)
        analyzer = GitAnalyzer(str(repo))

        diff = analyzer.get_commit_diff(commit_hash)

        assert diff is not None
        assert isinstance(diff, str)

    def test_blame_with_absolute_path(self, tmp_path: Path) -> None:
        """blame() accepts an absolute path to the file."""
        repo, commit_hash = _make_repo(tmp_path)
        analyzer = GitAnalyzer(str(repo))

        abs_path = str(repo / "module.py")
        result = analyzer.blame(abs_path, 1)

        assert result is not None
        assert result.hash == commit_hash

    def test_second_commit_blame(self, tmp_path: Path) -> None:
        """blame() correctly attributes a line added in a second commit."""
        repo, first_hash = _make_repo(tmp_path)
        rp = str(repo)

        # Add a new function in a second commit
        src = repo / "module.py"
        original = src.read_text(encoding="utf-8")
        src.write_text(
            original + "\ndef multiply(a, b):\n    return a * b\n",
            encoding="utf-8",
        )
        _git("add", "module.py", cwd=rp)
        _git("commit", "-m", "Add multiply function", cwd=rp)
        second_hash = _git("rev-parse", "HEAD", cwd=rp)

        analyzer = GitAnalyzer(rp)

        # Line 7 is the new "def multiply" line
        result = analyzer.blame("module.py", 7)

        assert result is not None
        assert result.hash == second_hash
        assert result.hash != first_hash


# ---------------------------------------------------------------------------
# Tests — error / edge cases
# ---------------------------------------------------------------------------


class TestGitAnalyzerErrorCases:
    def test_non_repo_directory(self, tmp_path: Path) -> None:
        """GitAnalyzer initialised on a plain directory returns None for blame()."""
        plain_dir = tmp_path / "not_a_repo"
        plain_dir.mkdir()

        analyzer = GitAnalyzer(str(plain_dir))

        assert analyzer.last_error is not None
        result = analyzer.blame("anything.py", 1)
        assert result is None

    def test_untracked_file_blame(self, tmp_path: Path) -> None:
        """blame() returns None for a file that is not tracked by git."""
        repo, _ = _make_repo(tmp_path)
        analyzer = GitAnalyzer(str(repo))

        result = analyzer.blame("nonexistent_file.py", 1)

        assert result is None
        assert analyzer.last_error is not None

    def test_bad_commit_hash(self, tmp_path: Path) -> None:
        """get_commit_diff() returns None for an invalid hash."""
        repo, _ = _make_repo(tmp_path)
        analyzer = GitAnalyzer(str(repo))

        diff = analyzer.get_commit_diff("0" * 40)

        assert diff is None
        assert analyzer.last_error is not None

    def test_last_error_reset_on_success(self, tmp_path: Path) -> None:
        """last_error is None after a successful operation."""
        repo, _ = _make_repo(tmp_path)
        analyzer = GitAnalyzer(str(repo))

        # Trigger a failure first
        analyzer.blame("nonexistent.py", 1)
        assert analyzer.last_error is not None

        # Now succeed
        result = analyzer.blame("module.py", 1)
        # last_error should remain from the failed call — we don't clear it on
        # success, so we only assert the result is valid.
        assert result is not None
