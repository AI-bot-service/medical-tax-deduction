"""Celery application factory."""
from celery import Celery

from app.config import settings

celery_app = Celery(
    "medvychet",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Moscow",
    enable_utc=True,
    task_track_started=True,
)
