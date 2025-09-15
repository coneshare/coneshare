from django.apps import AppConfig


def create_default_organization(sender, **kwargs):
    """
    Creates a default Organization after migrations have been run for the 'core' app.
    """
    Organization = sender.get_model('Organization')
    if not Organization.objects.exists():
        print("Default organization not found, creating one...")
        Organization.objects.create(name="Default Organization")


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'

    def ready(self):
        """
        Connects the post_migrate signal to create the default organization.
        """
        from django.db.models.signals import post_migrate
        post_migrate.connect(create_default_organization, sender=self)
