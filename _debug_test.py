import sys
sys.path.insert(0, '.')

from backend.analyzer.error_parser import parse_error
from backend.analyzer.ast_analyzer import ASTAnalyzer
from backend.analyzer.call_graph import CallGraphBuilder
from backend.analyzer.propagation_tracer import PropagationTracer
from shared.schema import RootFlowResult
from fastapi.encoders import jsonable_encoder
import json

error_text = 'ValueError: test error\nFile "backend/main.py", line 88, in analyze'
workspace_root = '.'
failure = parse_error(error_text, workspace_root=workspace_root)
print('failure:', failure)

try:
    analyzer = ASTAnalyzer(workspace_root)
    analyzer.analyze()
    builder = CallGraphBuilder(analyzer)
    builder.build()
    tracer = PropagationTracer(builder)
    propagation_path, graph_nodes, graph_edges = tracer.trace(failure)
    print('propagation_path len:', len(propagation_path))
    print('graph_nodes len:', len(graph_nodes))
    print('OK - pipeline runs without exception')
except Exception as exc:
    import traceback; traceback.print_exc()
    print('PIPELINE ERROR:', type(exc).__name__, exc)
    sys.exit(1)

# Now test the full response build + validate
import uuid
from datetime import datetime, timezone
session_id = str(uuid.uuid4())
now = datetime.now(timezone.utc).isoformat()

origin = propagation_path[0] if propagation_path else None
root_cause_file = origin.file if origin else failure.file
root_cause_line = origin.line if origin else failure.line
root_cause_symbol = origin.symbol if origin else failure.symbol

response_dict = {
    "sessionId": session_id,
    "timestamp": now,
    "errorInput": {
        "raw": error_text,
        "file": failure.file or None,
        "line": failure.line or None,
    },
    "rootCause": {
        "file": root_cause_file,
        "line": root_cause_line,
        "symbol": root_cause_symbol,
        "explanation": "test explanation",
        "confidenceScore": 0.8,
        "introducedByCommit": None,
    },
    "propagationPath": [
        {
            "id": pn.id,
            "file": pn.file,
            "line": pn.line,
            "symbol": pn.symbol,
            "role": pn.role,
            "explanation": pn.explanation,
        }
        for pn in propagation_path
    ],
    "relatedNodes": [],
    "suggestedFix": {
        "description": "fix",
        "filePath": root_cause_file,
        "originalCode": "",
        "fixedCode": "",
        "patch": "",
    },
    "graph": {
        "nodes": [
            {
                "id": gn.id,
                "label": gn.label,
                "role": gn.role,
                "file": gn.file,
                "line": gn.line,
                "symbol": gn.symbol,
            }
            for gn in graph_nodes
        ],
        "edges": [
            {
                "source": ge.source,
                "target": ge.target,
                "label": ge.label,
            }
            for ge in graph_edges
        ],
    },
}

print("\n--- Building RootFlowResult ---")
try:
    result = RootFlowResult.model_validate(response_dict)
    print("model_validate: OK")
    encoded = jsonable_encoder(result)
    print("jsonable_encoder: OK")
    print("Top-level keys:", list(encoded.keys()))
    print("rootCause keys:", list(encoded.get("rootCause", {}).keys()))
    print("Full JSON (first 500 chars):")
    print(json.dumps(encoded)[:500])
except Exception as exc:
    import traceback; traceback.print_exc()
    print("VALIDATION/SERIALIZATION ERROR:", type(exc).__name__, exc)
