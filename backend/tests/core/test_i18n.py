import os
import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture(autouse=True, scope="session")
def ensure_mo_catalogs_compiled():
    """Ensure binary .mo catalogs exist and are compiled before running i18n tests."""
    from compile_po import make_mo, BASE_LOCALE
    for lang in ['en', 'zh_Hans', 'ru']:
        po_path = os.path.join(BASE_LOCALE, lang, 'LC_MESSAGES', 'django.po')
        mo_path = os.path.join(BASE_LOCALE, lang, 'LC_MESSAGES', 'django.mo')
        if os.path.exists(po_path):
            make_mo(po_path, mo_path)


@pytest.fixture
def user(db, organization):
    return User.objects.create_user(
        username="user@example.com",
        email="user@example.com",
        password="password123",
        organization=organization
    )


@pytest.fixture
def api_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestUserLanguagePreference:
    """Verify user language preference CRUD and API response localization."""

    def test_user_language_default_is_english(self, user):
        assert user.language == 'en'

    def test_update_user_language(self, api_client, user):
        url = reverse('user-detail', kwargs={'pk': user.id})
        resp = api_client.patch(url, {'language': 'zh-hans'})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['language'] == 'zh-hans'
        user.refresh_from_db()
        assert user.language == 'zh-hans'

    def test_invalid_language_rejected(self, api_client, user):
        url = reverse('user-detail', kwargs={'pk': user.id})
        resp = api_client.patch(url, {'language': 'invalid_code'})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert 'language' in resp.data

    def test_list_languages_endpoint(self, db):
        client = APIClient()
        url = reverse('languages')
        resp = client.get(url, HTTP_ACCEPT_LANGUAGE='ru')
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data == [
            {'code': 'en', 'name': 'English'},
            {'code': 'zh-hans', 'name': '简体中文'},
            {'code': 'ru', 'name': 'Русский'},
        ]

    def test_api_error_respects_accept_language_header(self, api_client):
        """Verify API response error messages respect Accept-Language header."""
        url = reverse('set_password')
        payload = {
            'old_password': 'wrong_password',
            'new_password1': 'new_pass123',
            'new_password2': 'new_pass123',
        }
        resp = api_client.post(url, payload, HTTP_ACCEPT_LANGUAGE='zh-hans')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['old_password'] == ['密码错误。']

    def test_api_error_in_russian(self, api_client):
        """Verify API response error messages in Russian when Accept-Language: ru."""
        url = reverse('set_password')
        payload = {
            'old_password': 'wrong_password',
            'new_password1': 'new_pass123',
            'new_password2': 'new_pass123',
        }
        resp = api_client.post(url, payload, HTTP_ACCEPT_LANGUAGE='ru')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['old_password'] == ['Неверный пароль.']

    @pytest.mark.parametrize("lang, expected_subject, expected_snippet", [
        ("en", "Verify your Coneshare account", "Welcome to Coneshare."),
        ("zh-hans", "验证您的 Coneshare 账号", "欢迎使用 Coneshare。"),
        ("ru", "Подтвердите ваш аккаунт Coneshare", "Добро пожаловать в Coneshare."),
    ])
    def test_signup_verification_email_task_language_override(self, mailoutbox, lang, expected_subject, expected_snippet):
        """Verify Celery signup verification email task respects language override for subject and body."""
        from core.tasks import send_signup_verification_email_task
        mailoutbox.clear()
        send_signup_verification_email_task(
            email='user@example.com',
            verify_url='https://example.com/verify',
            language=lang
        )
        assert len(mailoutbox) == 1
        msg = mailoutbox[0]
        assert msg.to == ['user@example.com']
        assert msg.subject == expected_subject
        assert expected_snippet in msg.body

    def test_signup_request_uses_user_language_when_no_accept_header(self, db, monkeypatch):
        """Verify signup verification email uses user's language preference when Accept-Language header is omitted."""
        from core.models import AppConfiguration
        from django.core.cache import cache
        AppConfiguration.objects.update_or_create(
            key='ENABLE_PUBLIC_SIGNUP',
            defaults={'value': 'true', 'description': 'Enable public signup.'}
        )
        cache.clear()
        captured = {}

        def _fake_delay(email, verify_url, language):
            captured['language'] = language

        monkeypatch.setattr('core.views.transaction.on_commit', lambda fn: fn())
        monkeypatch.setattr('core.views.send_signup_verification_email_task.delay', _fake_delay)

        user = User.objects.create_user(
            username="inactive@example.com",
            email="inactive@example.com",
            password="StrongPassword123!",
            language="zh-hans",
            is_active=False
        )
        client = APIClient()
        url = reverse('signup_request')
        resp = client.post(url, {'email': 'inactive@example.com', 'password': 'StrongPassword123!', 'name': 'Inactive User'})
        assert resp.status_code == status.HTTP_202_ACCEPTED
        assert captured.get('language') == 'zh-hans'
