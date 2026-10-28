import io
import pickle

import pytest
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from django.core.management import call_command
from django.core.signing import BadSignature
from django.db import connection
from django.utils.encoding import force_bytes
from django_cryptography.conf import CryptographyConf
from django_cryptography.core.signing import FernetSigner
from django_cryptography.utils.crypto import FernetBytes, InvalidToken

from automations.models import AutomationDestination
from cloudfiles.models import CloudConnection
from core.models import Organization, User
from documents.models import Document
from sharelinks.models import ShareLink


def _create_encryptor_for_secret(secret_key: str):
    crypto_settings = CryptographyConf()
    kdf = PBKDF2HMAC(
        algorithm=crypto_settings.CRYPTOGRAPHY_DIGEST,
        length=crypto_settings.CRYPTOGRAPHY_DIGEST.digest_size,
        salt=crypto_settings.CRYPTOGRAPHY_SALT,
        iterations=30000,
        backend=crypto_settings.CRYPTOGRAPHY_BACKEND,
    )
    derived_key = kdf.derive(force_bytes(secret_key))
    signer = FernetSigner(key=secret_key)
    return FernetBytes(key=derived_key, signer=signer)


@pytest.mark.django_db
def test_reencrypt_data_aborts_without_old_key():
    out = io.StringIO()
    err = io.StringIO()
    call_command("reencrypt_data", stdout=out, stderr=err)
    err_output = err.getvalue()
    assert "OLD_DJANGO_SECRET_KEY environment variable not set" in err_output


@pytest.mark.django_db
def test_reencrypt_data_models_and_fields_configured():
    from django.apps import apps
    from django_cryptography.fields import EncryptedMixin
    from core.management.commands.reencrypt_data import Command

    configured_dict = {model.__name__: fields for model, fields in Command.MODELS_AND_FIELDS}

    assert "ShareLink" in configured_dict
    assert "password" in configured_dict["ShareLink"]

    assert "CloudConnection" in configured_dict
    assert "access_token" in configured_dict["CloudConnection"]
    assert "refresh_token" in configured_dict["CloudConnection"]

    assert "AutomationDestination" in configured_dict
    assert "signing_secret" in configured_dict["AutomationDestination"]

    # Verify that the explicit list accurately covers all models using EncryptedMixin
    discovered_models = set()
    for model_class in apps.get_models():
        if model_class._meta.abstract or model_class._meta.proxy:
            continue
        for field in model_class._meta.get_fields():
            if getattr(field, "concrete", True) and not getattr(field, "is_relation", False) and isinstance(field, EncryptedMixin):
                discovered_models.add(model_class)

    configured_models = {model for model, _ in Command.MODELS_AND_FIELDS}
    assert discovered_models == configured_models


@pytest.mark.django_db
def test_reencrypt_data_full_key_rotation(monkeypatch):
    old_secret = "test-prior-secret-key-12345"
    old_encryptor = _create_encryptor_for_secret(old_secret)

    org = Organization.objects.create(name="Reencrypt Test Org")
    user = User.objects.create(username="reencrypt_user", email="reencrypt@example.com", organization=org)
    doc = Document.objects.create(name="Doc1", organization=org, created_by=user, file_size=100)

    # 1. Create ShareLink with password
    sl = ShareLink.objects.create(created_by=user, document=doc, password="original_password_xyz")
    # 2. Create CloudConnection with access_token and refresh_token
    cc = CloudConnection.objects.create(
        user=user,
        provider="google",
        email="reencrypt@example.com",
        access_token="initial_access_token",
        refresh_token="initial_refresh_token",
    )
    # 3. Create AutomationDestination with signing_secret
    ad = AutomationDestination.objects.create(
        organization=org,
        created_by=user,
        name="Test Destination",
        destination_type="webhook",
        endpoint_url="https://example.com/webhook",
        signing_secret="initial_webhook_secret",
    )

    # Overwrite DB columns directly with ciphertext encrypted by the old secret key
    def _raw_encrypt(val):
        return old_encryptor.encrypt(pickle.dumps(val))

    with connection.cursor() as cursor:
        cursor.execute(
            "UPDATE sharelinks_sharelink SET password = %s WHERE id = %s",
            [_raw_encrypt("original_password_xyz"), sl.id],
        )
        cursor.execute(
            "UPDATE cloudfiles_cloudconnection SET access_token = %s, refresh_token = %s WHERE id = %s",
            [_raw_encrypt("initial_access_token"), _raw_encrypt("initial_refresh_token"), cc.id],
        )
        cursor.execute(
            "UPDATE automations_automationdestination SET signing_secret = %s WHERE id = %s",
            [_raw_encrypt("initial_webhook_secret"), ad.id],
        )

    # Confirm that loading via standard ORM currently fails to decrypt with current secret
    with pytest.raises((InvalidToken, BadSignature)):
        _ = ShareLink.objects.get(id=sl.id).password

    # Run reencrypt_data with OLD_DJANGO_SECRET_KEY set in env
    monkeypatch.setenv("OLD_DJANGO_SECRET_KEY", old_secret)
    out = io.StringIO()
    err = io.StringIO()
    call_command("reencrypt_data", stdout=out, stderr=err)

    out_val = out.getvalue()
    assert "Successfully processed and re-encrypted" in out_val

    # Reload records and confirm all 4 fields are now cleanly decrypted with current secret key
    sl_reloaded = ShareLink.objects.get(id=sl.id)
    assert sl_reloaded.password == "original_password_xyz"

    cc_reloaded = CloudConnection.objects.get(id=cc.id)
    assert cc_reloaded.access_token == "initial_access_token"
    assert cc_reloaded.refresh_token == "initial_refresh_token"

    ad_reloaded = AutomationDestination.objects.get(id=ad.id)
    assert ad_reloaded.signing_secret == "initial_webhook_secret"


@pytest.mark.django_db
def test_reencrypt_data_handles_null_values_and_invalid_tokens():
    old_secret = "test-prior-secret-key-54321"

    org = Organization.objects.create(name="Reencrypt Test Org 2")
    user = User.objects.create(username="reencrypt_user_2", email="reencrypt2@example.com", organization=org)
    doc = Document.objects.create(name="Doc2", organization=org, created_by=user, file_size=100)

    # ShareLink with null password
    sl = ShareLink.objects.create(created_by=user, document=doc, password=None)

    # CloudConnection with null refresh_token and corrupted access_token
    cc = CloudConnection.objects.create(
        user=user,
        provider="dropbox",
        email="reencrypt2@example.com",
        access_token="temporary_access",
        refresh_token=None,
    )
    with connection.cursor() as cursor:
        cursor.execute(
            "UPDATE cloudfiles_cloudconnection SET access_token = %s WHERE id = %s",
            [b"not-a-valid-token", cc.id],
        )

    out = io.StringIO()
    err = io.StringIO()
    call_command("reencrypt_data", old_key=old_secret, stdout=out, stderr=err)

    out_val = out.getvalue()
    assert "Skipping CloudConnection" in out_val

    # Null password should remain None
    sl_reloaded = ShareLink.objects.get(id=sl.id)
    assert sl_reloaded.password is None
