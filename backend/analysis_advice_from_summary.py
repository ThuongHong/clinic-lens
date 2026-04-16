import argparse
import json
import os
import re
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = Path(__file__).resolve().parent
DEFAULT_SUMMARY_PATH = ROOT / "output" / "analysis_summary.json"
DEFAULT_OUTPUT_PATH = ROOT / "output" / "analysis_advice.json"

API_URL = os.environ.get(
    "DASHSCOPE_URL",
    "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
)
MODEL = os.environ.get("DASHSCOPE_MODEL", "qwen-vl-max")


def read_env_file() -> dict:
    env_path = BACKEND_DIR / ".env"
    if not env_path.exists():
        return {}

    data = {}
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def get_api_key() -> str:
    local_env = read_env_file()
    return os.environ.get("DASHSCOPE_API_KEY", "") or local_env.get(
        "DASHSCOPE_API_KEY", ""
    )


def extract_json(raw: str):
    txt = raw.strip()
    if txt.startswith("{") or txt.startswith("["):
        return json.loads(txt)
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", txt)
    if m:
        return json.loads(m.group(1).strip())
    raise ValueError("Model output is not valid JSON")


def validate_advice_schema(payload: dict) -> list[str]:
    errs = []
    if not isinstance(payload, dict):
        return ["Advice payload must be JSON object"]

    required_top = [
        "status",
        "patient_name",
        "analysis_date",
        "overall_assessment",
        "priority_level",
        "organ_advice",
        "general_recommendations",
        "disclaimer",
    ]
    for k in required_top:
        if k not in payload:
            errs.append(f"missing top-level field: {k}")

    if payload.get("status") not in ["success", "error"]:
        errs.append("status must be success|error")

    if payload.get("status") == "error":
        if "error_message" not in payload:
            errs.append("error status requires error_message")
        return errs

    if payload.get("priority_level") not in ["low", "medium", "high"]:
        errs.append("priority_level must be low|medium|high")

    if not isinstance(payload.get("organ_advice"), list):
        errs.append("organ_advice must be array")
    else:
        for i, x in enumerate(payload["organ_advice"]):
            for k in ["organ_id", "risk", "summary", "advice"]:
                if k not in x:
                    errs.append(f"organ_advice[{i}] missing {k}")

    if not isinstance(payload.get("general_recommendations"), list):
        errs.append("general_recommendations must be array")

    return errs


def call_advice_model(api_key: str, summary_payload: dict) -> str:
    system_prompt = (
        "You are an experienced clinician-style assistant explaining lab results to a patient. "
        "Task: provide high-level recommendations based on the extracted summary. "
        "Do not provide an official diagnosis and do not recommend specific drugs. "
        "Return pure JSON only, following the required schema, with no extra text outside JSON."
    )

    user_prompt = (
        "Based on the summary JSON below, return JSON with this exact schema:\n"
        "{\n"
        '  "status": "success|error",\n'
        '  "patient_name": "string|null",\n'
        '  "analysis_date": "YYYY-MM-DD|null",\n'
        '  "overall_assessment": "2-4 English sentences",\n'
        '  "priority_level": "low|medium|high",\n'
        '  "organ_advice": [\n'
        "    {\n"
        '      "organ_id": "kidneys|liver|heart|pancreas|thyroid|blood|bone|immune",\n'
        '      "risk": "normal|watch|alert",\n'
        '      "summary": "1-2 short sentences",\n'
        '      "advice": "1-3 clear and practical sentences"\n'
        "    }\n"
        "  ],\n"
        '  "general_recommendations": ["...", "..."],\n'
        '  "disclaimer": "for reference only, does not replace medical consultation"\n'
        "}\n"
        "If summary data is invalid, return:\n"
        '{"status":"error","error_message":"..."}\n\n'
        f"SUMMARY_JSON:\n{json.dumps(summary_payload, ensure_ascii=False)}"
    )

    payload = {
        "model": MODEL,
        "input": {
            "messages": [
                {
                    "role": "system",
                    "content": [{"type": "text", "text": system_prompt}],
                },
                {"role": "user", "content": [{"type": "text", "text": user_prompt}]},
            ]
        },
        "parameters": {
            "result_format": "message",
            "max_tokens": 1800,
            "temperature": 0.1,
        },
    }

    resp = requests.post(
        API_URL,
        json=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        timeout=240,
    )

    if resp.status_code != 200:
        raise RuntimeError(f"Qwen HTTP {resp.status_code}: {resp.text[:800]}")

    data = resp.json()
    content = data["output"]["choices"][0]["message"]["content"]
    if isinstance(content, list):
        return "".join(x.get("text", "") for x in content)
    return str(content)


def main():
    parser = argparse.ArgumentParser(
        description="Create doctor-style advice from summary JSON"
    )
    parser.add_argument(
        "--summary", default=str(DEFAULT_SUMMARY_PATH), help="Path to summary JSON"
    )
    parser.add_argument(
        "--output", default=str(DEFAULT_OUTPUT_PATH), help="Path to advice output JSON"
    )
    args = parser.parse_args()

    api_key = get_api_key()
    if not api_key:
        raise RuntimeError("Missing DASHSCOPE_API_KEY in env or backend/.env")

    summary_path = Path(args.summary)
    if not summary_path.is_absolute():
        summary_path = ROOT / summary_path

    output_path = Path(args.output)
    if not output_path.is_absolute():
        output_path = ROOT / output_path

    if not summary_path.exists():
        raise FileNotFoundError(f"Summary not found: {summary_path}")

    summary_payload = json.loads(summary_path.read_text(encoding="utf-8"))
    raw = call_advice_model(api_key, summary_payload)
    advice = extract_json(raw)

    schema_errors = validate_advice_schema(advice)
    wrapped = {
        "schema_valid": len(schema_errors) == 0,
        "schema_errors": schema_errors,
        "advice": advice,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(wrapped, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Advice written: {output_path}")
    print(f"schema_valid={wrapped['schema_valid']}")


if __name__ == "__main__":
    main()
