import pytest
import httpx

BASE_URL     = "http://localhost:8000"
ADMIN_TOKEN  = "vtv_secure_token_2024"

def test_health():
    r = httpx.get(f"{BASE_URL}/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

def test_status_ch1():
    r = httpx.get(f"{BASE_URL}/api/status/1", headers={"X-Token": ADMIN_TOKEN})
    assert r.status_code == 200
    assert r.json()["source_id"] == "1"

def test_status_ch2():
    r = httpx.get(f"{BASE_URL}/api/status/2", headers={"X-Token": ADMIN_TOKEN})
    assert r.status_code == 200
    assert r.json()["source_id"] == "2"

def test_log_ch1():
    r = httpx.get(f"{BASE_URL}/api/log/1?lines=10", headers={"X-Token": ADMIN_TOKEN})
    assert r.status_code == 200

def test_schedule_and_cancel_ch1():
    r = httpx.post(f"{BASE_URL}/api/schedule/1", headers={"X-Token": ADMIN_TOKEN}, json={"stop_time": "23:59"})
    assert r.status_code == 200
    r2 = httpx.post(f"{BASE_URL}/api/schedule/cancel/1", headers={"X-Token": ADMIN_TOKEN})
    assert r2.status_code == 200

def test_bitrate_validation_ch2():
    r = httpx.post(f"{BASE_URL}/api/start/2",
                   headers={"X-Token": ADMIN_TOKEN},
                   json={"bitrate":"INVALIDO","segment_minutes":1,"dest_path":"/tmp"})
    assert r.status_code == 422
