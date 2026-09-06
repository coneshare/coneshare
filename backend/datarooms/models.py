import os

from django.db import models
from django.db.models import Q

from core.models import BaseModel, Organization, User

DROOM_ITEM_TYPE_FOLDER = "folder"
DROOM_ITEM_TYPE_DOCUMENT = "document"


def dataroom_branding_banner_path(instance, filename):
    _, extension = os.path.splitext(filename)
    ext = extension or ".png"
    return f"dataroom-branding/{instance.organization_id}/{instance.id}/banner{ext}"


class Dataroom(BaseModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='datarooms')
    name = models.CharField(max_length=255)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='datarooms_created')
    show_file_index = models.BooleanField(default=True)
    enable_qna = models.BooleanField(default=True)
    branding_banner = models.ImageField(upload_to=dataroom_branding_banner_path, null=True, blank=True)
    brand_primary_color = models.CharField(max_length=9, null=True, blank=True)
    brand_secondary_color = models.CharField(max_length=9, null=True, blank=True)
    brand_accent_color = models.CharField(max_length=9, null=True, blank=True)
    storage_quota_mb = models.IntegerField(default=0, help_text="Max storage capacity for this dataroom in MB. 0 means unlimited.")
    storage_version = models.PositiveSmallIntegerField(
        default=2,
        db_index=True,
        help_text="Storage architecture version: 1 (legacy user-scoped), 2 (system vault)"
    )
    vault_folder = models.OneToOneField(
        'documents.Folder',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='owned_dataroom',
    )

    def __str__(self):
        return self.name


class DataroomFolder(BaseModel):
    dataroom = models.ForeignKey(Dataroom, on_delete=models.CASCADE, related_name='folders')
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    name = models.CharField(max_length=255)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='dataroom_folders_created'
    )
    is_starred = models.BooleanField(default=False)

    def get_full_path(self):
        """
        Returns the '/' delimited path of this folder hierarchy (e.g. '/Financials/2026/Q1').
        Traverses ancestors via self.parent. Call sites creating audit snapshots should
        prefetch ancestor relations (e.g. select_related('parent__parent...')) to resolve
        all levels in a single query and prevent N+1 DB round-trips.
        """
        parts = [self.name]
        curr = self.parent
        visited = {self.id}
        while curr and curr.id not in visited:
            parts.append(curr.name)
            visited.add(curr.id)
            curr = curr.parent
        return "/" + "/".join(reversed(parts))

    def __str__(self):
        return self.name


class DataroomDocument(BaseModel):
    dataroom = models.ForeignKey(Dataroom, on_delete=models.CASCADE, related_name='documents')
    document = models.ForeignKey('documents.Document', on_delete=models.CASCADE)
    folder = models.ForeignKey(DataroomFolder, on_delete=models.CASCADE, null=True, blank=True)
    name = models.CharField(max_length=255, blank=True)
    is_starred = models.BooleanField(default=False)
    is_direct_upload = models.BooleanField(
        null=True,
        blank=True,
        default=None,
        db_index=True,
        help_text="True if directly uploaded into Dataroom, False if linked from user workspace, None for legacy records."
    )

    class Meta:
        unique_together = ('dataroom', 'document', 'folder')


class DataroomItemOrder(BaseModel):
    ITEM_TYPE_FOLDER = DROOM_ITEM_TYPE_FOLDER
    ITEM_TYPE_DOCUMENT = DROOM_ITEM_TYPE_DOCUMENT

    ITEM_TYPE_CHOICES = (
        (DROOM_ITEM_TYPE_FOLDER, "Folder"),
        (DROOM_ITEM_TYPE_DOCUMENT, "Document"),
    )

    dataroom = models.ForeignKey(Dataroom, on_delete=models.CASCADE, related_name="item_orders")
    parent_folder = models.ForeignKey(
        DataroomFolder,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="child_item_orders",
    )
    item_type = models.CharField(max_length=16, choices=ITEM_TYPE_CHOICES)
    folder = models.OneToOneField(
        DataroomFolder,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="order_entry",
    )
    dataroom_document = models.OneToOneField(
        DataroomDocument,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="order_entry",
    )
    position = models.PositiveIntegerField(default=0, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["dataroom", "parent_folder", "position"],
                name="uq_dataroom_item_order_scope_position",
            ),
            models.CheckConstraint(
                condition=(
                    (
                        Q(item_type=DROOM_ITEM_TYPE_FOLDER)
                        & Q(folder__isnull=False)
                        & Q(dataroom_document__isnull=True)
                    )
                    | (
                        Q(item_type=DROOM_ITEM_TYPE_DOCUMENT)
                        & Q(folder__isnull=True)
                        & Q(dataroom_document__isnull=False)
                    )
                ),
                name="ck_dataroom_item_order_target_matches_type",
            ),
        ]
        indexes = [
            models.Index(fields=["dataroom", "parent_folder", "position"]),
        ]


class DataroomCollaborator(BaseModel):
    ROLE_COLLABORATOR = 'collaborator'

    ROLE_CHOICES = (
        (ROLE_COLLABORATOR, 'Collaborator'),
    )

    dataroom = models.ForeignKey(
        Dataroom,
        on_delete=models.CASCADE,
        related_name='collaborators'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='dataroom_collaborations'
    )
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default=ROLE_COLLABORATOR
    )
    invited_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='collaborators_invited'
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['dataroom', 'user'],
                name='uq_dataroom_collaborator_dataroom_user'
            )
        ]
        ordering = ['created_at']

    def __str__(self):
        return f"{self.user.email} - {self.dataroom.name} ({self.role})"

