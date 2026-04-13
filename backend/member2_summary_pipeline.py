import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

try:
    import requests
except ImportError:
    print("Missing dependency: requests")
    print("Install with: python -m pip install requests")
    sys.exit(1)


ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = Path(__file__).resolve().parent
DEFAULT_PDF = ROOT / "data" / "DiaG feb 2026.pdf"
IMAGES_DIR = ROOT / "data" / "images_auto"
OUTPUT_DIR = ROOT / "output"
PAGE_OUTPUT_DIR = OUTPUT_DIR / "member2_page_outputs"
SUMMARY_PATH = OUTPUT_DIR / "member2_summary.json"
PROMPT_PATH = BACKEND_DIR / "prompts" / "member2_system_prompt.md"

API_URL = os.environ.get(
    "DASHSCOPE_URL",
    "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
)
MODEL = os.environ.get("DASHSCOPE_MODEL", "qwen-vl-max")

SEVERITY_RANK = {
    "normal": 0,
    "unknown": 1,
    "abnormal_low": 2,
    "abnormal_high": 2,
}


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
    env_file = read_env_file()
    return os.environ.get("DASHSCOPE_API_KEY", "") or env_file.get("DASHSCOPE_API_KEY", "")


def to_data_url(file_path: Path) -> str:
    ext = file_path.suffix.lower()
    mime = "image/png" if ext == ".png" else "image/jpeg"
    b64 = file_path.read_bytes().hex()
    # Convert hex back to bytes to avoid extra deps while keeping ASCII source.
    raw = bytes.fromhex(b64)
    import base64

    enc = base64.b64encode(raw).decode("utf-8")
    return f"data:{mime};base64,{enc}"


def call_qwen(api_key: str, system_prompt: str, user_text: str, image_path: Path, max_tokens: int = 1200, temperature: float = 0.0) -> str:
    payload = {
        "model": MODEL,
        "input": {
            "messages": [
                {"role": "system", "content": [{"type": "text", "text": system_prompt}]},
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "image": to_data_url(image_path)},
                        {"type": "text", "text": user_text},
                    ],
                },
            ]
        },
        "parameters": {
            "result_format": "message",
            "max_tokens": max_tokens,
            "temperature": temperature,
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


def extract_json(raw: str):
    txt = raw.strip()
    if txt.startswith("{") or txt.startswith("["):
        return json.loads(txt)
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", txt)
    if m:
        return json.loads(m.group(1).strip())
    raise ValueError("Model output is not valid JSON")


def convert_pdf_to_png(pdf_path: Path, out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    if fitz is not None:
        doc = fitz.open(pdf_path)
        outputs = []
        for i in range(doc.page_count):
            page = doc.load_page(i)
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            out = out_dir / f"{pdf_path.stem.replace(' ', '_')}_p{i+1:02d}.png"
            pix.save(str(out))
            outputs.append(out)
        return outputs

    pdftoppm_bin = shutil.which("pdftoppm")
    if not pdftoppm_bin:
        raise RuntimeError("Missing PDF renderer. Install pymupdf or ensure pdftoppm is available.")

    prefix = out_dir / pdf_path.stem.replace(" ", "_")
    subprocess.run(
        [
            pdftoppm_bin,
            "-png",
            "-r",
            "200",
            str(pdf_path),
            str(prefix),
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    outputs = sorted(out_dir.glob(f"{prefix.name}-*.png"))
    if not outputs:
        raise RuntimeError("pdftoppm did not generate any page images")
    return outputs


def classify_page(api_key: str, image_path: Path) -> dict:
    prompt = (
        "You are a strict document page classifier. Return JSON only. "
        "Classify if this page contains medical lab measurement table with indicators, values, reference ranges, units."
    )
    user = (
        "Return exactly this JSON schema: "
        '{"page_type":"medical_data|non_medical_page","confidence":0.0,"reason":"short"}. '
        "If mostly stamp/signature/logo/footer with no useful lab table, use non_medical_page."
    )
    raw = call_qwen(api_key, prompt, user, image_path, max_tokens=200, temperature=0.0)
    parsed = extract_json(raw)
    if "page_type" not in parsed:
        parsed["page_type"] = "non_medical_page"
    return parsed


def merge_results(page_results: list[dict]) -> dict:
    patient_name = None
    analysis_date = None
    merged = []

    for page in page_results:
        payload = page["payload"]
        if payload.get("status") != "success":
            continue
        if patient_name is None and payload.get("patient_name") not in [None, ""]:
            patient_name = payload.get("patient_name")
        if analysis_date is None and payload.get("analysis_date") not in [None, ""]:
            analysis_date = payload.get("analysis_date")

        for item in payload.get("results", []):
            x = dict(item)
            x["source_page"] = page["page_number"]
            merged.append(x)

    seen = set()
    unique = []
    for item in merged:
        key = (
            str(item.get("indicator_name", "")).strip().lower(),
            str(item.get("value", "")).strip(),
            str(item.get("unit", "")).strip().lower(),
            str(item.get("reference_range", "")).strip().lower(),
            str(item.get("organ_id", "")).strip().lower(),
            str(item.get("severity", "")).strip().lower(),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)

    organ_stats = {}
    for item in unique:
        organ = item.get("organ_id", "unknown")
        sev = item.get("severity", "unknown")
        if organ not in organ_stats:
            organ_stats[organ] = {"worst_severity": sev, "indicator_count": 0, "abnormal_count": 0}
        organ_stats[organ]["indicator_count"] += 1
        if sev in ("abnormal_high", "abnormal_low"):
            organ_stats[organ]["abnormal_count"] += 1

        current = organ_stats[organ]["worst_severity"]
        if SEVERITY_RANK.get(sev, 1) > SEVERITY_RANK.get(current, 1):
            organ_stats[organ]["worst_severity"] = sev

    organ_summary = [{"organ_id": k, **v} for k, v in sorted(organ_stats.items())]

    return {
        "status": "success",
        "patient_name": patient_name,
        "analysis_date": analysis_date,
        "results": unique,
        "summary": {
            "total_results_raw": len(merged),
            "total_results_unique": len(unique),
            "organ_summary": organ_summary,
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Member2 pipeline: PDF->PNG->classify->extract->summary")
    parser.add_argument("--pdf", default=str(DEFAULT_PDF), help="Input PDF path")
    parser.add_argument("--max-pages", type=int, default=0, help="Limit processed pages (0 = all)")
    parser.add_argument("--images-dir", default=str(IMAGES_DIR), help="Directory for extracted page images")
    parser.add_argument("--page-output-dir", default=str(PAGE_OUTPUT_DIR), help="Directory for per-page JSON outputs")
    parser.add_argument("--summary-out", default=str(SUMMARY_PATH), help="Path for merged summary JSON")
    parser.add_argument("--stdout-json", action="store_true", help="Print final summary JSON to stdout")
    args = parser.parse_args()

    api_key = get_api_key()
    if not api_key:
        raise RuntimeError("Missing DASHSCOPE_API_KEY in env or backend/.env")

    pdf_path = Path(args.pdf)
    if not pdf_path.is_absolute():
        pdf_path = ROOT / pdf_path
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    images_dir = Path(args.images_dir)
    if not images_dir.is_absolute():
        images_dir = ROOT / images_dir

    page_output_dir = Path(args.page_output_dir)
    if not page_output_dir.is_absolute():
        page_output_dir = ROOT / page_output_dir

    summary_out = Path(args.summary_out)
    if not summary_out.is_absolute():
        summary_out = ROOT / summary_out

    summary_out.parent.mkdir(parents=True, exist_ok=True)
    page_output_dir.mkdir(parents=True, exist_ok=True)

    log_stream = sys.stderr if args.stdout_json else sys.stdout

    pages = convert_pdf_to_png(pdf_path, images_dir)
    if args.max_pages > 0:
        pages = pages[: args.max_pages]

    system_prompt = PROMPT_PATH.read_text(encoding="utf-8").strip()

    page_runs = []
    page_meta = []

    for idx, image_path in enumerate(pages, start=1):
        print(f"[page {idx}] classify {image_path.name}", file=log_stream)
        cls = classify_page(api_key, image_path)
        is_data = cls.get("page_type") == "medical_data"
        page_meta.append(
            {
                "page_number": idx,
                "image": str(image_path),
                "classification": cls,
                "selected_for_extraction": bool(is_data),
            }
        )
        if not is_data:
            continue

        print(f"[page {idx}] extract", file=log_stream)
        raw = call_qwen(
            api_key,
            system_prompt,
            "Phan tich toan bo chi so xet nghiem tren trang nay va tra ve JSON theo contract.",
            image_path,
            max_tokens=2200,
            temperature=0.0,
        )
        payload = extract_json(raw)
        out_file = page_output_dir / f"page_{idx:02d}.json"
        out_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        page_runs.append({"page_number": idx, "image": str(image_path), "payload": payload, "output": str(out_file)})

    merged = merge_results(page_runs)
    merged["pages"] = page_meta
    merged["summary"]["total_pages"] = len(pages)
    merged["summary"]["selected_pages"] = len(page_runs)
    merged["summary"]["skipped_pages"] = len(pages) - len(page_runs)

    summary_out.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Summary written: {summary_out}", file=log_stream)
    print(f"Page outputs dir: {page_output_dir}", file=log_stream)

    if args.stdout_json:
        print(json.dumps(merged, ensure_ascii=False))


if __name__ == "__main__":
    main()
