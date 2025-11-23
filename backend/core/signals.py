from django.core.cache import cache
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import AppConfiguration


@receiver(post_save, sender=AppConfiguration)
def clear_setting_cache_on_save(sender, instance, **kwargs):
    """
    Invalidates the cache for a specific setting when it is saved.
    """
    cache_key = f"app_config:{instance.key}"
    cache.delete(cache_key)
