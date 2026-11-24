import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from sharelinks.models import ShareLinkDataroomSetting
from .models import DataroomDocument, DataroomFolder


logger = logging.getLogger(__name__)


def _create_settings_from_parent_folder(dataroom, parent_folder, **target_kwargs):
    """
    Create ShareLinkDataroomSetting rows for a newly added dataroom item across
    all share links on the dataroom, copying parent folder settings when present.
    """
    parent_settings = {}
    if parent_folder is not None:
        parent_settings = {
            s.share_link_id: s
            for s in ShareLinkDataroomSetting.objects.filter(dataroom_folder=parent_folder)
        }

    for link in dataroom.share_links.all():
        parent_setting = parent_settings.get(link.id)
        defaults = (
            {
                'is_visible': parent_setting.is_visible,
                'allow_download': parent_setting.allow_download,
                'enable_watermark': parent_setting.enable_watermark,
            }
            if parent_setting is not None
            else {
                'is_visible': True,
                'allow_download': link.allow_download,
                'enable_watermark': link.enable_watermark,
            }
        )
        ShareLinkDataroomSetting.objects.get_or_create(
            share_link=link,
            defaults=defaults,
            **target_kwargs,
        )


@receiver(post_save, sender=DataroomDocument)
def create_settings_for_new_dataroom_document(sender, instance, created, **kwargs):
    """
    When a new document is added to a dataroom, create settings for it
    on all existing share links for that dataroom.
    """
    if created:
        _create_settings_from_parent_folder(
            instance.dataroom,
            instance.folder,
            dataroom_document=instance,
        )


@receiver(post_save, sender=DataroomFolder)
def create_settings_for_new_dataroom_folder(sender, instance, created, **kwargs):
    """
    When a new folder is added to a dataroom, create settings for it
    on all existing share links for that dataroom.
    """
    if created:
        _create_settings_from_parent_folder(
            instance.dataroom,
            instance.parent,
            dataroom_folder=instance,
        )
