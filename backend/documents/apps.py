import pillow_heif
from django.apps import AppConfig


class DocumentsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'documents'

    def ready(self):
        # Register HEIF opener so Pillow transparently supports HEIC/HEIF files
        pillow_heif.register_heif_opener()
        # Import signals to connect them
        import documents.signals
