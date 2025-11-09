from django.db.models.signals import post_save
from django.dispatch import receiver

from datarooms.models import DataroomDocument, DataroomFolder
from .models import ShareLink, ShareLinkDataroomSetting


@receiver(post_save, sender=ShareLink)
def create_settings_for_new_dataroom_share_link(sender, instance, created, **kwargs):
    """
    When a new share link is created for a dataroom, create default settings
    for all existing documents and folders in that dataroom.
    """
    if created and instance.dataroom:
        dataroom = instance.dataroom

        doc_settings = [
            ShareLinkDataroomSetting(
                share_link=instance,
                dataroom_document=ddoc,
                allow_download=instance.allow_download,
                enable_watermark=instance.enable_watermark
            )
            for ddoc in dataroom.documents.all()
        ]

        folder_settings = [
            ShareLinkDataroomSetting(
                share_link=instance,
                dataroom_folder=dfolder,
                allow_download=instance.allow_download,
                enable_watermark=instance.enable_watermark
            )
            for dfolder in dataroom.folders.all()
        ]

        ShareLinkDataroomSetting.objects.bulk_create(
            doc_settings + folder_settings,
            ignore_conflicts=True
        )
