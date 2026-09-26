from pathlib import Path


def test_container_ignores_forwarded_headers_at_uvicorn_boundary() -> None:
    dockerfile = (Path(__file__).resolve().parents[1] / "Dockerfile").read_text(encoding="utf-8")
    assert "--no-proxy-headers" in dockerfile
    assert "--forwarded-allow-ips" not in dockerfile
