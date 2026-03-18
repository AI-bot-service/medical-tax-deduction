#!/usr/bin/env python3
"""
Monorepo scaffold creator for MedВычет.
Run from anywhere - uses path relative to this script's location.
"""
import os
from pathlib import Path

ROOT = Path(__file__).parent.parent  # medical-tax-deduction/

DIRS = [
    "backend/app/middleware",
    "backend/app/models",
    "backend/app/schemas",
    "backend/app/routers",
    "backend/app/services/ocr",
    "backend/app/services/auth",
    "backend/app/services/prescriptions",
    "backend/app/services/export",
    "backend/app/services/storage",
    "backend/app/repositories",
    "backend/workers/tasks",
    "backend/alembic/versions",
    "backend/data",
    "backend/tests/test_ocr",
    "backend/tests/test_auth",
    "backend/tests/test_receipts",
    "backend/tests/test_prescriptions",
    "backend/tests/test_batch",
    "backend/tests/test_export",
    "backend/tests/test_security",
    "backend/tests/test_workers",
    "backend/tests/manual",
    "bot/handlers",
    "bot/services",
    "bot/tests",
    "frontend/src/app/(auth)/login",
    "frontend/src/app/(auth)/privacy",
    "frontend/src/app/(cabinet)/dashboard",
    "frontend/src/app/(cabinet)/receipts",
    "frontend/src/app/(cabinet)/prescriptions/new",
    "frontend/src/app/(cabinet)/review",
    "frontend/src/app/(cabinet)/export",
    "frontend/src/app/(cabinet)/profile",
    "frontend/src/app/api/auth/mini-app",
    "frontend/src/components/ui",
    "frontend/src/hooks",
    "frontend/src/lib",
    "frontend/src/types",
    "infra/nginx",
    ".github/workflows",
]

INIT_PY = [
    "backend/app/__init__.py",
    "backend/app/middleware/__init__.py",
    "backend/app/models/__init__.py",
    "backend/app/schemas/__init__.py",
    "backend/app/routers/__init__.py",
    "backend/app/services/__init__.py",
    "backend/app/services/ocr/__init__.py",
    "backend/app/services/auth/__init__.py",
    "backend/app/services/prescriptions/__init__.py",
    "backend/app/services/export/__init__.py",
    "backend/app/services/storage/__init__.py",
    "backend/app/repositories/__init__.py",
    "backend/workers/__init__.py",
    "backend/workers/tasks/__init__.py",
    "backend/tests/__init__.py",
    "bot/__init__.py",
    "bot/handlers/__init__.py",
    "bot/services/__init__.py",
]

BACKEND_PYPROJECT = """\
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "medvychet-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "sqlalchemy[asyncio]>=2.0.0",
    "alembic>=1.14.0",
    "celery[redis]>=5.4.0",
    "redis>=5.2.0",
    "boto3>=1.35.0",
    "easyocr>=1.7.0",
    "pytesseract>=0.3.13",
    "opencv-python-headless>=4.10.0",
    "pyzbar>=0.1.9",
    "rapidfuzz>=3.10.0",
    "python-telegram-bot>=21.0",
    "pydantic-settings>=2.6.0",
    "python-jose[cryptography]>=3.3.0",
    "passlib[bcrypt]>=1.7.4",
    "reportlab>=4.2.0",
    "httpx>=0.27.0",
    "asyncpg>=0.30.0",
    "python-multipart>=0.0.12",
    "sentry-sdk[fastapi]>=2.19.0",
    "qrcode[pil]>=8.0",
    "weasyprint>=62.3",
    "cryptography>=43.0.0",
    "moto[s3]>=5.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.24.0",
    "pytest-cov>=6.0.0",
    "httpx>=0.27.0",
    "moto[s3]>=5.0.0",
]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W"]
ignore = ["E501"]

[tool.mypy]
python_version = "3.11"
strict = false
ignore_missing_imports = true

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
"""

BOT_PYPROJECT = """\
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "medvychet-bot"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "python-telegram-bot>=21.0",
    "httpx>=0.27.0",
    "pydantic-settings>=2.6.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.24.0",
]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W"]
ignore = ["E501"]

[tool.mypy]
python_version = "3.11"
strict = false
ignore_missing_imports = true

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
"""

FRONTEND_PACKAGE_JSON = """\
{
  "name": "medvychet-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "tsc": "tsc --noEmit"
  },
  "dependencies": {
    "next": "15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tanstack/react-query": "^5.62.0",
    "zustand": "^5.0.2",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0",
    "lucide-react": "^0.468.0",
    "@radix-ui/react-dialog": "^1.1.4",
    "@radix-ui/react-dropdown-menu": "^2.1.4",
    "@radix-ui/react-label": "^2.1.1",
    "@radix-ui/react-select": "^2.1.4",
    "@radix-ui/react-slot": "^1.1.1",
    "@radix-ui/react-toast": "^1.2.4",
    "@radix-ui/react-progress": "^1.1.1",
    "@radix-ui/react-separator": "^1.1.1",
    "@radix-ui/react-switch": "^1.1.2",
    "@radix-ui/react-tabs": "^1.1.2"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "tailwindcss": "^3.4.17",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "eslint": "^9.17.0",
    "eslint-config-next": "15.1.0",
    "@typescript-eslint/eslint-plugin": "^8.19.0",
    "@typescript-eslint/parser": "^8.19.0"
  }
}
"""

FRONTEND_TSCONFIG = """\
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{"name": "next"}],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
"""

FRONTEND_NEXT_CONFIG = """\
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
"""

ENV_EXAMPLE = """\
# Database
DATABASE_URL=postgresql+asyncpg://medvychet:password@localhost:5432/medvychet
DATABASE_URL_WORKER=postgresql+asyncpg://medvychet_worker:password@localhost:5432/medvychet
TEST_DATABASE_URL=postgresql+asyncpg://medvychet:password@localhost:5432/medvychet_test

# Redis
REDIS_URL=redis://localhost:6379/0

# Yandex Object Storage
YOS_BUCKET_RECEIPTS=medvychet-receipts
YOS_BUCKET_PRESCRIPTIONS=medvychet-prescriptions
YOS_BUCKET_EXPORTS=medvychet-exports
YOS_ACCESS_KEY=your_yos_access_key
YOS_SECRET_KEY=your_yos_secret_key

# Telegram
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
BOT_WEBHOOK_URL=
BOT_WEBHOOK_SECRET=

# JWT
JWT_SECRET_KEY=change_me_to_a_random_32_byte_secret_key

# Sentry
SENTRY_DSN=

# Encryption (base64-encoded 32 bytes)
ENCRYPTION_KEY=

# Frontend
NEXT_PUBLIC_APP_URL=http://localhost:3000
BACKEND_URL=http://localhost:8000
"""

GITIGNORE = """\
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg
.venv/
venv/
env/

# uv
.uv/
uv.lock

# pytest
.pytest_cache/
.coverage
htmlcov/

# mypy
.mypy_cache/

# Node
node_modules/
.next/
out/
*.tsbuildinfo

# Environment
.env
.env.local
.env.*.local

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
"""

FILES = {
    "backend/pyproject.toml": BACKEND_PYPROJECT,
    "bot/pyproject.toml": BOT_PYPROJECT,
    "frontend/package.json": FRONTEND_PACKAGE_JSON,
    "frontend/tsconfig.json": FRONTEND_TSCONFIG,
    "frontend/next.config.ts": FRONTEND_NEXT_CONFIG,
    ".env.example": ENV_EXAMPLE,
    ".gitignore": GITIGNORE,
}


def main() -> None:
    print(f"Creating monorepo scaffold in: {ROOT}")

    for d in DIRS:
        (ROOT / d).mkdir(parents=True, exist_ok=True)
        print(f"  mkdir {d}")

    for f in INIT_PY:
        path = ROOT / f
        if not path.exists():
            path.touch()
            print(f"  touch {f}")

    for rel_path, content in FILES.items():
        path = ROOT / rel_path
        path.write_text(content, encoding="utf-8")
        print(f"  write {rel_path}")

    print("\n✅ Scaffold created successfully!")
    print("\nNext steps:")
    print("  cd backend && uv sync")
    print("  cd bot && uv sync")
    print("  cd frontend && npm install")


if __name__ == "__main__":
    main()
