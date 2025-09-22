from django.db.models.signals import post_migrate, post_save
from django.dispatch import receiver


@receiver(post_save, sender='core.Organization')
def create_root_folder_for_new_organization(sender, instance, created, **kwargs):
    """
    Create an invisible '__root__' folder for a new organization when it is created.
    """
    if created:
        from .models import Folder
        Folder.objects.get_or_create(
            organization=instance,
            parent=None,
            name='__root__',
            defaults={'created_by': None}
        )


@receiver(post_migrate)
def setup_initial_data(sender, **kwargs):
    """
    Handles initial data setup after 'documents' app migrations.
    - Creates a default Organization if one doesn't exist.
    - Ensures all organizations have an invisible '__root__' folder.
    """
    if sender.name == 'documents':
        from core.models import Organization
        from .models import Folder

        # Create default organization if it doesn't exist.
        if not Organization.objects.exists():
            print("Default organization not found, creating one...")
            Organization.objects.create(name="Default Organization")
            # The post_save signal will create the __root__ folder for the new org.

        # Ensure all existing organizations have a root folder for idempotency.
        for org in Organization.objects.all():
            Folder.objects.get_or_create(
                organization=org,
                parent=None,
                name='__root__',
                defaults={'created_by': None}
            )
