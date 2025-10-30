from django.db import transaction
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


@receiver(post_save, sender='documents.ShareLink')
def create_dataroom_settings_for_new_share_link(sender, instance, created, **kwargs):
    """
    When a new ShareLink for a Dataroom is created, automatically generate
    ShareLinkDataroomSetting records for all items in that Dataroom.
    """
    if created and instance.dataroom:
        from datarooms.models import DataroomDocument, DataroomFolder, ShareLinkDataroomSetting

        dataroom = instance.dataroom
        dataroom_docs = DataroomDocument.objects.filter(dataroom=dataroom)
        dataroom_folders = DataroomFolder.objects.filter(dataroom=dataroom)

        with transaction.atomic():
            doc_settings = [
                ShareLinkDataroomSetting(
                    share_link=instance,
                    dataroom_document=doc,
                    allow_download=instance.allow_download,
                    enable_watermark=instance.enable_watermark
                ) for doc in dataroom_docs
            ]
            ShareLinkDataroomSetting.objects.bulk_create(doc_settings)

            folder_settings = [
                ShareLinkDataroomSetting(
                    share_link=instance,
                    dataroom_folder=folder,
                    allow_download=instance.allow_download,
                    enable_watermark=instance.enable_watermark
                ) for folder in dataroom_folders
            ]
            ShareLinkDataroomSetting.objects.bulk_create(folder_settings)


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
            folder, _ = Folder.objects.get_or_create(
                organization=org,
                parent=None,
                name='__root__',
                defaults={'created_by': None}
            )
            print(f"Default root folder is set, id: {folder.id}")
