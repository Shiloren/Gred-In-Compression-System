import os
import sys
import time
import shutil
import signal
import tempfile
import subprocess
from pathlib import Path


def make_socket_path(test_id: str) -> str:
    if os.name == "nt":
        return rf"\\.\pipe\gics-{test_id}-{int(time.time() * 1000)}"
    return os.path.join(tempfile.gettempdir(), f"gics-{test_id}-{int(time.time() * 1000)}.sock")


def wait_for(path: Path, timeout_s: float = 10.0, process: subprocess.Popen | None = None) -> None:
    start = time.time()
    while time.time() - start < timeout_s:
        if path.exists():
            return
        if process is not None and process.poll() is not None:
            out = ""
            err = ""
            try:
                out, err = process.communicate(timeout=1)
            except Exception:
                pass
            raise RuntimeError(
                "Proceso daemon terminó antes de crear token. "
                f"returncode={process.returncode}\nstdout:\n{out}\nstderr:\n{err}"
            )
        time.sleep(0.05)
    raise TimeoutError(f"Timeout esperando archivo: {path}")


def resolve_node_runner() -> list[str]:
    """
    Devuelve comando para ejecutar TSX en modo inline, compatible con Windows.
    Prioriza npx y cae a npm exec.
    """
    if os.name == "nt":
        npx = shutil.which("npx.cmd") or shutil.which("npx")
        if npx:
            return [npx, "tsx"]

        npm = shutil.which("npm.cmd") or shutil.which("npm")
        if npm:
            return [npm, "exec", "--", "tsx"]
    else:
        npx = shutil.which("npx")
        if npx:
            return [npx, "tsx"]

        npm = shutil.which("npm")
        if npm:
            return [npm, "exec", "--", "tsx"]

    raise RuntimeError("No se encontró npx/npm en PATH para lanzar el daemon de integración.")


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    workdir = tempfile.mkdtemp(prefix="gics-py-client-it-")
    data_path = os.path.join(workdir, "data")
    token_path = os.path.join(workdir, ".gics_token")
    socket_path = make_socket_path("py-client-it")

    js_code = (
        "import { GICSDaemon } from './src/daemon/server.ts';"
        "(async () => {"
        "const daemon = new GICSDaemon({"
        "socketPath: process.env.GICS_SOCKET_PATH,"
        "dataPath: process.env.GICS_DATA_PATH,"
        "tokenPath: process.env.GICS_TOKEN_PATH,"
        "walType: 'binary'"
        "});"
        "await daemon.start();"
        "process.on('SIGTERM', async () => { await daemon.stop(); process.exit(0); });"
        "process.on('SIGINT', async () => { await daemon.stop(); process.exit(0); });"
        "setInterval(() => {}, 1000);"
        "})().catch((e) => { console.error(e); process.exit(1); });"
    )

    env = os.environ.copy()
    env["GICS_SOCKET_PATH"] = socket_path
    env["GICS_DATA_PATH"] = data_path
    env["GICS_TOKEN_PATH"] = token_path

    runner = resolve_node_runner()
    daemon = subprocess.Popen(
        [*runner, "-e", js_code],
        cwd=str(root),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        wait_for(Path(token_path), timeout_s=15.0, process=daemon)
        token = Path(token_path).read_text(encoding="utf-8").strip()

        sys.path.insert(0, str(root / "clients" / "python"))
        from gics_client import GICSClient  # type: ignore

        with GICSClient(address=socket_path, token=token, max_retries=10, retry_delay=0.1) as client:
            ping = client.ping()
            assert ping.get("status") == "ok", ping

            ok = client.put("it:item:1", {"score": 7, "tag": "alpha"})
            assert ok is True

            record = client.get("it:item:1")
            assert record is not None
            assert record.get("fields", {}).get("score") == 7

            items = client.scan("it:")
            assert isinstance(items, list)
            assert any(i.get("key") == "it:item:1" for i in items)

            deleted = client.delete("it:item:1")
            assert deleted is True

            flush = client.flush()
            assert flush.get("ok") is True

        return 0
    finally:
        if daemon.poll() is None:
            try:
                # Terminate works consistently for this subprocess in CI/dev shells.
                daemon.terminate()
            except Exception:
                pass

            try:
                daemon.wait(timeout=5)
            except subprocess.TimeoutExpired:
                daemon.kill()

        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
