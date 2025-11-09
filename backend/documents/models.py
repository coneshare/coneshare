from django.db import models

from core.models import BaseModel, Organization, User


class FolderManager(models.Manager):
    def get_root_for_org(self, organization):
        """
        Retrieves the invisible __root__ folder for a given organization.
        Raises Folder.DoesNotExist if the root folder is not found, which
        indicates a critical configuration issue.
        """
        return self.get(organization=organization, name='__root__', parent=None)


class Folder(BaseModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='folders')
    name = models.CharField(max_length=255, db_index=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='folders_created')
    is_starred = models.BooleanField(default=False)

    objects = FolderManager()

    class Meta:
        unique_together = ('created_by', 'parent', 'name')

    def __str__(self):
        return self.name


class Document(BaseModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='documents')
    folder = models.ForeignKey(Folder, on_delete=models.SET_NULL, null=True, blank=True, related_name='documents')
    name = models.CharField(max_length=255, db_index=True)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=[
            ('uploading', 'Uploading'),
            ('processing', 'Processing'),
            ('ready', 'Ready'),
            ('error', 'Error')
        ],
        default='processing'
    )
    status_message = models.CharField(max_length=255, blank=True, null=True)
    storage_key = models.CharField(max_length=1024, blank=True, null=True)
    original_storage_key = models.CharField(max_length=1024, blank=True, null=True)
    type = models.CharField(max_length=20)
    content_type = models.CharField(max_length=255)
    num_pages = models.IntegerField(null=True, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True)
    download_only = models.BooleanField(default=False)
    assistant_enabled = models.BooleanField(default=False)
    is_starred = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='documents_created')

    class Meta:
        unique_together = ('created_by', 'folder', 'name')

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self._state.adding and not self.folder_id:
            # On creation, if no folder is specified, assign to the organization's root folder.
            root_folder = Folder.objects.get_root_for_org(
                organization=self.organization
            )
            self.folder = root_folder
        super().save(*args, **kwargs)


class DocumentVersion(BaseModel):
    """
    Enables version control for a Document. Each version tracks a specific file state.
    """
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='versions')
    version_number = models.IntegerField()
    storage_key = models.CharField(max_length=1024, blank=True)  # Key for the file to be processed into pages (e.g., a PDF).
    original_storage_key = models.CharField(max_length=1024)     # Key for the original, untouched uploaded file (e.g., .docx, .pdf).
    content_type = models.CharField(max_length=255, blank=True)
    type = models.CharField(max_length=50, blank=True)
    storage_type = models.CharField(max_length=20, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True)
    num_pages = models.IntegerField(null=True, blank=True)
    length = models.IntegerField(null=True, blank=True)
    is_primary = models.BooleanField(default=False)
    is_vertical = models.BooleanField(default=True)
    has_pages = models.BooleanField(default=False)

    def __str__(self):
        return f'{self.document.name} v{self.version_number}'


class DocumentPage(BaseModel):
    """
    Represents a single page of a processed document, typically stored as an image
    for efficient viewing.
    """
    document_version = models.ForeignKey(DocumentVersion, on_delete=models.CASCADE, related_name='pages')
    page_number = models.IntegerField()
    storage_key = models.CharField(max_length=1024)
    storage_type = models.CharField(max_length=20, blank=True)
    page_links = models.JSONField(default=dict, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f'Page {self.page_number} of {self.document_version}'
