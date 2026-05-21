import pytest
from django.core.cache import cache

from core.models import AppConfiguration
from core.services import get_dynamic_setting


@pytest.mark.django_db
def test_get_dynamic_setting_bool_false_string_is_false():
    AppConfiguration.objects.update_or_create(
        key='ENABLE_PUBLIC_SIGNUP',
        defaults={'value': 'false', 'description': 'Enable public signup with email verification.'},
    )
    cache.delete('app_config:ENABLE_PUBLIC_SIGNUP')

    assert get_dynamic_setting('ENABLE_PUBLIC_SIGNUP') is False


@pytest.mark.django_db
def test_get_dynamic_setting_bool_invalid_falls_back_to_default(settings):
    settings.ENABLE_PUBLIC_SIGNUP = True
    AppConfiguration.objects.update_or_create(
        key='ENABLE_PUBLIC_SIGNUP',
        defaults={'value': 'not-a-bool', 'description': 'Enable public signup with email verification.'},
    )
    cache.delete('app_config:ENABLE_PUBLIC_SIGNUP')

    assert get_dynamic_setting('ENABLE_PUBLIC_SIGNUP') is True
