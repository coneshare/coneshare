from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'

    def ready(self):
        """
        Connects signals for the core app.
        """
        # Import signals to connect them
        import core.signals
        # Apply sqlite pragmas (WAL/synchronous) on sqlite connections.
        import core.sqlite_pragmas
