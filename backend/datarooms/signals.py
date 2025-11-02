from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import DataroomDocument, DataroomFolder, ShareLinkDataroomSetting


@receiver(post_save, sender=DataroomDocument)
def create_settings_for_new_dataroom_document(sender, instance, created, **kwargs):
    """
    When a new document is added to a dataroom, create settings for it
    on all existing share links for that dataroom.
    """
    if created:
        dataroom = instance.dataroom
        # TODO: potential N+1 query problem!
        for link in dataroom.share_links.all():
            ShareLinkDataroomSetting.objects.get_or_create(
                share_link=link,
                dataroom_document=instance,
                defaults={
                    'allow_download': link.allow_download,
                    'enable_watermark': link.enable_watermark,
                }
            )


@receiver(post_save, sender=DataroomFolder)
def create_settings_for_new_dataroom_folder(sender, instance, created, **kwargs):
    """
    When a new folder is added to a dataroom, create settings for it
    on all existing share links for that dataroom.
    """
    if created:
        dataroom = instance.dataroom
        # TODO: potential N+1 query problem!
        for link in dataroom.share_links.all():
            ShareLinkDataroomSetting.objects.get_or_create(
                share_link=link,
                dataroom_folder=instance,
                defaults={
                    'allow_download': link.allow_download,
                    'enable_watermark': link.enable_watermark,
                }
            )
