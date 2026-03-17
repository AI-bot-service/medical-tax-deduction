"""Image preprocessing pipeline for receipt OCR.

Applies deskew, CLAHE, adaptive threshold, denoising, and upscaling
to improve OCR accuracy on pharmacy receipt photos.
"""
from __future__ import annotations

import logging

import cv2
import numpy as np

logger = logging.getLogger(__name__)


def preprocess(image_bytes: bytes) -> bytes:
    """Preprocess receipt image to improve OCR accuracy.

    Pipeline:
      1. Deskew (skip if angle < 0.5°)
      2. CLAHE on L-channel in LAB space
      3. Adaptive threshold (Gaussian)
      4. FastNlMeans denoising
      5. Upscale to 1200px width if smaller

    Args:
        image_bytes: JPEG or PNG image bytes.

    Returns:
        Preprocessed image as PNG bytes.
        Falls back to original bytes if any step raises an exception.
    """
    try:
        return _preprocess_pipeline(image_bytes)
    except Exception:
        logger.exception("Image preprocessing failed, returning original")
        return image_bytes


def _preprocess_pipeline(image_bytes: bytes) -> bytes:
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image")

    img = _deskew(img)
    img = _apply_clahe(img)
    img = _adaptive_threshold(img)
    img = _denoise(img)
    img = _upscale(img)

    success, buf = cv2.imencode(".png", img)
    if not success:
        raise RuntimeError("Failed to encode output PNG")
    return buf.tobytes()


def _deskew(img: np.ndarray) -> np.ndarray:
    """Rotate image to correct skew detected via Hough Lines.

    Skips rotation if detected angle is less than 0.5 degrees.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLines(edges, 1, np.pi / 180, threshold=100)
    if lines is None:
        return img

    angles: list[float] = []
    for line in lines:
        rho, theta = line[0]
        # Convert to degrees from vertical
        angle = (theta * 180 / np.pi) - 90
        if abs(angle) < 45:
            angles.append(angle)

    if not angles:
        return img

    median_angle = float(np.median(angles))
    if abs(median_angle) < 0.5:
        return img

    h, w = img.shape[:2]
    center = (w / 2, h / 2)
    rot_mat = cv2.getRotationMatrix2D(center, median_angle, 1.0)
    rotated = cv2.warpAffine(
        img, rot_mat, (w, h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )
    return rotated


def _apply_clahe(img: np.ndarray) -> np.ndarray:
    """Apply CLAHE to L-channel in LAB colour space."""
    # If image is grayscale/binary after threshold, convert back to BGR first
    if len(img.shape) == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_clahe = clahe.apply(l_ch)

    lab_merged = cv2.merge([l_clahe, a_ch, b_ch])
    return cv2.cvtColor(lab_merged, cv2.COLOR_LAB2BGR)


def _adaptive_threshold(img: np.ndarray) -> np.ndarray:
    """Convert to grayscale and apply adaptive Gaussian threshold."""
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img

    thresh = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=11,
        C=2,
    )
    return thresh


def _denoise(img: np.ndarray) -> np.ndarray:
    """Apply FastNlMeans denoising."""
    if len(img.shape) == 2:
        return cv2.fastNlMeansDenoising(img, h=10)
    return cv2.fastNlMeansDenoisingColored(img, h=10)


def _upscale(img: np.ndarray) -> np.ndarray:
    """Upscale image if width is less than 1200 pixels."""
    h, w = img.shape[:2]
    if w >= 1200:
        return img
    scale = 1200 / w
    new_w = 1200
    new_h = int(h * scale)
    return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
