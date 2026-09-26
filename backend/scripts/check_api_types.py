"""Generate or check the small public TypeScript contract from Pydantic schemas."""

import json
import sys
from pathlib import Path
from typing import Any

from backend.app.schemas.weather import Location, WeatherResponse

TARGET = Path(__file__).resolve().parents[2] / "frontend/src/lib/api-types.ts"


def ts_type(schema: dict[str, Any]) -> str:
    if "$ref" in schema:
        return str(schema["$ref"]).rsplit("/", 1)[-1]
    if "anyOf" in schema:
        return " | ".join(ts_type(item) for item in schema["anyOf"])
    if "enum" in schema:
        return " | ".join(json.dumps(item, ensure_ascii=False) for item in schema["enum"])
    kind = schema.get("type")
    if kind == "array":
        return f"Array<{ts_type(schema['items'])}>"
    if kind == "object":
        return "Record<string, unknown>"
    mapping = {
        "string": "string",
        "number": "number",
        "integer": "number",
        "boolean": "boolean",
        "null": "null",
    }
    if not isinstance(kind, str) or kind not in mapping:
        raise ValueError(f"Unsupported schema type: {kind}")
    return mapping[kind]


def declaration(name: str, schema: dict[str, Any]) -> str:
    required = set(schema.get("required", []))
    lines = [f"export type {name} = {{"]
    for field, field_schema in schema["properties"].items():
        optional = "" if field in required else "?"
        lines.append(f"  {field}{optional}: {ts_type(field_schema)};")
    return "\n".join([*lines, "};"])


def generated() -> str:
    weather = WeatherResponse.model_json_schema()
    models = {"Location": Location.model_json_schema(), **weather["$defs"], "Weather": weather}
    header = (
        "// Generated from backend Pydantic response schemas. "
        "Run: uv run python -m backend.scripts.check_api_types --write\n\n"
    )
    return header + "\n\n".join(declaration(name, schema) for name, schema in models.items()) + "\n"


def main() -> int:
    expected = generated()
    if "--write" in sys.argv:
        TARGET.write_text(expected, encoding="utf-8")
        return 0
    if not TARGET.exists() or TARGET.read_text(encoding="utf-8") != expected:
        print("Frontend API types are out of date.")
        print("Run: uv run python -m backend.scripts.check_api_types --write")
        return 1
    print("Frontend API types match backend Pydantic schemas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
