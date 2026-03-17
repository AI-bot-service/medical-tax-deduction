"""Helper script to run ruff and pytest via Python 3.11."""
import subprocess
import sys
import os

py311 = "C:/Users/russk/AppData/Local/Programs/Python/Python311/python.exe"
backend_dir = "D:/Proekt/medical-tax-deduction/backend"

if not os.path.exists(py311):
    print(f"Python 3.11 not found at {py311}, using {sys.executable}")
    py311 = sys.executable

print("=== Installing deps (if needed) ===")
install = subprocess.run(
    [py311, "-m", "pip", "install", "--quiet",
     "ruff", "pytest", "pytest-asyncio", "anyio", "httpx",
     "fastapi", "pydantic-settings", "sqlalchemy[asyncio]",
     "redis", "asyncpg", "sentry-sdk",
     "opencv-python-headless", "numpy",
     "aiosqlite", "moto[s3]", "boto3"],
    capture_output=True, text=True, cwd=backend_dir
)
print("RC:", install.returncode)
if install.stderr and "error" in install.stderr.lower():
    print("STDERR:", install.stderr[-500:])

print("\n=== Running ruff check --fix ===")
subprocess.run(
    [py311, "-m", "ruff", "check", "--fix", "."],
    capture_output=True, text=True, cwd=backend_dir
)
print("\n=== Running ruff check ===")
r = subprocess.run(
    [py311, "-m", "ruff", "check", "."],
    capture_output=True, text=True, cwd=backend_dir
)
print("Return code:", r.returncode)
if r.stdout:
    print(r.stdout[:3000])
if r.stderr:
    print("STDERR:", r.stderr[:500])
print("ruff:", "PASSED" if r.returncode == 0 else "FAILED")

print("\n=== Running pytest tests/test_models.py ===")
r2 = subprocess.run(
    [py311, "-m", "pytest", "tests/test_models.py", "-v", "--tb=short"],
    capture_output=True, text=True, cwd=backend_dir
)
print("Return code:", r2.returncode)
if r2.stdout:
    print(r2.stdout[:8000])
if r2.stderr:
    print("STDERR:", r2.stderr[:1000])
print("pytest:", "PASSED" if r2.returncode == 0 else "FAILED")
