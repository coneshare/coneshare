from django.apps import AppConfig
from django.db.utils import ProgrammingError


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'

    def ready(self):
        """
        Ensures a default organization exists on application startup.
        """
        try:
            # Model imports must be inside ready() to avoid AppRegistryNotReady errors.
            Organization = self.get_model('Organization')
            if not Organization.objects.exists():
                print("Default organization not found, creating one...")
                Organization.objects.create(name="Default Organization")
        except ProgrammingError:
            # This error is expected if the database table doesn't exist yet,
            # for example, when running `manage.py migrate` for the first time.
            # We can safely ignore it, as the table will be created by the
            # migration, and this code will succeed on the next startup.
            pass
