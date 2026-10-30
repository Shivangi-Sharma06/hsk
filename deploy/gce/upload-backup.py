#!/usr/bin/env python3
"""Upload a new backup using the VM identity with create-only bucket access."""
import base64
import hashlib
import http.client
import json
from pathlib import Path
import re
import sys
import urllib.parse
import urllib.request


def upload(bucket: str, archive: Path, object_name: str) -> dict:
    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]+", bucket):
        raise ValueError("Invalid backup bucket")
    if not re.fullmatch(r"sqlite/[0-9]{8}T[0-9]{6}Z\.tar\.gz", object_name):
        raise ValueError("Invalid backup object name")
    size = archive.stat().st_size
    with archive.open("rb") as source:
        digest = base64.b64encode(hashlib.file_digest(source, "md5").digest()).decode()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    metadata = urllib.request.Request(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        headers={"Metadata-Flavor": "Google"},
    )
    with opener.open(metadata, timeout=10) as response:
        token = json.load(response)["access_token"]
    query = urllib.parse.urlencode({"uploadType": "media", "name": object_name, "ifGenerationMatch": "0"})
    connection = http.client.HTTPSConnection("storage.googleapis.com", timeout=120)
    try:
        with archive.open("rb") as source:
            connection.request(
                "POST", f"/upload/storage/v1/b/{bucket}/o?{query}", body=source,
                headers={"Authorization": "Bearer " + token, "Content-Type": "application/gzip", "Content-Length": str(size)},
            )
            response = connection.getresponse()
            body = response.read(65536)
        if response.status not in (200, 201):
            raise RuntimeError(f"Backup upload failed: HTTP {response.status}")
        result = json.loads(body)
        if int(result["size"]) != size or result["md5Hash"] != digest:
            raise RuntimeError("Uploaded backup integrity check failed")
        return {"bucket": bucket, "object": object_name, "size": size, "integrity": "verified"}
    finally:
        connection.close()


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("Usage: upload-backup.py BUCKET ARCHIVE OBJECT")
    print(json.dumps(upload(sys.argv[1], Path(sys.argv[2]), sys.argv[3])))
