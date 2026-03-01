"""OSS service: upload, download, signed URLs, code.zip extraction, manifest generation."""
import io
import json
import logging
import mimetypes
import zipfile
from datetime import datetime, timezone
from typing import Optional

import oss2

from config.config import OSS_ENDPOINT, OSS_BUCKET, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET

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
