from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from .models import AppConfiguration
from .settings_registry import DEFAULT_SETTINGS, deserialize_db_value, infer_setting_type


def blacklist_all_user_tokens(user) -> int:
    """
    Blacklists all unexpired outstanding refresh tokens for a user.
    Used during user deactivation, user deletion, and password change.
    """
    outstanding = OutstandingToken.objects.filter(user=user, expires_at__gt=timezone.now())
    already_blacklisted = BlacklistedToken.objects.filter(token__user=user).values_list('token_id', flat=True)
    unblacklisted = outstanding.exclude(id__in=already_blacklisted)

    blacklisted_entries = [BlacklistedToken(token=token) for token in unblacklisted]
    if blacklisted_entries:
        BlacklistedToken.objects.bulk_create(blacklisted_entries, ignore_conflicts=True)
    return len(blacklisted_entries)


def get_dynamic_setting(key: str):
    """
    Retrieves a dynamic setting value with caching.
    1. Checks cache for the database value.
    2. If not cached, queries the AppConfiguration model and caches the result.
    3. If not found in DB, falls back to the default value from django.conf.settings.
    4. Type-casts the DB value based on the type of the default in settings.
    """
    cache_key = f"app_config:{key}"
    value_str = cache.get(cache_key)

    if value_str is None:
        try:
            setting = AppConfiguration.objects.get(key=key)
            value_str = setting.value
            cache.set(cache_key, value_str, timeout=3600)
        except AppConfiguration.DoesNotExist:
            # Not in DB, so use default from settings. No need to cache this.
            return getattr(settings, key)

    # At this point, value_str is from the DB (via cache or direct query)
    default_value = getattr(settings, key)
    setting_def = DEFAULT_SETTINGS.get(key)
    setting_type = (setting_def.get('type') if isinstance(setting_def, dict) else None) or infer_setting_type(default_value)
    return deserialize_db_value(setting_type, value_str, default_value)


def get_max_watermark_file_size_mb() -> int:
    """
    Returns the maximum file size (in MB) for watermarked operations.
    Preserves an explicit 0 (which restricts all watermarking) rather than
    falsy-falling back via `or`.
    """
    try:
        val = get_dynamic_setting('MAX_WATERMARK_FILE_SIZE_MB')
    except AttributeError:
        val = None
    if val is not None:
        return val
    return 100
