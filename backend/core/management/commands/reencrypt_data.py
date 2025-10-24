'''
# Set the environment variable with your old key
export OLD_DJANGO_SECRET_KEY='the-old-secret-key-value'
# Run the command
python manage.py reencrypt_data
'''
import os
import pickle

from django.core.management.base import BaseCommand
from django.db import connection

from django_cryptography.core.signing import FernetSigner
from django_cryptography.utils.crypto import FernetBytes, InvalidToken
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from django.utils.encoding import force_bytes
from django_cryptography.conf import CryptographyConf

class Command(BaseCommand):
    help = "Re-encrypts data in encrypted fields after a SECRET_KEY rotation."

    def handle(self, *args, **options):
        OLD_SECRET_KEY = os.environ.get("OLD_DJANGO_SECRET_KEY")

        if not OLD_SECRET_KEY:
            self.stderr.write(self.style.ERROR(
                "OLD_DJANGO_SECRET_KEY environment variable not set. "
                "Cannot perform re-encryption."
            ))
            return

        # A list of models and their encrypted field names to process
        from documents.models import ShareLink
        models_and_fields = [
            (ShareLink, ["password"]),
        ]

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

        for model_class, field_names in models_and_fields:
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
                except InvalidToken:
                    self.stdout.write(self.style.WARNING(
                        f"Skipping {model_class.__name__}(pk={pk}, field={field_name}): "
                        "could not decrypt value."
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
