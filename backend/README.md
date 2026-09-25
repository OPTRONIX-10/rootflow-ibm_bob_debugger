# RootFlow Backend

This package contains the RootFlow analysis server.

## Setup

```bash
cd backend
pip install -e ".[dev]"
# or
pip install -r requirements.txt
```

## Running

```bash
python main.py
# or via uvicorn directly:
uvicorn main:app --host 127.0.0.1 --port 7331
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
# then edit .env with your values
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `WATSONX_API_KEY` | **Yes** | — | IBM Cloud IAM API key for watsonx.ai |
| `WATSONX_PROJECT_ID` | **Yes** | — | watsonx.ai project UUID |
| `WATSONX_URL` | No | `https://us-south.ml.cloud.ibm.com` | watsonx.ai service endpoint |
| `WATSONX_MODEL_ID` | No | `ibm-granite/granite-4.0-h-small` | Granite model ID |
| `ROOTFLOW_PORT` | No | `7331` | Local port the server listens on |

> **Note:** If `WATSONX_API_KEY` or `WATSONX_PROJECT_ID` are missing, the LLM
> stage is skipped gracefully — the analysis result will still include the
> call-graph trace and Git blame data, but `rootCause.explanation` will be
> `"LLM unavailable"` and `confidenceScore` will be `0`.

## Pipeline Stages

| Stage | Module | Description |
|---|---|---|
| 3 | `analyzer/ast_analyzer.py`, `analyzer/call_graph.py`, `analyzer/propagation_tracer.py` | Parse AST, build call graph, trace propagation path |
| 4 | `analyzer/git_analyzer.py` | Git blame — identify the introducing commit for the origin node |
| 5 | `analyzer/snippet_extractor.py`, `analyzer/watsonx_reasoner.py` | Extract function snippets, call Granite LLM for root-cause explanation and fix |
