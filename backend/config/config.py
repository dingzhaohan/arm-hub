import os
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)

# ─── MySQL ──────────────────────────────────────────────────
MYSQL_HOST = os.getenv("MYSQL_HOST", "rm-8vbyu20od5esyu86ldo.mysql.zhangbei.rds.aliyuncs.com")
MYSQL_PORT = os.getenv("MYSQL_PORT", "3306")
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "arm_hub")

DATABASE_URL = f"mysql+mysqlconnector://{MYSQL_USER}:{quote_plus(MYSQL_PASSWORD)}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}"

# ─── Bohrium ───────────────────────────────────────────────
BOHRIUM_ACCOUNT_API = os.getenv("BOHRIUM_ACCOUNT_API", "https://account.dp.tech")
BOHRIUM_CORE_API = os.getenv("BOHRIUM_CORE_API", "https://bohrium-core.dp.tech")
BOHRIUM_OPENPLATFORM_API = os.getenv("BOHRIUM_OPENPLATFORM_API", "https://openapi.dp.tech")
BOHRIUM_OPENPLATFORM_AK = os.getenv("BOHRIUM_OPENPLATFORM_AK", "")

# ─── OSS ───────────────────────────────────────────────────
OSS_ENDPOINT = os.getenv("OSS_ENDPOINT", "")
OSS_BUCKET = os.getenv("OSS_BUCKET", "arm-hub")
OSS_ACCESS_KEY_ID = os.getenv("OSS_ACCESS_KEY_ID", "")
OSS_ACCESS_KEY_SECRET = os.getenv("OSS_ACCESS_KEY_SECRET", "")
OSS_ROLE_ARN = os.getenv("OSS_ROLE_ARN", "")

# ─── App ───────────────────────────────────────────────────
APP_PORT = int(os.getenv("APP_PORT", "50005"))
