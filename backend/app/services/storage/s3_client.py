"""
S3 Client for Yandex Object Storage (YOS).

Wraps boto3 with YOS-specific configuration:
- endpoint: storage.yandexcloud.net
- region: ru-central1
- SSE-S3 encryption on upload
- presigned URLs with default TTL=900s (15 min)
"""
from __future__ import annotations

import boto3
import botocore.exceptions  # noqa: F401 — re-exported for callers

BUCKET_RECEIPTS = "medvychet-receipts"
BUCKET_PRESCRIPTIONS = "medvychet-prescriptions"
BUCKET_EXPORTS = "medvychet-exports"

_YOS_ENDPOINT = "https://storage.yandexcloud.net"
_YOS_REGION = "ru-central1"


class S3Client:
    """Thin wrapper around boto3 S3 client for Yandex Object Storage."""

    def __init__(
        self,
        endpoint_url: str | None = _YOS_ENDPOINT,
        access_key: str | None = None,
        secret_key: str | None = None,
        region: str = _YOS_REGION,
    ) -> None:
        self._boto_client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
        )

    def upload_file(
        self,
        bucket: str,
        key: str,
        data: bytes,
        content_type: str,
    ) -> None:
        """Upload bytes to S3 with SSE-S3 encryption."""
        self._boto_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
            ServerSideEncryption="AES256",
        )

    def generate_presigned_url(
        self,
        bucket: str,
        key: str,
        ttl: int = 900,
    ) -> str:
        """Generate a presigned GET URL valid for `ttl` seconds (default 15 min)."""
        return self._boto_client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=ttl,
        )

    def delete_object(self, bucket: str, key: str) -> None:
        """Delete an object from S3."""
        self._boto_client.delete_object(Bucket=bucket, Key=key)

    def get_object(self, bucket: str, key: str) -> bytes:
        """Download and return object bytes. Raises ClientError if not found."""
        resp = self._boto_client.get_object(Bucket=bucket, Key=key)
        return resp["Body"].read()
