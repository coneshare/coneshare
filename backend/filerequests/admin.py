from django.contrib import admin
from .models import FileRequest, UploadedFile

@admin.register(FileRequest)
class FileRequestAdmin(admin.ModelAdmin):
    list_display = ('name', 'folder', 'created_by', 'slug', 'is_active', 'expires_at', 'created_at')
    list_filter = ('is_active', 'created_by')
    search_fields = ('name', 'slug', 'folder__name', 'created_by__email')
    readonly_fields = ('slug', 'created_at', 'updated_at')


@admin.register(UploadedFile)
class UploadedFileAdmin(admin.ModelAdmin):
    list_display = ('document', 'file_request', 'uploader_name', 'uploader_email', 'created_at')
    list_filter = ('file_request__created_by',)
    search_fields = ('document__name', 'uploader_name', 'uploader_email', 'file_request__name')
    readonly_fields = ('created_at',)
