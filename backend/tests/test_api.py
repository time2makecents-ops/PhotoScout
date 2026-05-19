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

    def upload_image(self, token: str, title: str, featured: bool = False, image_role: str = "general") -> dict:
        status, body = multipart_request(
            "/api/uploads/images",
            {
                "title": title,
                "caption": f"{title} caption",
                "licensing_available": "true",
                "featured": "true" if featured else "false",
                "image_role": image_role,
                "gps_latitude": "34.101010",
                "gps_longitude": "-118.202020",
                "captured_at_device": "2025-05-18T10:15:30",
                "camera_heading_degrees": "238",
                "camera_heading_label": "SW",
                "camera_model": "Canon EOS R5",
                "camera_pitch_degrees": "5.5",
                "camera_roll_degrees": "-1.2",
                "heading_source": "sensor",
                "season": "Summer",
                "sun_position": "Golden hour",
                "camera_direction": "238 SW",
            },
            [("file", f"{title}.jpg", TINY_JPEG, "image/jpeg")],
            token=token,
        )
        self.assertEqual(status, 201, body)
        return body

    def upload_location_image(self, token: str, slug: str, title: str, featured: bool = False) -> tuple[int, dict]:
        return multipart_request(
            f"/api/locations/{slug}/images",
            {
                "title": title,
                "caption": f"{title} caption",
                "licensing_available": "true",
                "featured": "true" if featured else "false",
                "image_role": "location_photo",
                "gps_latitude": "34.052235",
                "gps_longitude": "-118.243683",
                "captured_at_device": "2025-05-18T10:15:30",
                "camera_heading_degrees": "225",
                "camera_heading_label": "SW",
                "camera_model": "Nikon Z8",
                "camera_pitch_degrees": "3.2",
                "camera_roll_degrees": "-0.8",
                "heading_source": "manual",
                "lens_model": "NIKKOR Z 24-70mm f/2.8",
                "focal_length": "24mm",
                "aperture": "f/2.8",
                "shutter_speed": "1/250",
                "iso_speed": "200",
                "white_balance": "Auto",
                "exposure_compensation": "0",
                "taken_at": "2025-05-18T10:15",
                "weather": "Clear",
                "season": "Spring",
                "sun_position": "Morning",
                "camera_direction": "Manual: 225 SW",
                "point_of_view": "Eye level",
                "distance_to_subject": "30 meters",
                "notes": "Added from pin detail flow.",
            },
            [("file", f"{title}.jpg", TINY_JPEG, "image/jpeg")],
            token=token,
        )

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

    def test_profile_lookup_by_handle_still_works(self) -> None:
        email = f"handle-{uuid.uuid4().hex[:6]}@example.com"
        token, registered = self.register_user(email, unique_slug("handle"), "Handle Test")

        status, profile = json_request("GET", f"/api/profiles/{registered['handle']}")
        self.assertEqual(status, 200, profile)
        self.assertEqual(profile["handle"], registered["handle"])
        self.assertEqual(profile["display_name"], "Handle Test")
        self.assertEqual(profile["created_locations"], [])
        self.assertEqual(profile["avatar_position_x"], 50)
        self.assertEqual(profile["avatar_position_y"], 50)
        self.assertEqual(profile["avatar_scale"], 1.0)

    def test_profile_avatar_upload_and_position_save(self) -> None:
        email = f"avatar-{uuid.uuid4().hex[:6]}@example.com"
        token, registered = self.register_user(email, unique_slug("avatar"), "Avatar Test")

        status, profile = multipart_request(
            "/api/profiles/me/avatar",
            {
                "avatar_position_x": "32",
                "avatar_position_y": "68",
                "avatar_scale": "1.7",
            },
            [("file", "avatar.jpg", TINY_JPEG, "image/jpeg")],
            token=token,
        )
        self.assertEqual(status, 201, profile)
        self.assertEqual(profile["handle"], registered["handle"])
        self.assertTrue(profile["avatar_url"].startswith("/uploads/profiles/"))
        self.assertEqual(profile["avatar_position_x"], 32)
        self.assertEqual(profile["avatar_position_y"], 68)
        self.assertEqual(profile["avatar_scale"], 1.7)

        avatar_path = UPLOAD_DIR / profile["avatar_url"].removeprefix("/uploads/")
        self.assertTrue(avatar_path.exists())

        status, updated = json_request(
            "PATCH",
            "/api/profiles/me",
            {
                "avatar_position_x": 20,
                "avatar_position_y": 80,
                "avatar_scale": 1.3,
            },
            token=token,
        )
        self.assertEqual(status, 200, updated)
        self.assertEqual(updated["avatar_position_x"], 20)
        self.assertEqual(updated["avatar_position_y"], 80)
        self.assertEqual(updated["avatar_scale"], 1.3)

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

    def test_profile_owner_can_update_email(self) -> None:
        email = f"profile-email-{uuid.uuid4().hex[:6]}@example.com"
        token, registered = self.register_user(email, unique_slug("email-owner"), "Email Owner")

        status, updated = json_request(
            "PATCH",
            "/api/profiles/me",
            {
                "email": f"updated-{uuid.uuid4().hex[:6]}@example.com",
                "display_name": "Email Owner Updated",
            },
            token=token,
        )
        self.assertEqual(status, 200, updated)
        self.assertEqual(updated["handle"], registered["handle"])

        status, me = json_request("GET", "/api/auth/me", token=token)
        self.assertEqual(status, 200, me)
        self.assertTrue(me["email"].startswith("updated-"))

        login_token, login_body = self.login_user(me["email"])
        self.assertEqual(login_body["handle"], registered["handle"])
        self.assertTrue(login_token)

    def test_upload_location_bundle_and_profile_images(self) -> None:
        email = f"lena-{uuid.uuid4().hex[:6]}@example.com"
        token, registered = self.register_user(email, unique_slug("lena"), "Lena Test")
        image = self.upload_image(token, "Area shot", featured=True, image_role="area_image")

        status, image_detail = json_request("GET", f"/api/images/{image['id']}")
        self.assertEqual(status, 200, image_detail)
        self.assertIsNone(image_detail["location_id"])
        self.assertEqual(image_detail["image_role"], "area_image")
        self.assertEqual(image_detail["image_metadata"]["gps_latitude"], 34.10101)
        self.assertEqual(image_detail["image_metadata"]["gps_longitude"], -118.20202)
        self.assertEqual(image_detail["image_metadata"]["camera_heading_degrees"], 238.0)
        self.assertEqual(image_detail["image_metadata"]["camera_heading_label"], "SW")
        self.assertEqual(image_detail["image_metadata"]["heading_source"], "sensor")
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
        self.assertEqual(location["images"][0]["image_role"], "area_image")
        self.assertEqual(location["images"][0]["location_id"], location["id"])
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
        self.assertEqual(manifest["images"][0]["image_role"], "area_image")

    def test_profile_includes_created_locations(self) -> None:
        email = f"profile-locations-{uuid.uuid4().hex[:6]}@example.com"
        token, registered = self.register_user(email, unique_slug("creator"), "Creator Test")
        image = self.upload_image(token, "Location thumbnail", featured=True, image_role="area_image")

        status, location = json_request(
            "POST",
            "/api/locations",
            {
                "name": "Created Location",
                "street_address": "42 Created St, Los Angeles, CA 90012",
                "latitude": 34.052235,
                "longitude": -118.243683,
                "visibility": "public",
                "description": "A created location for profile testing.",
                "city": "Los Angeles",
                "region": "CA",
                "country": "USA",
                "zip_code": "90012",
                "tags": ["test"],
                "uploaded_image_ids": [image["id"]],
            },
            token=token,
        )
        self.assertEqual(status, 201, location)

        status, profile = json_request("GET", f"/api/profiles/{registered['handle']}")
        self.assertEqual(status, 200, profile)
        self.assertEqual(len(profile["created_locations"]), 1)
        self.assertEqual(profile["created_locations"][0]["slug"], location["slug"])
        self.assertEqual(profile["created_locations"][0]["images"][0]["image_role"], "area_image")
        self.assertEqual(profile["created_locations"][0]["images"][0]["location_id"], location["id"])
        self.assertTrue(profile["created_locations"][0]["images"][0]["featured"])
        self.assertEqual(profile["created_locations"][0]["images"][0]["title"], "Location thumbnail")

    def test_location_creation_without_street_address(self) -> None:
        email = f"hike-{uuid.uuid4().hex[:6]}@example.com"
        token, _ = self.register_user(email, unique_slug("hike"), "Hike Tester")
        image = self.upload_image(token, "Trailhead view", image_role="area_image")

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
        self.assertEqual(location["images"][0]["image_role"], "area_image")

    def test_update_location(self) -> None:
        email = f"edit-{uuid.uuid4().hex[:6]}@example.com"
        token, registered = self.register_user(email, unique_slug("edit"), "Edit Tester")
        image = self.upload_image(token, "Editable location image", image_role="area_image")

        status, location = json_request(
            "POST",
            "/api/locations",
            {
                "name": "Editable Pin",
                "latitude": 34.052235,
                "longitude": -118.243683,
                "visibility": "public",
                "description": "Original description for the editable pin.",
                "city": "Los Angeles",
                "region": "CA",
                "country": "USA",
                "zip_code": "90012",
                "tags": ["edit"],
                "uploaded_image_ids": [image["id"]],
            },
            token=token,
        )
        self.assertEqual(status, 201, location)
        self.assertEqual(location["images"][0]["image_role"], "area_image")

        status, updated = json_request(
            "PATCH",
            f"/api/locations/{location['slug']}",
            {
                "name": "Updated Pin",
                "description": "Updated description for the editable pin.",
                "street_address": "99 Updated Ave, Los Angeles, CA 90012",
                "visibility": "private",
                "city": "Los Angeles",
                "region": "CA",
                "country": "USA",
                "zip_code": "90012",
                "approximate_latitude": 34.05,
                "approximate_longitude": -118.24,
                "tags": ["updated", "edit"],
            },
            token=token,
        )
        self.assertEqual(status, 200, updated)
        self.assertEqual(updated["name"], "Updated Pin")
        self.assertEqual(updated["street_address"], "99 Updated Ave, Los Angeles, CA 90012")
        self.assertEqual(updated["visibility"], "private")
        self.assertEqual(updated["zip_code"], "90012")

        status, profile = json_request("GET", f"/api/profiles/{registered['handle']}")
        self.assertEqual(status, 200, profile)
        self.assertEqual(profile["created_locations"][0]["name"], "Updated Pin")

    def test_owner_can_add_delete_photos_and_delete_location(self) -> None:
        email = f"pin-{uuid.uuid4().hex[:6]}@example.com"
        token, _ = self.register_user(email, unique_slug("pin"), "Pin Owner")
        base_image = self.upload_image(token, "Base location image", featured=True, image_role="area_image")

        status, location = json_request(
            "POST",
            "/api/locations",
            {
                "name": "Managed Pin",
                "street_address": "100 Managed St, Los Angeles, CA 90012",
                "latitude": 34.052235,
                "longitude": -118.243683,
                "visibility": "public",
                "description": "A location for add/delete tests.",
                "city": "Los Angeles",
                "region": "CA",
                "country": "USA",
                "zip_code": "90012",
                "tags": ["managed"],
                "uploaded_image_ids": [base_image["id"]],
            },
            token=token,
        )
        self.assertEqual(status, 201, location)
        self.assertEqual(len(location["images"]), 1)
        self.assertEqual(location["images"][0]["image_role"], "area_image")

        status, updated = self.upload_location_image(token, location["slug"], "Extra pin photo", featured=True)
        self.assertEqual(status, 201, updated)
        self.assertEqual(len(updated["images"]), 2)
        self.assertEqual(updated["images"][0]["title"], "Extra pin photo")
        self.assertTrue(updated["images"][0]["featured"])
        self.assertEqual(updated["images"][0]["image_role"], "location_photo")
        self.assertEqual(updated["images"][0]["image_metadata"]["gps_latitude"], 34.052235)
        self.assertEqual(updated["images"][0]["image_metadata"]["camera_heading_degrees"], 225.0)
        self.assertEqual(updated["images"][0]["image_metadata"]["camera_heading_label"], "SW")
        self.assertEqual(updated["images"][0]["image_metadata"]["heading_source"], "manual")
        self.assertEqual(updated["images"][0]["image_metadata"]["camera_direction"], "Manual: 225 SW")
        self.assertEqual(updated["images"][0]["image_metadata"]["camera_model"], "Nikon Z8")
        self.assertEqual(updated["images"][1]["title"], "Base location image")
        self.assertFalse(updated["images"][1]["featured"])

        extra_image_id = updated["images"][0]["id"]
        status, after_delete = json_request(
            "DELETE",
            f"/api/locations/{location['slug']}/images/{extra_image_id}",
            token=token,
        )
        self.assertEqual(status, 200, after_delete)
        self.assertEqual(len(after_delete["images"]), 1)
        self.assertEqual(after_delete["images"][0]["title"], "Base location image")

        status, deleted = json_request("DELETE", f"/api/locations/{location['slug']}", token=token)
        self.assertEqual(status, 200, deleted)

        status, missing = json_request("GET", f"/api/locations/{location['slug']}")
        self.assertEqual(status, 404, missing)
        self.assertFalse((UPLOAD_DIR / location["slug"]).exists())

    def test_non_owner_cannot_manage_location_photos(self) -> None:
        owner_email = f"owner-{uuid.uuid4().hex[:6]}@example.com"
        owner_token, _ = self.register_user(owner_email, unique_slug("owner"), "Owner Test")
        owner_image = self.upload_image(owner_token, "Owner pin image", image_role="area_image")

        status, location = json_request(
            "POST",
            "/api/locations",
            {
                "name": "Protected Pin",
                "latitude": 34.05,
                "longitude": -118.24,
                "visibility": "public",
                "description": "Only the owner should manage this one.",
                "city": "Los Angeles",
                "region": "CA",
                "country": "USA",
                "zip_code": "90012",
                "tags": ["protected"],
                "uploaded_image_ids": [owner_image["id"]],
            },
            token=owner_token,
        )
        self.assertEqual(status, 201, location)

        intruder_token, _ = self.register_user(
            f"intruder-{uuid.uuid4().hex[:6]}@example.com",
            unique_slug("intruder"),
            "Intruder Test",
        )
        status, body = self.upload_location_image(intruder_token, location["slug"], "Forbidden photo")
        self.assertEqual(status, 403, body)

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

        image = self.upload_image(submitter_token, "Challenge entry", image_role="challenge_submission")
        status, submission_detail = json_request(
            "POST",
            f"/api/challenges/{challenge_id}/submissions",
            {"image_id": image["id"], "caption": "My entry"},
            token=submitter_token,
        )
        self.assertEqual(status, 201, submission_detail)
        self.assertEqual(submission_detail["submissions"][0]["image"]["image_role"], "challenge_submission")
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
