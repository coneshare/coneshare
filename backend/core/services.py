from django.conf import settings
from django.core.cache import cache

from .models import AppConfiguration
from .settings_registry import DEFAULT_SETTINGS, deserialize_db_value, infer_setting_type


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
    setting_type = DEFAULT_SETTINGS.get(key, {}).get('type') or infer_setting_type(default_value)
    return deserialize_db_value(setting_type, value_str, default_value)
