FROM python:3.14-slim

WORKDIR /app
RUN pip install --no-cache-dir uv==0.12.9
COPY pyproject.toml uv.lock README.md ./
COPY backend ./backend
RUN uv sync --locked --no-dev

ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--proxy-headers", "--forwarded-allow-ips", "*"]
