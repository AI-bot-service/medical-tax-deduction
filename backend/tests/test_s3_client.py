"""
Tests for S3Client (B-01).
Uses moto to mock Yandex Object Storage (S3-compatible).
"""
import botocore.exceptions
import pytest
from moto import mock_aws

from app.services.storage.s3_client import (
    BUCKET_EXPORTS,
    BUCKET_PRESCRIPTIONS,
    BUCKET_RECEIPTS,
    S3Client,
)


@pytest.fixture
def aws_credentials(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_SECURITY_TOKEN", "testing")
    monkeypatch.setenv("AWS_SESSION_TOKEN", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")


@pytest.fixture
def mock_s3(aws_credentials):
    """S3Client + pre-created buckets inside moto mock."""
    import boto3

    with mock_aws():
        raw = boto3.client("s3", region_name="us-east-1")
        for bucket in [BUCKET_RECEIPTS, BUCKET_PRESCRIPTIONS, BUCKET_EXPORTS]:
            raw.create_bucket(Bucket=bucket)
        client = S3Client(
            endpoint_url=None,
            access_key="testing",
            secret_key="testing",
            region="us-east-1",
        )
        yield raw, client


class TestBucketConstants:
    def test_bucket_receipts_name(self):
        assert BUCKET_RECEIPTS == "medvychet-receipts"

    def test_bucket_prescriptions_name(self):
        assert BUCKET_PRESCRIPTIONS == "medvychet-prescriptions"

    def test_bucket_exports_name(self):
        assert BUCKET_EXPORTS == "medvychet-exports"

    def test_three_distinct_buckets(self):
        buckets = {BUCKET_RECEIPTS, BUCKET_PRESCRIPTIONS, BUCKET_EXPORTS}
        assert len(buckets) == 3


class TestS3ClientUpload:
    def test_upload_stores_correct_bytes(self, mock_s3):
        raw, client = mock_s3
        data = b"receipt image data"
        client.upload_file(BUCKET_RECEIPTS, "u1/r.jpg", data, "image/jpeg")
        resp = raw.get_object(Bucket=BUCKET_RECEIPTS, Key="u1/r.jpg")
        assert resp["Body"].read() == data

    def test_upload_sets_content_type(self, mock_s3):
        raw, client = mock_s3
        client.upload_file(BUCKET_PRESCRIPTIONS, "u1/rx.pdf", b"pdf", "application/pdf")
        resp = raw.head_object(Bucket=BUCKET_PRESCRIPTIONS, Key="u1/rx.pdf")
        assert resp["ContentType"] == "application/pdf"

    def test_upload_uses_sse_s3(self, mock_s3):
        """SSE-S3 must be requested — moto records the encryption header."""
        raw, client = mock_s3
        client.upload_file(BUCKET_RECEIPTS, "u1/enc.jpg", b"data", "image/jpeg")
        resp = raw.head_object(Bucket=BUCKET_RECEIPTS, Key="u1/enc.jpg")
        assert resp.get("ServerSideEncryption") == "AES256"


class TestS3ClientPresignedUrl:
    def test_presigned_url_is_string(self, mock_s3):
        raw, client = mock_s3
        client.upload_file(BUCKET_RECEIPTS, "u1/img.jpg", b"x", "image/jpeg")
        url = client.generate_presigned_url(BUCKET_RECEIPTS, "u1/img.jpg")
        assert isinstance(url, str) and len(url) > 10

    def test_default_ttl_is_900(self, mock_s3, monkeypatch):
        raw, client = mock_s3
        captured = {}

        def fake_generate(ClientMethod, Params, ExpiresIn):  # noqa: N803
            captured["ExpiresIn"] = ExpiresIn
            return "https://mock"

        monkeypatch.setattr(client._boto_client, "generate_presigned_url", fake_generate)
        client.generate_presigned_url(BUCKET_RECEIPTS, "u1/img.jpg")
        assert captured["ExpiresIn"] == 900

    def test_custom_ttl_is_forwarded(self, mock_s3, monkeypatch):
        raw, client = mock_s3
        captured = {}

        def fake_generate(ClientMethod, Params, ExpiresIn):  # noqa: N803
            captured["ExpiresIn"] = ExpiresIn
            return "https://mock"

        monkeypatch.setattr(client._boto_client, "generate_presigned_url", fake_generate)
        client.generate_presigned_url(BUCKET_RECEIPTS, "u1/img.jpg", ttl=3600)
        assert captured["ExpiresIn"] == 3600


class TestS3ClientDeleteAndGet:
    def test_delete_removes_object(self, mock_s3):
        raw, client = mock_s3
        client.upload_file(BUCKET_RECEIPTS, "u1/del.jpg", b"bye", "image/jpeg")
        client.delete_object(BUCKET_RECEIPTS, "u1/del.jpg")
        with pytest.raises(botocore.exceptions.ClientError) as exc:
            raw.head_object(Bucket=BUCKET_RECEIPTS, Key="u1/del.jpg")
        assert exc.value.response["Error"]["Code"] == "404"

    def test_get_returns_bytes(self, mock_s3):
        raw, client = mock_s3
        expected = b"hello s3"
        client.upload_file(BUCKET_RECEIPTS, "u1/get.jpg", expected, "image/jpeg")
        result = client.get_object(BUCKET_RECEIPTS, "u1/get.jpg")
        assert result == expected

    def test_get_nonexistent_raises_client_error(self, mock_s3):
        raw, client = mock_s3
        with pytest.raises(botocore.exceptions.ClientError):
            client.get_object(BUCKET_RECEIPTS, "nonexistent/key.jpg")


class TestS3ClientImport:
    def test_import_is_clean(self):
        """Verify the module can be imported without errors."""
        from app.services.storage import s3_client  # noqa: F401
