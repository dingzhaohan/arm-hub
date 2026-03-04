"""OSS service: upload, download, STS tokens, signed URLs, code.zip extraction, manifest generation."""
import io
import json
import logging
import mimetypes
import zipfile
from datetime import datetime, timezone
from typing import Optional

import oss2
from aliyunsdkcore import client as aliyun_client
from aliyunsdksts.request.v20150401.AssumeRoleRequest import AssumeRoleRequest

from config.config import (
    OSS_ENDPOINT, OSS_BUCKET, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_ROLE_ARN,
)

logger = logging.getLogger(__name__)

# ─── Singleton bucket ──────────────────────────────────────

_bucket: Optional[oss2.Bucket] = None


def get_bucket() -> oss2.Bucket:
    global _bucket
    if _bucket is None:
        if not OSS_ACCESS_KEY_ID or not OSS_ACCESS_KEY_SECRET or not OSS_ENDPOINT:
            raise RuntimeError("OSS credentials not configured")
        auth = oss2.Auth(OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET)
        _bucket = oss2.Bucket(auth, OSS_ENDPOINT, OSS_BUCKET)
    return _bucket


def is_configured() -> bool:
    return bool(OSS_ACCESS_KEY_ID and OSS_ACCESS_KEY_SECRET and OSS_ENDPOINT)


# ─── STS Token ────────────────────────────────────────────

def get_sts_token(path_prefix: str, duration_seconds: int = 3600) -> dict:
    """Get temporary STS credentials scoped to a path prefix in the bucket.

    Returns dict with accessKeyId, accessKeySecret, securityToken, expiration.
    """
    if not OSS_ROLE_ARN:
        raise RuntimeError("OSS_ROLE_ARN not configured — required for STS")

    # Extract region from endpoint, e.g. https://oss-cn-beijing.aliyuncs.com → cn-beijing
    endpoint_host = OSS_ENDPOINT.replace("https://", "").replace("http://", "")
    region_id = endpoint_host.split(".")[0].replace("oss-", "")

    acs_client = aliyun_client.AcsClient(
        OSS_ACCESS_KEY_ID,
        OSS_ACCESS_KEY_SECRET,
        region_id,
    )

    # Grant full OSS access under the given prefix
    policy = json.dumps({
        "Version": "1",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": ["oss:*"],
                "Resource": [
                    f"acs:oss:*:*:{OSS_BUCKET}/{path_prefix}/*",
                ],
            }
        ],
    })

    req = AssumeRoleRequest()
    req.set_accept_format("json")
    req.set_RoleArn(OSS_ROLE_ARN)
    req.set_RoleSessionName("arm-hub-upload")
    req.set_DurationSeconds(duration_seconds)
    req.set_Policy(policy)

    resp = acs_client.do_action_with_exception(req)
    data = json.loads(resp)
    creds = data["Credentials"]

    return {
        "access_key_id": creds["AccessKeyId"],
        "access_key_secret": creds["AccessKeySecret"],
        "security_token": creds["SecurityToken"],
        "expiration": creds["Expiration"],
    }


# ─── Basic operations ─────────────────────────────────────

def put_object(key: str, data: bytes) -> None:
    get_bucket().put_object(key, data)


def get_object(key: str) -> bytes:
    return get_bucket().get_object(key).read()


def object_exists(key: str) -> bool:
    return get_bucket().object_exists(key)


def delete_object(key: str) -> None:
    get_bucket().delete_object(key)


def head_object(key: str) -> dict:
    """Return size and content-type of an object."""
    result = get_bucket().head_object(key)
    return {
        "size": result.content_length,
        "content_type": result.content_type,
        "last_modified": result.last_modified,
    }


def sign_url(key: str, expires: int = 3600, method: str = "GET") -> str:
    """Generate a pre-signed URL for download (GET) or upload (PUT)."""
    return get_bucket().sign_url(method, key, expires)


def sign_download_url(key: str, expires: int = 3600) -> str:
    return sign_url(key, expires, "GET")


def sign_upload_url(key: str, expires: int = 3600) -> str:
    return sign_url(key, expires, "PUT")


def list_objects(prefix: str, delimiter: str = "/", max_keys: int = 1000) -> dict:
    """List objects under a prefix. Returns {dirs: [...], files: [...]}."""
    bucket = get_bucket()
    result = bucket.list_objects(prefix=prefix, delimiter=delimiter, max_keys=max_keys)
    dirs = [p for p in (result.prefix_list or [])]
    files = [{"key": obj.key, "size": obj.size} for obj in (result.object_list or [])
             if obj.key != prefix]  # exclude the prefix itself
    return {"dirs": dirs, "files": files}


# ─── Code zip extraction + manifest ───────────────────────

MAX_EXTRACT_FILES = 5000
MAX_EXTRACT_TOTAL_SIZE = 500 * 1024 * 1024  # 500MB

# Required top-level folders in ARM zip (case-insensitive)
REQUIRED_ARM_FOLDERS = {"code", "report", "dataset", "trace"}


def extract_arm_zip(arm_zip_key: str, storage_prefix: str) -> dict:
    """Download arm.zip from OSS, extract all contents, auto-detect structure.

    Supports any zip structure — no required folders. Extracts everything to
    code/extracted/ and generates a manifest. Looks for markdown files to use
    as report (README.md, REPORT.md, RESULT.md etc).

    Returns dict with manifest and all module OSS keys.
    Raises ValueError on validation failure.
    """
    bucket = get_bucket()

    # Download zip
    zip_bytes = bucket.get_object(arm_zip_key).read()

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        # ── Pass 1: scan structure ──────────────────────────
        total_size = 0
        file_count = 0

        for info in zf.infolist():
            # Security: ZipSlip prevention
            if ".." in info.filename or info.filename.startswith("/"):
                raise ValueError(f"Unsafe path in zip: {info.filename}")
            if info.external_attr >> 16 & 0o120000 == 0o120000:
                continue
            if info.is_dir():
                continue

            file_count += 1
            if file_count > MAX_EXTRACT_FILES:
                raise ValueError(f"Zip contains too many files (>{MAX_EXTRACT_FILES})")
            total_size += info.file_size
            if total_size > MAX_EXTRACT_TOTAL_SIZE:
                raise ValueError(f"Zip total size exceeds limit ({MAX_EXTRACT_TOTAL_SIZE // 1024 // 1024}MB)")

        # Detect if zip has a common top-level prefix (single root folder)
        all_names = [n for n in zf.namelist() if not n.endswith("/")]
        common_prefix = ""
        if all_names:
            first_parts = all_names[0].split("/")
            if len(first_parts) > 1:
                candidate = first_parts[0] + "/"
                if all(n.startswith(candidate) for n in all_names):
                    common_prefix = candidate

        # Check for legacy 4-folder structure (Code/Report/Dataset/Trace)
        top_folders = set()
        for name in all_names:
            stripped = name[len(common_prefix):] if common_prefix else name
            parts = stripped.split("/")
            if len(parts) >= 2 and parts[0]:
                top_folders.add(parts[0].lower())

        is_legacy = top_folders >= {"code", "report"}

        # ── Pass 2: extract files ──────────────────────────────
        code_files_list = []
        code_total_size = 0
        code_file_count = 0
        report_md_key = None
        report_md_candidates = []
        code_zip_buffer = io.BytesIO()
        code_zip_out = zipfile.ZipFile(code_zip_buffer, "w", zipfile.ZIP_DEFLATED)
        trace_zip_buffer = io.BytesIO()
        trace_zip_out = zipfile.ZipFile(trace_zip_buffer, "w", zipfile.ZIP_DEFLATED)

        for info in zf.infolist():
            if info.is_dir():
                continue
            if ".." in info.filename or info.filename.startswith("/"):
                continue
            if info.external_attr >> 16 & 0o120000 == 0o120000:
                continue

            raw_path = info.filename
            # Strip common prefix
            rel_path = raw_path[len(common_prefix):] if common_prefix else raw_path
            if not rel_path:
                continue

            data = zf.read(info.filename)

            if is_legacy:
                # Legacy mode: split by top-level folder
                parts = rel_path.split("/")
                if len(parts) < 2 or not parts[0]:
                    continue
                top_norm = parts[0].lower()
                inner_path = "/".join(parts[1:])
                if not inner_path:
                    continue

                if top_norm == "code":
                    extracted_key = f"{storage_prefix}/code/extracted/{inner_path}"
                    bucket.put_object(extracted_key, data)
                    code_zip_out.writestr(inner_path, data)
                    code_file_count += 1
                    code_total_size += info.file_size
                    ext = ("." + inner_path.rsplit(".", 1)[-1]).lower() if "." in inner_path else ""
                    code_files_list.append({
                        "path": inner_path,
                        "size": info.file_size,
                        "is_text": ext in TEXT_EXTENSIONS,
                        "lang": LANG_MAP.get(ext, None),
                    })
                elif top_norm == "report":
                    if inner_path.lower().endswith(".md"):
                        report_md_key = f"{storage_prefix}/report/report.md"
                        bucket.put_object(report_md_key, data)
                elif top_norm == "trace":
                    trace_key = f"{storage_prefix}/trace/{inner_path}"
                    bucket.put_object(trace_key, data)
                    trace_zip_out.writestr(inner_path, data)
                elif top_norm == "dataset":
                    dataset_key = f"{storage_prefix}/dataset/{inner_path}"
                    bucket.put_object(dataset_key, data)
            else:
                # Flat mode: treat entire zip as code, auto-detect report md
                extracted_key = f"{storage_prefix}/code/extracted/{rel_path}"
                bucket.put_object(extracted_key, data)
                code_zip_out.writestr(rel_path, data)
                code_file_count += 1
                code_total_size += info.file_size
                ext = ("." + rel_path.rsplit(".", 1)[-1]).lower() if "." in rel_path else ""
                code_files_list.append({
                    "path": rel_path,
                    "size": info.file_size,
                    "is_text": ext in TEXT_EXTENSIONS,
                    "lang": LANG_MAP.get(ext, None),
                })

                # Collect top-level .md files as report candidates
                basename = rel_path.split("/")[-1].lower()
                depth = len(rel_path.split("/"))
                if depth == 1 and basename.endswith(".md"):
                    report_md_candidates.append((basename, rel_path, data))

        # Finalize code.zip
        code_zip_out.close()
        code_zip_key = f"{storage_prefix}/code/code.zip"
        bucket.put_object(code_zip_key, code_zip_buffer.getvalue())

        # Finalize trace.zip
        trace_zip_out.close()
        trace_zip_key = f"{storage_prefix}/trace/trace.zip"
        bucket.put_object(trace_zip_key, trace_zip_buffer.getvalue())

        # Auto-detect report md from flat zip (priority order)
        if not report_md_key and report_md_candidates:
            priority = ["readme.md", "report.md", "result.md"]
            for pname in priority:
                match = [c for c in report_md_candidates if c[0] == pname]
                if match:
                    report_md_key = f"{storage_prefix}/report/report.md"
                    bucket.put_object(report_md_key, match[0][2])
                    break
            if not report_md_key:
                # Use first .md found
                report_md_key = f"{storage_prefix}/report/report.md"
                bucket.put_object(report_md_key, report_md_candidates[0][2])

    # Build code manifest
    manifest = {
        "root": "",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_files": code_file_count,
        "total_size": code_total_size,
        "files": code_files_list,
    }
    manifest_key = f"{storage_prefix}/code/manifest.json"
    bucket.put_object(manifest_key, json.dumps(manifest, ensure_ascii=False, indent=2).encode())

    return {
        "manifest": manifest,
        "code_zip_key": code_zip_key,
        "code_manifest_key": manifest_key,
        "report_md_key": report_md_key,
        "trace_zip_key": trace_zip_key,
    }


def extract_code_zip(code_zip_key: str, storage_prefix: str) -> dict:
    """Download code.zip from OSS, extract to extracted/, generate manifest.json.

    Returns manifest dict. Raises ValueError on validation failure.
    """
    bucket = get_bucket()

    # Download zip
    zip_bytes = bucket.get_object(code_zip_key).read()

    files_list = []
    total_size = 0
    file_count = 0
    has_readme = False

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for info in zf.infolist():
            # Security: prevent ZipSlip
            if ".." in info.filename or info.filename.startswith("/"):
                raise ValueError(f"Unsafe path in zip: {info.filename}")
            # Skip symlinks
            if info.external_attr >> 16 & 0o120000 == 0o120000:
                continue

            if info.is_dir():
                continue

            file_count += 1
            if file_count > MAX_EXTRACT_FILES:
                raise ValueError(f"Zip contains too many files (>{MAX_EXTRACT_FILES})")

            total_size += info.file_size
            if total_size > MAX_EXTRACT_TOTAL_SIZE:
                raise ValueError(f"Zip total size exceeds limit ({MAX_EXTRACT_TOTAL_SIZE // 1024 // 1024}MB)")

            # Check README
            basename = info.filename.split("/")[-1].lower()
            if basename == "readme.md":
                has_readme = True

            # Determine if text
            ext = ("." + info.filename.rsplit(".", 1)[-1]).lower() if "." in info.filename else ""
            is_text = ext in TEXT_EXTENSIONS
            lang = LANG_MAP.get(ext, None)

            files_list.append({
                "path": info.filename,
                "size": info.file_size,
                "is_text": is_text,
                "lang": lang,
            })

            # Upload extracted file to OSS
            extracted_key = f"{storage_prefix}/code/extracted/{info.filename}"
            data = zf.read(info.filename)
            bucket.put_object(extracted_key, data)

    if not has_readme:
        raise ValueError("code.zip must contain a README.md at root level")

    # Build manifest
    manifest = {
        "root": "",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_files": file_count,
        "total_size": total_size,
        "files": files_list,
    }

    # Upload manifest.json
    manifest_key = f"{storage_prefix}/code/manifest.json"
    bucket.put_object(manifest_key, json.dumps(manifest, ensure_ascii=False, indent=2).encode())

    return manifest


def get_manifest(manifest_key: str) -> Optional[dict]:
    """Download and parse manifest.json from OSS."""
    try:
        data = get_bucket().get_object(manifest_key).read()
        return json.loads(data)
    except Exception:
        return None


def get_text_content(key: str, max_size: int = 1024 * 1024) -> Optional[str]:
    """Read a text file from OSS, return content string (max 1MB)."""
    try:
        head = head_object(key)
        if head["size"] > max_size:
            return None
        data = get_bucket().get_object(key).read()
        return data.decode("utf-8", errors="replace")
    except Exception:
        return None


# ─── Text file detection ──────────────────────────────────

TEXT_EXTENSIONS = {
    ".md", ".txt", ".py", ".json", ".yaml", ".yml", ".toml", ".cfg",
    ".sh", ".bash", ".r", ".jl", ".js", ".ts", ".tsx", ".jsx",
    ".csv", ".xml", ".html", ".htm", ".css", ".scss",
    ".ini", ".conf", ".log", ".tex", ".bib", ".rst",
    ".c", ".cpp", ".h", ".hpp", ".java", ".go", ".rs", ".rb",
    ".pl", ".lua", ".sql", ".dockerfile", ".makefile", ".cmake",
    ".gitignore", ".env", ".in", ".out", ".dat",
    ".ipynb", ".lock", ".map", ".svg",
}

LANG_MAP = {
    ".py": "python", ".js": "javascript", ".ts": "typescript",
    ".tsx": "typescript", ".jsx": "javascript",
    ".json": "json", ".yaml": "yaml", ".yml": "yaml",
    ".md": "markdown", ".html": "html", ".htm": "html",
    ".css": "css", ".scss": "scss",
    ".sh": "bash", ".bash": "bash",
    ".c": "c", ".cpp": "cpp", ".h": "c", ".hpp": "cpp",
    ".java": "java", ".go": "go", ".rs": "rust", ".rb": "ruby",
    ".r": "r", ".jl": "julia", ".lua": "lua", ".sql": "sql",
    ".tex": "latex", ".xml": "xml", ".toml": "toml",
    ".ini": "ini", ".cfg": "ini",
}
