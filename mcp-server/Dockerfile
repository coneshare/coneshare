FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml README.md ./
COPY coneshare_mcp ./coneshare_mcp

RUN pip install --no-cache-dir .

ENV PYTHONUNBUFFERED=1

EXPOSE 8001

CMD ["python", "-m", "coneshare_mcp.server"]
