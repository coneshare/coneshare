"""
Management command: reencrypt_data

Purpose:
    Re-encrypts database records in fields encrypted by django-cryptography
    after a Django SECRET_KEY rotation.

When to Use:
    Execute this command immediately after updating SECRET_KEY in your environment (.env).
    Without re-encryption, existing encrypted secrets (share link passwords, cloud OAuth tokens,
    and webhook signing secrets) cannot be decrypted by the application using the new secret key.

Encrypted Models & Fields Covered:
    - sharelinks.ShareLink: password (public share link passwords)
    - cloudfiles.CloudConnection: access_token, refresh_token (OAuth storage credentials)
    - automations.AutomationDestination: signing_secret (HMAC webhook signature secrets)

Usage Examples:

    1. Using the --old-key CLI parameter (Recommended):
       # Host / Local:
       python manage.py reencrypt_data --old-key 'your-previous-secret-key'

       # Docker Compose:
       COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend python manage.py reencrypt_data --old-key 'your-previous-secret-key'

    2. Using the OLD_DJANGO_SECRET_KEY environment variable:
       # Host / Local:
       export OLD_DJANGO_SECRET_KEY='your-previous-secret-key'
       python manage.py reencrypt_data

       # Docker Compose:
       COMPOSE_PROJECT_NAME=coneshare docker-compose exec -e OLD_DJANGO_SECRET_KEY='your-previous-secret-key' backend python manage.py reencrypt_data
"""
import os
import pickle

from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from django.core.management.base import BaseCommand
from django.core.signing import BadSignature
from django.db import connection
from django.utils.encoding import force_bytes
from django_cryptography.conf import CryptographyConf
from django_cryptography.core.signing import FernetSigner
from django_cryptography.utils.crypto import FernetBytes, InvalidToken

from automations.models import AutomationDestination
from cloudfiles.models import CloudConnection
from sharelinks.models import ShareLink


class Command(BaseCommand):
    help = "Re-encrypts data in encrypted fields after a SECRET_KEY rotation."

    # Explicit list of models and their encrypted fields in Coneshare
    MODELS_AND_FIELDS = [
        (ShareLink, ["password"]),
        (CloudConnection, ["access_token", "refresh_token"]),
        (AutomationDestination, ["signing_secret"]),
    ]

    def add_arguments(self, parser):
        parser.add_argument(
            "--old-key",
            dest="old_key",
            help="The old DJANGO_SECRET_KEY used to decrypt existing data. Defaults to OLD_DJANGO_SECRET_KEY env var.",
        )

    def handle(self, *args, **options):
        OLD_SECRET_KEY = options.get("old_key") or os.environ.get("OLD_DJANGO_SECRET_KEY")

        if not OLD_SECRET_KEY:
            self.stderr.write(self.style.ERROR(
                "OLD_DJANGO_SECRET_KEY environment variable not set (or --old-key not provided). "
                "Cannot perform re-encryption."
            ))
            return

        # Get current cryptography settings to replicate the Key Derivation Function
        crypto_settings = CryptographyConf()

        # Manually derive the OLD encryption key from the OLD secret key
        kdf = PBKDF2HMAC(
            algorithm=crypto_settings.CRYPTOGRAPHY_DIGEST,
            length=crypto_settings.CRYPTOGRAPHY_DIGEST.digest_size,
            salt=crypto_settings.CRYPTOGRAPHY_SALT,
            iterations=30000,  # This is the hardcoded default
            backend=crypto_settings.CRYPTOGRAPHY_BACKEND,
        )
        OLD_CRYPTOGRAPHY_KEY = kdf.derive(force_bytes(OLD_SECRET_KEY))

        # Build the decryptor using BOTH the old encryption key and old signing key
        old_signer = FernetSigner(key=OLD_SECRET_KEY)
        old_decryptor = FernetBytes(key=OLD_CRYPTOGRAPHY_KEY, signer=old_signer)

        for model_class, field_names in self.MODELS_AND_FIELDS:
            self.reencrypt_model(model_class, field_names, old_decryptor)

    def reencrypt_model(self, model_class, field_names, old_decryptor):
        model_meta = model_class._meta
        db_table = model_meta.db_table
        pk_name = model_meta.pk.name

        pks = list(model_class.objects.values_list(pk_name, flat=True))
        total_count = len(pks)
        self.stdout.write(f"Processing {total_count} records for {model_class.__name__}...")

        processed_count = 0
        for pk in pks:
            instance = model_class.objects.defer(*field_names).get(pk=pk)
            update_fields = []

            for field_name in field_names:
                db_column = model_meta.get_field(field_name).column

                # Fetch the raw encrypted data using a direct SQL query
                with connection.cursor() as cursor:
                    cursor.execute(
                        f"SELECT {db_column} FROM {db_table} WHERE {pk_name} = %s", [pk]
                    )
                    row = cursor.fetchone()

                if not row or row[0] is None:
                    continue

                raw_encrypted_value = row[0]

                try:
                    # Decrypt the raw value using the OLD key
                    decrypted_bytes = old_decryptor.decrypt(raw_encrypted_value)
                    original_value = pickle.loads(decrypted_bytes)
                except (InvalidToken, BadSignature, pickle.UnpicklingError, ValueError) as err:
                    self.stdout.write(self.style.WARNING(
                        f"Skipping {model_class.__name__}(pk={pk}, field={field_name}): "
                        f"could not decrypt value ({err})."
                    ))
                    continue

                # Assign the plaintext value back to the instance
                setattr(instance, field_name, original_value)
                update_fields.append(field_name)

            # Save the model to re-encrypt the updated fields using the NEW key
            if update_fields:
                instance.save(update_fields=update_fields)
                processed_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"Successfully processed and re-encrypted {processed_count} records for {model_class.__name__}."
        ))
