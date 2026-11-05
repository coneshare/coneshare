# Code Review: `backend/docker.dist/build/entrypoint.py` Signal Handling & `execvp` Diff (2026-10-28)

**Scope:**
- `backend/docker.dist/build/entrypoint.py`

**Summary:** Updated `entrypoint.py` to handle `SIGTERM`/`SIGINT` cleanly as PID 1 without over-defensive polling or nested shutdown fallbacks:
1. **`coneshare` mode (`coneshare-web`):** Runs `supervisord -n` in the foreground as `supervisord_proc`, starts `tail -f` in the background for log streaming, forwards `SIGTERM`/`SIGINT` via `supervisord_proc.terminate()`, and blocks the main thread on `sys.exit(supervisord_proc.wait())`.
2. **`else` mode (`coneshare-celery`, `coneshare-video`, `coneshare-beat`):** Replaces PID 1 directly via `os.execvp("gosu", ["gosu", "coneshare"] + argv[1:])` so Celery receives `SIGTERM` directly and fails closed if `gosu` is missing.

## Findings Status

| # | Severity | Location | Issue | Status |
|---|---|---|---|---|
| 1 | HIGH | `else` branch (`os.execvp` privilege drop) | `os.execvp("gosu", ["gosu", "coneshare"] + argv[1:])` fails closed if `gosu` is absent and never falls back to `root`. | Resolved |
| 2 | MEDIUM | `coneshare` shutdown | `supervisord -n` receives `SIGTERM` via `supervisord_proc.terminate()` and PID 1 blocks on `supervisord_proc.wait()` until all child services (`web`, `nginx`, `core-serv`) finish draining. | Resolved |
| 3 | MEDIUM | `coneshare` process wait target | Main thread waits on `supervisord_proc.wait()` rather than `tail_proc.wait()` and propagates `supervisord`'s exit status. | Resolved |
| 4 | MEDIUM | `else` command execution | Passes `argv[1:]` directly to `gosu` without string concatenation or `bash -c` re-parsing. | Resolved |
| 5 | LOW | `except KeyboardInterrupt` | Removed dead `KeyboardInterrupt` block. | Resolved |
| 6 | LOW | `tail` cleanup | Handled automatically by container PID namespace teardown when PID 1 exits after `supervisord_proc.wait()`. | Resolved |
| 7 | LOW | Signal handler re-entrancy | Signal handler only invokes idempotent non-blocking `supervisord_proc.terminate()`, keeping `wait()` and `sys.exit()` in the main thread. | Resolved |
