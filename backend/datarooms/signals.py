import logging
import threading

from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver

from documents.models import Folder
from documents.services import delete_document_and_files
from sharelinks.models import ShareLinkDataroomSetting
from .models import DataroomDocument, DataroomFolder


logger = logging.getLogger(__name__)


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


# Thread-local storage to track documents currently being deleted in each thread.
# This prevents cross-thread state leakage and race conditions in multi-threaded environments.
_thread_local = threading.local()


def _get_deleting_docs():
    if not hasattr(_thread_local, 'deleting_docs'):
        _thread_local.deleting_docs = set()
    return _thread_local.deleting_docs


@receiver(pre_delete, sender=DataroomDocument)
def delete_direct_uploaded_document_on_remove(sender, instance, **kwargs):
    """
    When a document is removed/deleted from a dataroom, if it was a direct upload
    (i.e. stored in 'Dataroom Uploads' hierarchy) and there are no other references
    to it in any dataroom, delete the backing Document model and files from storage.
    """
    doc = instance.document
    deleting_docs = _get_deleting_docs()
    if not doc or doc.id in deleting_docs:
        return

    # Check if this document is referenced by any other DataroomDocument.
    # We exclude the current instance being deleted.
    other_references_exist = DataroomDocument.objects.filter(document=doc).exclude(pk=instance.pk).exists()
    if other_references_exist:
        return

    try:
        root_folder = Folder.objects.get_root_for_org(doc.organization)
        dataroom_uploads = Folder.objects.get(
            organization=doc.organization,
            parent=root_folder,
            name="Dataroom Uploads",
            created_by=doc.created_by
        )
    except (Folder.DoesNotExist, Folder.MultipleObjectsReturned):
        return

    # Check if the document's folder is a descendant of 'Dataroom Uploads'
    folder = doc.folder
    is_direct_upload = False
    while folder:
        if folder == dataroom_uploads:
            is_direct_upload = True
            break
        folder = folder.parent

    if is_direct_upload:
        deleting_docs = _get_deleting_docs()
        deleting_docs.add(doc.id)
        try:
            delete_document_and_files(doc)
        except Exception as e:
            # Log the error but don't block the DataroomDocument deletion
            # to prevent transaction blockages.
            logger.exception("Failed to clean up backing document %s: %s", doc.id, e)
        finally:
            deleting_docs.discard(doc.id)
