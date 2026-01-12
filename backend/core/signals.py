from django.contrib.auth.signals import user_logged_in
from django.core.cache import cache
from django.db.models.signals import post_save
from django.dispatch import receiver

from backend.utils import get_client_ip
from .models import AppConfiguration, LoginActivity


@receiver(post_save, sender=AppConfiguration)
def clear_setting_cache_on_save(sender, instance, **kwargs):
    """
    Invalidates the cache for a specific setting when it is saved.
    """
    cache_key = f"app_config:{instance.key}"
    cache.delete(cache_key)


@receiver(user_logged_in)
def record_user_login(sender, request, user, **kwargs):
    """
    Records a user's login activity.
    """
    ip_address = get_client_ip(request)
    user_agent = request.META.get('HTTP_USER_AGENT', '')[:255]
    LoginActivity.objects.create(
        user=user,
        ip_address=ip_address,
        user_agent=user_agent
    )
