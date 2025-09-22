from django.db.models.signals import post_migrate
from django.dispatch import receiver


@receiver(post_migrate)
def create_invisible_root_folders(sender, **kwargs):
    """
    Create an invisible '__root__' folder for each organization after migrations.
    This ensures that every organization has a root folder to act as a parent
    for all top-level user-created folders, avoiding NULL parent references.
    """
    # We only want to run this when the 'documents' app migrations are applied.
    if sender.name == 'documents':
        from core.models import Organization
        from .models import Folder

        for org in Organization.objects.all():
            Folder.objects.get_or_create(
                organization=org,
                parent=None,
                name='__root__',
                defaults={'created_by': None}
            )
