from django.apps import AppConfig


class DataroomsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'datarooms'

    def ready(self):
        # Import signals to connect them
        import datarooms.signals
