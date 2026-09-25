"""
backend/analyzer/git_analyzer.py

Stage 4 of the RootFlow analysis pipeline: Git blame & commit identification.

For a given (file, line) pair, identifies the commit that introduced that line
of code and retrieves the unified diff for the relevant file in that commit.

If the file is not tracked by Git (or the repo root has no .git directory), all
methods return None with a descriptive reason stored in ``last_error``.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import git  # gitpython
from git.exc import GitCommandError, InvalidGitRepositoryError, NoSuchPathError


# ---------------------------------------------------------------------------
# Public data structure
# ---------------------------------------------------------------------------


@dataclass
class CommitInfo:
    """Mirrors the ``CommitInfo`` Pydantic model in shared/schema.py."""

    hash: str
    author: str
    date: str
    message: str
    diff: str


# ---------------------------------------------------------------------------
# Public class
# ---------------------------------------------------------------------------


class GitAnalyzer:
    """
    Wraps ``gitpython`` to answer two questions:

    1. Which commit introduced the code at ``(file, line)``?  (``blame``)
    2. What did that commit change in that file?  (``get_commit_diff``)

    Parameters
    ----------
    repo_root:
        Absolute path to the repository root (directory containing ``.git``).
    """

    def __init__(self, repo_root: str) -> None:
        self.repo_root = repo_root
        self.last_error: Optional[str] = None

        try:
            self._repo = git.Repo(repo_root, search_parent_directories=True)
        except (InvalidGitRepositoryError, NoSuchPathError) as exc:
            self._repo = None  # type: ignore[assignment]
            self.last_error = f"Not a git repository: {exc}"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def blame(self, file: str, line: int) -> Optional[CommitInfo]:
        """
        Return the :class:`CommitInfo` for the commit that last touched
        ``file`` at ``line`` (1-based).

        Returns ``None`` if the file is untracked, the line is out of range,
        or any git error occurs.  ``last_error`` is set with the reason.
        """
        if self._repo is None:
            return None

        rel_path = self._to_rel(file)
        if rel_path is None:
            return None

        try:
            # git blame --porcelain -L <line>,<line> -- <file>
            blame_output: str = self._repo.git.blame(
                "--porcelain",
                "-L",
                f"{line},{line}",
                "--",
                rel_path,
            )
        except GitCommandError as exc:
            self.last_error = f"git blame failed for {rel_path}:{line}: {exc}"
            return None

        commit_hash, author, date, message = self._parse_porcelain(blame_output)
        if commit_hash is None:
            return None

        diff = self.get_commit_diff(commit_hash, rel_path) or ""
        return CommitInfo(
            hash=commit_hash,
            author=author,
            date=date,
            message=message,
            diff=diff,
        )

    def get_commit_diff(self, commit_hash: str, file: Optional[str] = None) -> Optional[str]:
        """
        Return the unified diff produced by *commit_hash* for *file*.

        If *file* is ``None`` the full diff of the commit is returned.
        Returns ``None`` on any error; ``last_error`` is set with the reason.
        """
        if self._repo is None:
            return None

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

        patches: list[str] = []
        for d in diffs:
            # d.a_path is the path in the parent; d.b_path is the path in the commit.
            if rel_path and d.b_path != rel_path and d.a_path != rel_path:
                continue
            try:
                patch_bytes = d.diff
                patches.append(
                    patch_bytes.decode("utf-8", errors="replace")
                    if isinstance(patch_bytes, bytes)
                    else str(patch_bytes)
                )
            except Exception:  # noqa: BLE001
                continue

        return "\n".join(patches) if patches else ""

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _to_rel(self, file: str) -> Optional[str]:
        """
        Convert an absolute or relative path to a repo-relative POSIX path.
        Returns ``None`` and sets ``last_error`` when the path escapes the repo.
        """
        if os.path.isabs(file):
            try:
                rel = os.path.relpath(file, self._repo.working_dir)
            except ValueError:
                # Windows: different drive letters
                self.last_error = f"File {file!r} is outside the repository."
                return None
        else:
            rel = file

        # Normalise separators for git (always forward slashes)
        rel = rel.replace("\\", "/")

        # Ensure the path doesn't escape the working tree
        if rel.startswith("../"):
            self.last_error = f"File {file!r} is outside the repository."
            return None

        return rel

    @staticmethod
    def _parse_porcelain(output: str) -> tuple[Optional[str], str, str, str]:
        """
        Parse ``git blame --porcelain`` output for a single line.

        The porcelain format starts with a 40-char hex hash, followed by lines
        of the form ``<key> <value>``.  We extract: hash, author, author-time
        (Unix epoch → ISO string), and summary.

        Returns (hash, author, date, message).  Returns (None, "", "", "") on
        parse failure.
        """
        import datetime

        lines = output.splitlines()
        if not lines:
            return None, "", "", ""

        # First line: "<hash> <orig_line> <final_line> [<num_lines>]"
        first = lines[0].split()
        if not first:
            return None, "", "", ""

        commit_hash = first[0]
        if len(commit_hash) != 40 or not all(c in "0123456789abcdefABCDEF" for c in commit_hash):
            return None, "", "", ""

        author = ""
        date = ""
        message = ""

        for line in lines[1:]:
            if line.startswith("author "):
                author = line[len("author "):]
            elif line.startswith("author-time "):
                try:
                    ts = int(line[len("author-time "):])
                    date = datetime.datetime.fromtimestamp(
                        ts, tz=datetime.timezone.utc
                    ).isoformat()
                except ValueError:
                    date = line[len("author-time "):]
            elif line.startswith("summary "):
                message = line[len("summary "):]

        return commit_hash, author, date, message
