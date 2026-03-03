"""BohrClaw provisioner — create a Bohrium node, wait for readiness,
remote-start OpenClaw, and return the Web UI URL.

All openapi calls use the platform-level access key (BOHRIUM_OPENPLATFORM_AK)
and the base URL from config (BOHRIUM_OPENPLATFORM_API).
"""

import json
import logging
import re
import time
import urllib.request
import urllib.error

from config.config import BOHRIUM_OPENPLATFORM_API, BOHRIUM_OPENPLATFORM_AK, BOHRCLAW_IMAGE_ID

logger = logging.getLogger(__name__)

# Chatbohr LLM provision endpoint
LLM_PROVISION_URL = "https://chatbohr.dp.tech/api/v1/llm/provision"

# Default models for LLM provisioning
DEFAULT_LLM_MODELS = [
    "openapi/claude-4.5-sonnet",
    "openapi/claude-4.6-opus",
    "openapi/gpt-5.2",
    "openapi/gemini-3-pro",
    "openapi/glm-4.6",
    "openapi/deepseek-r1",
    "openapi/qwen-plus",
]

# Default node config
DEFAULT_DISK_SIZE = 40
DEFAULT_TURNOFF_AFTER = -1  # -1 = never auto shutdown
DEFAULT_NODE_NAME = "bobot-open"
DEFAULT_MODEL_ID = "openapi/claude-4.5-sonnet"

# Machine type → SKU ID mapping
_SKU_MAP = {
    "c2_m4_cpu": 388,
    "c2_m8_cpu": 389,
    "c4_m8_cpu": 409,
    "c4_m16_cpu": 405,
    "c8_m16_cpu": 427,
    "c8_m32_cpu": 430,
    "c12_m24_cpu": 362,
    "c16_m32_cpu": 371,
    "c32_m64_cpu": 395,
}
DEFAULT_SKU_ID = 388  # c2_m4_cpu


def _openapi_base() -> str:
    """Return the openapi base URL (e.g. https://openapi.dp.tech/openapi/v1)."""
    base = BOHRIUM_OPENPLATFORM_API.rstrip("/")
    return f"{base}/openapi/v1"


def _platform_ak() -> str:
    """Return the platform-level access key."""
    if not BOHRIUM_OPENPLATFORM_AK:
        raise RuntimeError("BOHRIUM_OPENPLATFORM_AK not configured")
    return BOHRIUM_OPENPLATFORM_AK


def _api_request(url: str, *, method: str = "GET", headers: dict = None,
                 data: dict = None, timeout: int = 30) -> dict:
    """Make an HTTP request, return parsed JSON body."""
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


# ---------------------------------------------------------------------------
# Get user's project ID via openapi
# ---------------------------------------------------------------------------
def get_user_project_id(access_key: str) -> int:
    """Fetch the user's first project ID via openapi project list.

    Prefers the first project where the user is admin (projectRole=1),
    falls back to the first project in the list.
    Raises RuntimeError if no projects found.
    """
    resp = _api_request(
        f"{_openapi_base()}/project/list",
        headers={"accessKey": access_key},
    )
    items = resp.get("data", {}).get("items") or []
    if not items:
        raise RuntimeError("No Bohrium projects found for this user")

    # Prefer admin project
    for item in items:
        if item.get("projectRole") == 1:
            logger.info("Using admin project: %s (id=%s)", item.get("name"), item["id"])
            return item["id"]

    # Fallback to first project
    logger.info("Using first project: %s (id=%s)", items[0].get("name"), items[0]["id"])
    return items[0]["id"]


# ---------------------------------------------------------------------------
# Step 1: Provision LLM access key
# ---------------------------------------------------------------------------
def provision_llm_key(email: str, access_key: str) -> None:
    """Register the user's access key for LLM model access."""
    try:
        _api_request(
            LLM_PROVISION_URL,
            method="POST",
            data={"email": email, "models": DEFAULT_LLM_MODELS, "access_key": access_key},
        )
        logger.info("LLM key provisioned for %s", email)
    except urllib.error.HTTPError as e:
        if e.code != 400:
            logger.warning("LLM provision returned %s for %s", e.code, email)
    except Exception as e:
        logger.warning("LLM provision failed (non-fatal): %s", e)


# ---------------------------------------------------------------------------
# Step 2: Create Bohrium node
# ---------------------------------------------------------------------------
def create_node(access_key: str, project_id: str, *,
                machine_type: str = "c2_m4_cpu") -> int:
    """Create a Bohrium node and return its node ID."""
    sku_id = _SKU_MAP.get(machine_type, DEFAULT_SKU_ID)
    resp = _api_request(
        f"{_openapi_base()}/node/add",
        method="POST",
        headers={"accessKey": access_key},
        data={
            "name": DEFAULT_NODE_NAME,
            "imageId": BOHRCLAW_IMAGE_ID,
            "skuId": sku_id,
            "diskSize": DEFAULT_DISK_SIZE,
            "projectId": int(project_id),
            "platform": "ali",
            "device": "container",
            "turnoffAfter": DEFAULT_TURNOFF_AFTER,
            "datasets": [],
        },
    )
    if resp.get("code") != 0:
        raise RuntimeError(f"Node creation failed: {resp}")
    node_id = resp["data"]["id"]
    logger.info("Node created: %s", node_id)
    return node_id


# ---------------------------------------------------------------------------
# Step 3: Poll until node is ready (status == 2)
# ---------------------------------------------------------------------------
def wait_for_node(access_key: str, node_id: int,
                  timeout_seconds: int = 300, poll_interval: int = 5) -> dict:
    """Poll the node list until the given node reaches status 2 (ready).

    Returns a dict with keys: ip, domainName, nodePwd.
    Raises TimeoutError if the node doesn't become ready in time.
    """
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        resp = _api_request(
            f"{_openapi_base()}/node/list?queryType=private",
            headers={"accessKey": access_key},
        )
        for item in (resp.get("data", {}).get("items") or []):
            if item.get("nodeId") == node_id:
                if item.get("status") == 2:
                    return {
                        "ip": item.get("ip"),
                        "domainName": item.get("domainName"),
                        "nodePwd": item.get("nodePwd"),
                    }
                break
        time.sleep(poll_interval)
    raise TimeoutError(f"Node {node_id} did not become ready within {timeout_seconds}s")


# ---------------------------------------------------------------------------
# Step 4: SSH into the node and start OpenClaw
# ---------------------------------------------------------------------------
def _ssh_exec(ip: str, password: str, command: str, timeout: int = 120) -> str:
    """Execute a command on a remote host via SSH using paramiko."""
    import paramiko
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(ip, username="root", password=password,
                   timeout=30, look_for_keys=False, allow_agent=False)
    _, stdout, stderr = client.exec_command(command, timeout=timeout)
    output = stdout.read().decode()
    client.close()
    return output


def _wait_ssh_ready(ip: str, password: str, retries: int = 15, interval: int = 5) -> None:
    """Wait until SSH is accepting connections."""
    for i in range(retries):
        try:
            _ssh_exec(ip, password, "echo ok", timeout=10)
            return
        except Exception:
            if i == retries - 1:
                raise TimeoutError(f"SSH to {ip} not ready after {retries} attempts")
            time.sleep(interval)


def _build_remote_script(access_key: str, project_id: str,
                         domain_name: str, model_id: str) -> str:
    """Build the remote bash script that configures and starts OpenClaw via supervisor."""
    return r'''
ACCESS_KEY="$1"
PROJECT_ID="$2"
DOMAIN_NAME="$3"
MODEL_ENV="$4"

# Write env vars to .bashrc for persistence
sed -i '/^export ACCESS_KEY=/d' ~/.bashrc 2>/dev/null
sed -i '/^export PROJECT_ID=/d' ~/.bashrc 2>/dev/null
safe_val() { printf '%s' "$1" | sed "s/'/'\\\\''/g"; }
echo "export ACCESS_KEY='$(safe_val "$ACCESS_KEY")'" >> ~/.bashrc
echo "export PROJECT_ID='$(safe_val "$PROJECT_ID")'" >> ~/.bashrc
export ACCESS_KEY PROJECT_ID

# 1) Generate config/token only, do NOT launch gateway (supervisor will manage it)
# Use bash -lc to ensure correct PATH (e.g. /opt/mamba/bin/python)
bash -lc "env ${MODEL_ENV} OPENCLAW_WEB_UI_HOST='$DOMAIN_NAME' OPENCLAW_API_KEY='$ACCESS_KEY' OPENCLAW_NO_LAUNCH=1 python /root/start.py"

# 2) Install supervisor
apt-get update -qq && apt-get install -y supervisor >/dev/null 2>&1 || true

OPENCLAW_SUPERVISORD_CONF="/etc/supervisor/openclaw-supervisord.conf"
cat > "$OPENCLAW_SUPERVISORD_CONF" <<'SDCONF'
[unix_http_server]
file=/var/run/openclaw-supervisor.sock
chmod=0700

[supervisord]
logfile=/var/log/supervisord.log
logfile_maxbytes=50MB
loglevel=info
pidfile=/var/run/openclaw-supervisord.pid
nodaemon=false

[rpcinterface:supervisor]
supervisor.rpcinterface_factory = supervisor.rpcinterface:make_main_rpcinterface

[supervisorctl]
serverurl=unix:///var/run/openclaw-supervisor.sock

[include]
files = /etc/supervisor/conf.d/*.conf
SDCONF

# Stop old supervisord if running
pkill -x supervisord 2>/dev/null || true
sleep 1

# 3) Clean up old gateway process
PIDFILE="/root/.openclaw/openclawgateway.pid"
if [ -f "$PIDFILE" ]; then
  kill -TERM "$(cat "$PIDFILE")" 2>/dev/null || true
  sleep 1
  kill -KILL "$(cat "$PIDFILE")" 2>/dev/null || true
  rm -f "$PIDFILE"
fi
# Port fallback: force-release 50001 if still occupied
if ss -ltnp 2>/dev/null | grep -q ":50001"; then
  fuser -k 50001/tcp 2>/dev/null || true
fi

# 4) Write openclaw-gateway supervisor program config
cat >/etc/supervisor/conf.d/openclaw-gateway.conf <<'SUPERVISORCONF'
[program:openclaw-gateway]
directory=/root
command=/bin/bash -lc 'openclaw gateway --help 2>&1 | grep -q -- "--config" && exec openclaw gateway --config /root/.openclaw/openclaw.json || exec openclaw gateway'
autostart=true
autorestart=true
startretries=999
startsecs=2
stopsignal=TERM
stopwaitsecs=10
stopasgroup=true
killasgroup=true
stdout_logfile=/var/log/openclaw-gateway.out.log
stderr_logfile=/var/log/openclaw-gateway.err.log
SUPERVISORCONF

# 5) Start supervisord (autostart=true will bring up gateway)
supervisord -c "$OPENCLAW_SUPERVISORD_CONF"
sleep 3
supervisorctl -c "$OPENCLAW_SUPERVISORD_CONF" status openclaw-gateway
STATUS=$(supervisorctl -c "$OPENCLAW_SUPERVISORD_CONF" status openclaw-gateway | awk '{print $2}')
if [ "$STATUS" != "RUNNING" ]; then
  echo "WARNING: supervisor process status: $STATUS"
  echo "Check logs: tail /var/log/openclaw-gateway.err.log"
fi
'''


def start_openclaw(ip: str, password: str, domain_name: str,
                   access_key: str, project_id: str,
                   model_id: str = DEFAULT_MODEL_ID) -> str:
    """SSH into the node via domain, configure env, start OpenClaw via supervisor, return Web UI URL."""
    ssh_host = domain_name or ip
    _wait_ssh_ready(ssh_host, password)

    model_env = f"MODEL_ID={model_id}"
    remote_script = _build_remote_script(access_key, project_id, domain_name, model_id)

    # Use paramiko to send script via stdin with args, matching the bash approach
    import paramiko
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(ssh_host, username="root", password=password,
                   timeout=30, look_for_keys=False, allow_agent=False)

    # Execute: bash -s -- <access_key> <project_id> <domain_name> <model_env>
    cmd = f"bash -s -- '{access_key}' '{project_id}' '{domain_name}' '{model_env}'"
    stdin_ch, stdout_ch, stderr_ch = client.exec_command(cmd, timeout=180)
    stdin_ch.write(remote_script)
    stdin_ch.channel.shutdown_write()

    output = stdout_ch.read().decode()
    err_output = stderr_ch.read().decode()
    exit_code = stdout_ch.channel.recv_exit_status()
    client.close()

    logger.info("OpenClaw remote output:\n%s", output)
    if err_output:
        logger.info("OpenClaw remote stderr:\n%s", err_output)
    if exit_code != 0:
        logger.warning("OpenClaw remote script exited with code %s", exit_code)

    # Parse URL from output
    url = None
    for line in output.splitlines():
        if line.startswith("OPENCLAW_WEB_UI_URL="):
            url = line.split("=", 1)[1].strip()
            break

    if not url:
        match = re.search(r'https?://\S+token=[a-fA-F0-9]+', output)
        if match:
            url = match.group(0)

    # Rewrite URL to use domainName
    if url and domain_name:
        token_match = re.search(r'token=[a-fA-F0-9]+', url)
        if token_match:
            url = f"http://{domain_name}:50001?{token_match.group(0)}"
        else:
            url = f"http://{domain_name}:50001"

    return url or ""


# ---------------------------------------------------------------------------
# Full provisioning flow
# ---------------------------------------------------------------------------
def provision_bohrclaw(email: str, access_key: str, project_id: str,
                       machine_type: str = "c2_m4_cpu") -> dict:
    """Run the full BohrClaw provisioning pipeline (no progress callback)."""
    return provision_bohrclaw_with_progress(email, access_key, project_id,
                                            machine_type=machine_type)


def provision_bohrclaw_with_progress(email: str, access_key: str, project_id: str,
                                     machine_type: str = "c2_m4_cpu",
                                     on_step=None) -> dict:
    """Run the full BohrClaw provisioning pipeline with step callbacks.

    on_step(step_name) is called before each major phase:
        "creating_node", "waiting_node", "starting_service"

    Returns:
        {
            "instance_url": "http://...:50001?token=...",
            "node_id": "12345",
            "node_ip": "1.2.3.4",
        }
    """
    def _step(name):
        if on_step:
            on_step(name)

    # 1. Provision LLM key (non-blocking on failure)
    provision_llm_key(email, access_key)

    # 2. Create node
    _step("creating_node")
    node_id = create_node(access_key, project_id, machine_type=machine_type)

    # 3. Wait for node ready
    _step("waiting_node")
    node_info = wait_for_node(access_key, node_id, timeout_seconds=300)

    ip = node_info["ip"]
    domain_name = node_info["domainName"]
    password = node_info["nodePwd"]

    # 4. SSH and start OpenClaw
    _step("starting_service")
    url = start_openclaw(ip, password, domain_name, access_key, project_id)

    return {
        "instance_url": url,
        "node_id": str(node_id),
        "node_ip": ip,
    }
