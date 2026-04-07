from celery import shared_task

from .services import dispatch_automation_event


@shared_task
def dispatch_automation_event_task(event_type: str, payload: dict):
    return dispatch_automation_event(event_type=event_type, payload=payload)
