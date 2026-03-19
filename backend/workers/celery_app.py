"""Celery application factory."""
from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "medvychet",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["workers.tasks.ocr_task", "workers.tasks.cleanup_task", "workers.tasks.batch_task"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Moscow",
    enable_utc=True,
    task_track_started=True,
    beat_schedule={
        "cleanup-expired-otps": {
            "task": "workers.tasks.cleanup_task.cleanup_expired_otps",
            "schedule": crontab(minute="*/15"),  # каждые 15 минут
        },
    },
)
