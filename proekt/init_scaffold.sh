#!/usr/bin/env bash
# Scaffold monorepo structure for MedВычет
# Run from: medical-tax-deduction/ root
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "Creating monorepo scaffold in: $ROOT"

# ── Directory structure ────────────────────────────────────────────────────────
mkdir -p "$ROOT/backend/app/middleware"
mkdir -p "$ROOT/backend/app/models"
mkdir -p "$ROOT/backend/app/schemas"
mkdir -p "$ROOT/backend/app/routers"
mkdir -p "$ROOT/backend/app/services/ocr"
mkdir -p "$ROOT/backend/app/services/auth"
mkdir -p "$ROOT/backend/app/services/prescriptions"
mkdir -p "$ROOT/backend/app/services/export"
mkdir -p "$ROOT/backend/app/services/storage"
mkdir -p "$ROOT/backend/app/repositories"
mkdir -p "$ROOT/backend/workers/tasks"
mkdir -p "$ROOT/backend/alembic/versions"
mkdir -p "$ROOT/backend/data"
mkdir -p "$ROOT/backend/tests/test_ocr"
mkdir -p "$ROOT/backend/tests/test_auth"
mkdir -p "$ROOT/backend/tests/test_receipts"
mkdir -p "$ROOT/backend/tests/test_prescriptions"
mkdir -p "$ROOT/backend/tests/test_batch"
mkdir -p "$ROOT/backend/tests/test_export"
mkdir -p "$ROOT/backend/tests/test_security"
mkdir -p "$ROOT/backend/tests/test_workers"
mkdir -p "$ROOT/backend/tests/manual"
mkdir -p "$ROOT/bot/handlers"
mkdir -p "$ROOT/bot/services"
mkdir -p "$ROOT/bot/tests"
mkdir -p "$ROOT/frontend/src/app/\(auth\)/login"
mkdir -p "$ROOT/frontend/src/app/\(auth\)/privacy"
mkdir -p "$ROOT/frontend/src/app/\(cabinet\)/dashboard"
mkdir -p "$ROOT/frontend/src/app/\(cabinet\)/receipts"
mkdir -p "$ROOT/frontend/src/app/\(cabinet\)/prescriptions/new"
mkdir -p "$ROOT/frontend/src/app/\(cabinet\)/review"
mkdir -p "$ROOT/frontend/src/app/\(cabinet\)/export"
mkdir -p "$ROOT/frontend/src/app/\(cabinet\)/profile"
mkdir -p "$ROOT/frontend/src/app/api/auth/mini-app"
mkdir -p "$ROOT/frontend/src/components/ui"
mkdir -p "$ROOT/frontend/src/hooks"
mkdir -p "$ROOT/frontend/src/lib"
mkdir -p "$ROOT/frontend/src/types"
mkdir -p "$ROOT/infra/nginx"
mkdir -p "$ROOT/.github/workflows"

# ── Touch __init__.py ──────────────────────────────────────────────────────────
touch "$ROOT/backend/app/__init__.py"
touch "$ROOT/backend/app/middleware/__init__.py"
touch "$ROOT/backend/app/models/__init__.py"
touch "$ROOT/backend/app/schemas/__init__.py"
touch "$ROOT/backend/app/routers/__init__.py"
touch "$ROOT/backend/app/services/__init__.py"
touch "$ROOT/backend/app/services/ocr/__init__.py"
touch "$ROOT/backend/app/services/auth/__init__.py"
touch "$ROOT/backend/app/services/prescriptions/__init__.py"
touch "$ROOT/backend/app/services/export/__init__.py"
touch "$ROOT/backend/app/services/storage/__init__.py"
touch "$ROOT/backend/app/repositories/__init__.py"
touch "$ROOT/backend/workers/__init__.py"
touch "$ROOT/backend/workers/tasks/__init__.py"
touch "$ROOT/backend/tests/__init__.py"
touch "$ROOT/bot/__init__.py"
touch "$ROOT/bot/handlers/__init__.py"
touch "$ROOT/bot/services/__init__.py"

# ── backend/pyproject.toml ─────────────────────────────────────────────────────
cat > "$ROOT/backend/pyproject.toml" << 'PYPROJECT'
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
PYPROJECT

# ── bot/pyproject.toml ─────────────────────────────────────────────────────────
cat > "$ROOT/bot/pyproject.toml" << 'PYPROJECT'
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
PYPROJECT

# ── frontend/package.json ──────────────────────────────────────────────────────
cat > "$ROOT/frontend/package.json" << 'PKGJSON'
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
    "@radix-ui/react-badge": "*",
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
PKGJSON

# ── frontend/tsconfig.json ─────────────────────────────────────────────────────
cat > "$ROOT/frontend/tsconfig.json" << 'TSJSON'
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
TSJSON

# ── frontend/next.config.ts ────────────────────────────────────────────────────
cat > "$ROOT/frontend/next.config.ts" << 'NEXTCFG'
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
NEXTCFG

# ── .env.example ──────────────────────────────────────────────────────────────
cat > "$ROOT/.env.example" << 'ENVEXAMPLE'
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
ENVEXAMPLE

echo ""
echo "✅ Monorepo scaffold created successfully!"
echo ""
echo "Next steps:"
echo "  cd backend && uv sync"
echo "  cd bot && uv sync"
echo "  cd frontend && npm install"
