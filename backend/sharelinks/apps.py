from django.apps import AppConfig


class SharelinksConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'sharelinks'

    def ready(self):
        # Import signals to connect them
        import sharelinks.signals
