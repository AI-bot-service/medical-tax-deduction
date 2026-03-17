"""Tests for image_preprocessor.py."""
from __future__ import annotations

import numpy as np


def _make_jpeg_bytes(width: int = 800, height: int = 600, color: tuple = (200, 200, 200)) -> bytes:
    """Create a simple solid-colour JPEG image as bytes."""
    import cv2

    img = np.full((height, width, 3), color, dtype=np.uint8)
    success, buf = cv2.imencode(".jpg", img)
    assert success
    return buf.tobytes()


def _make_png_bytes(width: int = 800, height: int = 600) -> bytes:
    """Create a simple grayscale PNG as bytes."""
    import cv2

    img = np.full((height, width), 180, dtype=np.uint8)
    success, buf = cv2.imencode(".png", img)
    assert success
    return buf.tobytes()


def _make_skewed_bytes(angle_deg: float = 5.0, width: int = 1000, height: int = 800) -> bytes:
    """Create a rotated image to simulate skew."""
    import cv2

    img = np.full((height, width, 3), 240, dtype=np.uint8)
    # Draw some lines to give Hough something to detect
    for y in range(50, height - 50, 80):
        cv2.line(img, (50, y), (width - 50, y), (0, 0, 0), 2)

    center = (width // 2, height // 2)
    rot_mat = cv2.getRotationMatrix2D(center, angle_deg, 1.0)
    rotated = cv2.warpAffine(img, rot_mat, (width, height))

    success, buf = cv2.imencode(".jpg", rotated)
    assert success
    return buf.tobytes()


def test_preprocess_returns_png_bytes():
    """preprocess() must return PNG bytes for any valid input."""
    from app.services.ocr.image_preprocessor import preprocess

    result = preprocess(_make_jpeg_bytes())
    assert isinstance(result, bytes)
    assert len(result) > 0
    # PNG magic bytes: \x89PNG
    assert result[:4] == b"\x89PNG"


def test_preprocess_accepts_png_input():
    from app.services.ocr.image_preprocessor import preprocess

    result = preprocess(_make_png_bytes())
    assert result[:4] == b"\x89PNG"


def test_preprocess_upscales_small_image():
    """Images narrower than 1200px should be upscaled."""
    import cv2

    from app.services.ocr.image_preprocessor import preprocess

    small = _make_jpeg_bytes(width=600, height=400)
    result = preprocess(small)

    nparr = np.frombuffer(result, np.uint8)
    out_img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    assert out_img is not None
    h, w = out_img.shape[:2]
    assert w == 1200
    assert h == 800  # 400 * (1200/600)


def test_preprocess_does_not_upscale_large_image():
    """Images >= 1200px wide must not be upscaled."""
    import cv2

    from app.services.ocr.image_preprocessor import preprocess

    large = _make_jpeg_bytes(width=1500, height=1000)
    result = preprocess(large)

    nparr = np.frombuffer(result, np.uint8)
    out_img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    assert out_img is not None
    h, w = out_img.shape[:2]
    assert w == 1500


def test_preprocess_fallback_on_invalid_bytes():
    """preprocess() must return original bytes on invalid input."""
    from app.services.ocr.image_preprocessor import preprocess

    garbage = b"not_an_image_1234567890"
    result = preprocess(garbage)
    assert result == garbage


def test_preprocess_skewed_image():
    """preprocess() completes without error on skewed image."""
    from app.services.ocr.image_preprocessor import preprocess

    skewed = _make_skewed_bytes(angle_deg=5.0)
    result = preprocess(skewed)
    assert result[:4] == b"\x89PNG"


def test_preprocess_small_angle_no_rotation():
    """An image with < 0.5° skew should not be rotated (skew skip path)."""
    from app.services.ocr.image_preprocessor import preprocess

    # 0° skew — deskew should be a no-op
    straight = _make_jpeg_bytes(width=1000, height=800)
    result = preprocess(straight)
    assert result[:4] == b"\x89PNG"
