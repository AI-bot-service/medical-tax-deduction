"""SSE Publisher — publishes batch progress events to Redis PubSub.

Channel pattern: batch:{batch_id}
Event payload: JSON string with keys: batch_id, file_index, status, done_count, total_files
"""
from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)


def publish_batch_event(
    batch_id: str,
    file_index: int,
    status: str,
    done_count: int,
    review_count: int,
    failed_count: int,
    total_files: int,
    completed: bool = False,
) -> None:
    """Publish a batch progress event to Redis PubSub channel batch:{batch_id}.

    This is a synchronous function designed to be called from Celery tasks.
    Uses a fresh sync Redis connection.

    Args:
        batch_id: UUID string of the batch job
        file_index: 0-based index of the processed file
        status: "done" | "review" | "failed"
        done_count: number of files with status DONE
        review_count: number of files with status REVIEW
        failed_count: number of files with status FAILED
        total_files: total number of files in the batch
        completed: True if all files have been processed
    """
    try:
        import redis

        from app.config import settings

        channel = f"batch:{batch_id}"
        payload = json.dumps(
            {
                "batch_id": batch_id,
                "file_index": file_index,
                "status": status,
                "done_count": done_count,
                "review_count": review_count,
                "failed_count": failed_count,
                "total_files": total_files,
                "completed": completed,
            }
        )
        r = redis.from_url(settings.redis_url, decode_responses=True)
        r.publish(channel, payload)
        r.close()
        logger.debug("SSE published to %s: %s", channel, payload)
    except Exception as exc:
        logger.warning("Failed to publish SSE event for batch %s: %s", batch_id, exc)
