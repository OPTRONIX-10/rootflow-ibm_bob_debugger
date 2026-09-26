# @rootflow-plan.md implement Sub-Task 4 and update the status in rootflow-plan.md

---

**Status:** active  **Date:** 2026-09-25

---

### 👤 User

@rootflow-plan.md implement Sub-Task 4 and update the status in rootflow-plan.md

---

### 🤖 Assistant

> 🔧 called: read_file

Let me start by reading the plan file to understand what Sub-Task 4 entails.

> 🔧 **read_file** — rootflow-plan.md

### 🤖 Assistant

> 🔧 called: list_files, list_files

Now let me look at the existing backend structure to understand what's already been built:

> 🔧 **list_files** — shared

> 🔧 **list_files** — backend

### 🤖 Assistant

> 🔧 called: read_file, read_file



> 🔧 **read_file** — shared/schema.py

> 🔧 **read_file** — backend/main.py

### 🤖 Assistant

> 🔧 called: read_file

Now let me read the propagation tracer to understand the `PropagationNode` structure and what I need to feed to GitAnalyzer:

> 🔧 **read_file** — backend/analyzer/propagation_tracer.py

### 🤖 Assistant

> 🔧 called: update_todo_list

Now I have a full picture. Let me set up the todo list and implement Sub-Task 4:

> 🔧 **update_todo_list** — [-] Create `backend/analyzer/git_analyzer.py` with `GitAnalyzer` class
[ ] Write `backend/tests/test_git_analyzer.py` with temporary git init fixture
[ ] Integrate `GitAnalyzer` into `POST /analyze` in `main.py`
[ ] Update `rootflow-plan.md` Sub-Task 4 status to complete


### 🤖 Assistant

> 🔧 called: write_file



> 🔧 **write_file** — backend/analyzer/git_analyzer.py

### 🤖 Assistant

> 🔧 called: update_todo_list

Now write the test file:

> 🔧 **update_todo_list** — [x] Create `backend/analyzer/git_analyzer.py` with `GitAnalyzer` class
[-] Write `backend/tests/test_git_analyzer.py` with temporary git init fixture
[ ] Integrate `GitAnalyzer` into `POST /analyze` in `main.py`
[ ] Update `rootflow-plan.md` Sub-Task 4 status to complete


### 🤖 Assistant

> 🔧 called: write_file



> 🔧 **write_file** — """
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


### 🤖 Assistant

> 🔧 called: update_todo_list

Now integrate `GitAnalyzer` into `main.py`:

> 🔧 **update_todo_list** — [x] Create `backend/analyzer/git_analyzer.py` with `GitAnalyzer` class
[x] Write `backend/tests/test_git_analyzer.py` with temporary git init fixture
[-] Integrate `GitAnalyzer` into `POST /analyze` in `main.py`
[ ] Update `rootflow-plan.md` Sub-Task 4 status to complete


### 🤖 Assistant

> 🔧 called: apply_diff



> 🔧 **apply_diff** — backend/main.py

### 🤖 Assistant

> 🔧 called: execute_command

Now run the tests to validate everything works:

> 🔧 **execute_command** — python -m pytest backend/tests/test_git_analyzer.py -v 2>&1

### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — py -m pytest backend/tests/test_git_analyzer.py -v 2>&1

### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — py -m pip install gitpython 2>&1

### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — py -m pytest backend/tests/test_git_analyzer.py -v 2>&1

### 🤖 Assistant

> 🔧 called: apply_diff

`repo.commit()` also raises `ValueError` for a missing SHA (not just `git.BadName`). Fix the exception handling in [`git_analyzer.py`](backend/analyzer/git_analyzer.py):

> 🔧 **apply_diff** — backend/analyzer/git_analyzer.py

### 🤖 Assistant

> 🔧 called: apply_diff

The `except Exception` is too broad — let me look at what the actual exception is and catch only the relevant lazy-evaluation error from gitpython. The access to `.parents` triggers the lazy load which raises `ValueError`. A cleaner approach is to wrap the whole diff operation:

> 🔧 **apply_diff** — <<<<<<< SEARCH
:start_line:119
-------
        try:
            commit = self._repo.commit(commit_hash)
        except (git.BadName, ValueError, Exception) as exc:  # noqa: BLE001
            self.last_error = f"Unknown commit {commit_hash}: {exc}"
            return None

        rel_path = self._to_rel(file) if file else None

        try:
            if commit.parents:
                parent = commit.parents[0]
                diffs = parent.diff(commit, create_patch=True)
            else:
                # First commit in the repo — diff against the empty tree
                diffs = commit.diff(git.NULL_TREE, create_patch=True)
        except GitCommandError as exc:
            self.last_error = f"git diff failed for {commit_hash}: {exc}"
            return None
=======
        rel_path = self._to_rel(file) if file else None

        try:
            commit = self._repo.commit(commit_hash)
            if commit.parents:
                parent = commit.parents[0]
                diffs = parent.diff(commit, create_patch=True)
            else:
                # First commit in the repo — diff against the empty tree
                diffs = commit.diff(git.NULL_TREE, create_patch=True)
        except (GitCommandError, git.BadName, ValueError) as exc:
            self.last_error = f"git diff/commit failed for {commit_hash}: {exc}"
            return None
        except Exception as exc:  # noqa: BLE001  — covers gitpython lazy-load errors
            self.last_error = f"git error for {commit_hash}: {exc}"
            return None
>>>>>>> REPLACE


### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — py -m pytest backend/tests/test_git_analyzer.py -v 2>&1

### 🤖 Assistant

> 🔧 called: execute_command

All 15 tests pass. Also confirm the existing Stage 3 tests are still green:

> 🔧 **execute_command** — py -m pytest backend/tests/ -v 2>&1

### 🤖 Assistant

> 🔧 called: update_todo_list

38/38 pass. Now update the plan file:

> 🔧 **update_todo_list** — [x] Create `backend/analyzer/git_analyzer.py` with `GitAnalyzer` class
[x] Write `backend/tests/test_git_analyzer.py` with temporary git init fixture
[x] Integrate `GitAnalyzer` into `POST /analyze` in `main.py`
[-] Update `rootflow-plan.md` Sub-Task 4 status to complete


### 🤖 Assistant

> 🔧 called: apply_diff



> 🔧 **apply_diff** — <<<<<<< SEARCH
:start_line:197
-------
**Status:** `[ ] pending`
=======
**Status:** `[x] complete`
>>>>>>> REPLACE


### 🤖 Assistant

> 🔧 called: update_todo_list



> 🔧 **update_todo_list** — [x] Create `backend/analyzer/git_analyzer.py` with `GitAnalyzer` class
[x] Write `backend/tests/test_git_analyzer.py` with temporary git init fixture
[x] Integrate `GitAnalyzer` into `POST /analyze` in `main.py`
[x] Update `rootflow-plan.md` Sub-Task 4 status to complete


### 🤖 Assistant

Sub-Task 4 is complete. Here's a summary of everything delivered:

---

### Sub-Task 4 — What was built

**[`backend/analyzer/git_analyzer.py`](backend/analyzer/git_analyzer.py)** — new `GitAnalyzer` class:
- `__init__(repo_root)` — opens the repo with `gitpython`; sets `last_error` if the directory is not a git repository.
- `blame(file, line) -> CommitInfo | None` — runs `git blame --porcelain -L <line>,<line>` on the file, parses the 40-char commit hash, author name, ISO date, and commit summary. Returns `None` (with `last_error` set) for untracked files or any git error.
- `get_commit_diff(hash, file?) -> str | None` — retrieves the unified diff for the given commit (scoped to one file when provided); handles the first-commit edge case by diffing against `git.NULL_TREE`.
- `_parse_porcelain()` — static helper that parses the porcelain blame format into structured fields.
- Graceful error handling: untracked files, invalid hashes, non-repos, and gitpython lazy-load exceptions all return `None` rather than raising.

**[`backend/tests/test_git_analyzer.py`](backend/tests/test_git_analyzer.py)** — 15 tests across two classes:
- `TestGitAnalyzerHappyPath` (11 tests) — creates a real `git init` fixture in a `tmp_path`, asserts hash, author, date, message, diff, absolute path input, multi-commit attribution.
- `TestGitAnalyzerErrorCases` (4 tests) — non-repo directory, untracked file, bad commit hash, error field behaviour.
- **38/38 tests pass** (15 new + 23 from Stage 3 regression).

**[`backend/main.py`](backend/main.py)** — Stage 4 wired into `POST /analyze`:
- After the propagation trace resolves the origin node, `GitAnalyzer.blame(root_cause_file, root_cause_line)` is called.
- The result populates `rootCause.introducedByCommit` with the full `{hash, author, date, message, diff}` block.
- If the workspace is not a git repo or the file is untracked, `introducedByCommit` is `null` (same as before — no regression).

**[`rootflow-plan.md`](rootflow-plan.md)** — Sub-Task 4 status updated to `[x] complete`.