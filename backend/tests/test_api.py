from __future__ import annotations

import base64
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
import unittest
import urllib.error
import urllib.request
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
TEST_ROOT = BACKEND_DIR / ".testdata" / f"run-{uuid.uuid4().hex[:8]}"
DB_PATH = TEST_ROOT / "photoscout_test.db"
UPLOAD_DIR = TEST_ROOT / "uploads"
SERVER_PORT = 8011
BASE_URL = f"http://127.0.0.1:{SERVER_PORT}"

TINY_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////"
    "//////////////////////////////////////////////////////////////////////////////////////////////////////"
    "//////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8A"
    "P//Z"
)


def iso_now() -> str:
    return datetime.now(UTC).replace(tzinfo=None).isoformat(timespec="seconds")


def unique_slug(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def build_multipart(fields: dict[str, str], files: list[tuple[str, str, bytes, str]]) -> tuple[bytes, str]:
    boundary = f"----PhotoScoutBoundary{uuid.uuid4().hex}"
    chunks: list[bytes] = []

    for name, value in fields.items():
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        chunks.append(str(value).encode("utf-8"))
        chunks.append(b"\r\n")

    for name, filename, content, content_type in files:
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode("utf-8")
        )
        chunks.append(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
        chunks.append(content)
        chunks.append(b"\r\n")

    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def request(method: str, path: str, body: bytes | None = None, headers: dict[str, str] | None = None) -> tuple[int, dict]:
    req = urllib.request.Request(f"{BASE_URL}{path}", data=body, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            payload = response.read().decode("utf-8") or "{}"
            return response.status, json.loads(payload)
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8") or "{}"
        try:
            return exc.code, json.loads(payload)
        except json.JSONDecodeError:
            return exc.code, {"detail": payload}


def json_request(method: str, path: str, payload: dict | None = None, token: str | None = None) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(payload or {}).encode("utf-8") if payload is not None else None
    return request(method, path, body=body, headers=headers)


def multipart_request(
    path: str,
    fields: dict[str, str],
    files: list[tuple[str, str, bytes, str]],
    token: str | None = None,
) -> tuple[int, dict]:
    body, content_type = build_multipart(fields, files)
    headers = {"Content-Type": content_type}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return request("POST", path, body=body, headers=headers)


class PhotoScoutAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if TEST_ROOT.exists():
            shutil.rmtree(TEST_ROOT)
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

        env = os.environ.copy()
        env["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
        env["UPLOAD_DIR"] = str(UPLOAD_DIR)
        env["APP_ORIGIN"] = "http://localhost:3000"
        env["PYTHONUNBUFFERED"] = "1"

        cls.server_log = TEST_ROOT / "server.log"
        TEST_ROOT.mkdir(parents=True, exist_ok=True)
        cls.server_handle = cls.server_log.open("w", encoding="utf-8")
        cls.server = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(SERVER_PORT)],
            cwd=str(BACKEND_DIR),
            env=env,
            stdout=cls.server_handle,
            stderr=subprocess.STDOUT,
        )

        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                status, body = request("GET", "/api/health")
                if status == 200 and body.get("status") == "ok":
                    return
            except (urllib.error.URLError, ConnectionError):
                pass

            if cls.server.poll() is not None:
                break
            time.sleep(0.5)

        cls.tearDownClass()
        raise RuntimeError(f"Backend test server failed to start. See {cls.server_log}")

    @classmethod
    def tearDownClass(cls) -> None:
        server = getattr(cls, "server", None)
        if server and server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()

        handle = getattr(cls, "server_handle", None)
        if handle:
            handle.close()

        if TEST_ROOT.exists():
            shutil.rmtree(TEST_ROOT, ignore_errors=True)

    def register_user(self, email: str, handle_name: str, display_name: str) -> tuple[str, dict]:
        status, body = json_request(
            "POST",
            "/api/auth/register",
            {
                "email": email,
                "password": "password123",
                "role": "photographer",
                "handle": handle_name,
                "display_name": display_name,
            },
        )
        self.assertEqual(status, 201, body)
        return body["token"], body

    def login_user(self, email: str) -> tuple[str, dict]:
        status, body = json_request(
            "POST",
            "/api/auth/login",
            {"email": email, "password": "password123"},
        )
        self.assertEqual(status, 200, body)
        return body["token"], body

    def upload_image(self, token: str, title: str, featured: bool = False) -> dict:
        status, body = multipart_request(
            "/api/uploads/images",
            {
                "title": title,
                "caption": f"{title} caption",
                "licensing_available": "true",
                "featured": "true" if featured else "false",
                "camera_model": "Canon EOS R5",
                "season": "Summer",
                "sun_position": "Golden hour",
                "camera_direction": "W",
            },
            [("file", f"{title}.jpg", TINY_JPEG, "image/jpeg")],
            token=token,
        )
        self.assertEqual(status, 201, body)
        return body

    def test_health_login_and_me(self) -> None:
        status, body = request("GET", "/api/health")
        self.assertEqual(status, 200, body)
        self.assertEqual(body["status"], "ok")

        email = f"maya-{uuid.uuid4().hex[:6]}@example.com"
        token, registered = self.register_user(email, unique_slug("maya"), "Maya Test")
        self.assertTrue(registered["handle"])

        login_token, login_body = self.login_user(email)
        self.assertEqual(login_body["handle"], registered["handle"])

        status, me = json_request("GET", "/api/auth/me", token=login_token)
        self.assertEqual(status, 200, me)
        self.assertEqual(me["email"], email)
        self.assertEqual(me["handle"], registered["handle"])
        self.assertTrue(token)
        self.assertTrue(login_token)

    def test_register_creates_profile_details(self) -> None:
        email = f"profile-{uuid.uuid4().hex[:6]}@example.com"
        status, body = json_request(
            "POST",
            "/api/auth/register",
            {
                "email": email,
                "password": "password123",
                "role": "scout",
                "handle": unique_slug("profile"),
                "display_name": "Profile Tester",
                "bio": "Testing profile creation.",
                "base_city": "Los Angeles",
                "specialties": "Scouting, locations",
                "website_url": "https://example.com",
                "instagram_url": "https://instagram.com/example",
                "licensing_available": True,
                "scout_for_hire": True,
                "hourly_rate_note": "$500/day",
            },
        )
        self.assertEqual(status, 201, body)

        status, profile = json_request("GET", f"/api/profiles/{body['handle']}")
        self.assertEqual(status, 200, profile)
        self.assertEqual(profile["bio"], "Testing profile creation.")
        self.assertEqual(profile["base_city"], "Los Angeles")
        self.assertEqual(profile["specialties"], "Scouting, locations")
        self.assertEqual(profile["website_url"], "https://example.com")
        self.assertEqual(profile["instagram_url"], "https://instagram.com/example")
        self.assertTrue(profile["licensing_available"])
        self.assertTrue(profile["scout_for_hire"])
        self.assertEqual(profile["hourly_rate_note"], "$500/day")

    def test_upload_location_bundle_and_profile_images(self) -> None:
        email = f"lena-{uuid.uuid4().hex[:6]}@example.com"
        token, registered = self.register_user(email, unique_slug("lena"), "Lena Test")
        image = self.upload_image(token, "Area shot", featured=True)

        status, image_detail = json_request("GET", f"/api/images/{image['id']}")
        self.assertEqual(status, 200, image_detail)
        self.assertEqual(image_detail["image_metadata"]["camera_model"], "Canon EOS R5")
        self.assertEqual(image_detail["image_metadata"]["season"], "Summer")

        status, profile = json_request("GET", f"/api/profiles/{registered['handle']}")
        self.assertEqual(status, 200, profile)
        self.assertEqual(len(profile["uploaded_images"]), 1)
        self.assertEqual(profile["uploaded_images"][0]["id"], image["id"])

        status, location = json_request(
            "POST",
            "/api/locations",
            {
                "name": "Test Location",
                "street_address": "123 Test Ave, Los Angeles, CA 90012",
                "latitude": 34.052235,
                "longitude": -118.243683,
                "visibility": "public",
                "description": "A test location with a saved pin and image bundle.",
                "city": "Los Angeles",
                "region": "CA",
                "country": "USA",
                "zip_code": "90012",
                "tags": ["urban", "test"],
                "uploaded_image_ids": [image["id"]],
            },
            token=token,
        )
        self.assertEqual(status, 201, location)
        self.assertEqual(location["street_address"], "123 Test Ave, Los Angeles, CA 90012")
        self.assertEqual(location["zip_code"], "90012")
        self.assertEqual(location["images"][0]["featured"], True)

        manifest_path = UPLOAD_DIR / location["slug"] / "location.json"
        self.assertTrue(manifest_path.exists())
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(manifest["location"]["slug"], location["slug"])
        self.assertEqual(manifest["location"]["street_address"], "123 Test Ave, Los Angeles, CA 90012")
        self.assertEqual(
            manifest["images"][0]["storage_key"],
            f"{location['slug']}/{Path(image['source_url']).name}",
        )

    def test_location_creation_without_street_address(self) -> None:
        email = f"hike-{uuid.uuid4().hex[:6]}@example.com"
        token, _ = self.register_user(email, unique_slug("hike"), "Hike Tester")
        image = self.upload_image(token, "Trailhead view")

        status, location = json_request(
            "POST",
            "/api/locations",
            {
                "name": "Trail Pin",
                "latitude": 34.1,
                "longitude": -118.3,
                "visibility": "public",
                "description": "A pin-only hiking location without a street address.",
                "city": "Los Angeles",
                "region": "CA",
                "country": "USA",
                "zip_code": "",
                "tags": ["hike"],
                "uploaded_image_ids": [image["id"]],
            },
            token=token,
        )
        self.assertEqual(status, 201, location)
        self.assertEqual(location["street_address"], "")
        self.assertEqual(location["name"], "Trail Pin")

    def test_challenge_vote_toggle(self) -> None:
        submitter_email = f"sam-{uuid.uuid4().hex[:6]}@example.com"
        submitter_token, submitter = self.register_user(submitter_email, unique_slug("sam"), "Sam Submitter")
        voter_token, _ = self.register_user(
            f"voter-{uuid.uuid4().hex[:6]}@example.com",
            unique_slug("voter"),
            "Vera Voter",
        )

        with sqlite3.connect(DB_PATH) as connection:
            connection.execute(
                """
                INSERT INTO challenges (title, slug, prompt, starts_at, ends_at, is_active, featured_image_url, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "Weekly Light",
                    unique_slug("weekly-light"),
                    "Capture dramatic light.",
                    iso_now(),
                    (datetime.now(UTC) + timedelta(days=7)).replace(tzinfo=None).isoformat(timespec="seconds"),
                    1,
                    None,
                    submitter["user_id"],
                    iso_now(),
                ),
            )
            connection.commit()
            challenge_id = connection.execute("SELECT id FROM challenges ORDER BY id DESC LIMIT 1").fetchone()[0]

        image = self.upload_image(submitter_token, "Challenge entry")
        status, submission_detail = json_request(
            "POST",
            f"/api/challenges/{challenge_id}/submissions",
            {"image_id": image["id"], "caption": "My entry"},
            token=submitter_token,
        )
        self.assertEqual(status, 201, submission_detail)
        submission_id = submission_detail["submissions"][0]["id"]

        status, voted = json_request(
            "POST",
            f"/api/challenges/submissions/{submission_id}/vote",
            {"direction": "up"},
            token=voter_token,
        )
        self.assertEqual(status, 200, voted)
        self.assertEqual(voted["submissions"][0]["vote_count"], 1)

        status, toggled = json_request(
            "POST",
            f"/api/challenges/submissions/{submission_id}/vote",
            {"direction": "up"},
            token=voter_token,
        )
        self.assertEqual(status, 200, toggled)
        self.assertEqual(toggled["submissions"][0]["vote_count"], 0)

        status, downvoted = json_request(
            "POST",
            f"/api/challenges/submissions/{submission_id}/vote",
            {"direction": "down"},
            token=voter_token,
        )
        self.assertEqual(status, 200, downvoted)
        self.assertEqual(downvoted["submissions"][0]["vote_count"], -1)


if __name__ == "__main__":
    unittest.main()
