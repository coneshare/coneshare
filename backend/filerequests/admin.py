from django.contrib import admin
from .models import FileRequest, SecurityThreatEvent, UploadedFile, UploadExportJob

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


@admin.register(SecurityThreatEvent)
class SecurityThreatEventAdmin(admin.ModelAdmin):
    list_display = ('event_type', 'severity', 'status', 'file_request', 'uploader_email', 'file_name', 'created_at')
    list_filter = ('event_type', 'severity', 'status', 'organization')
    search_fields = ('file_request__slug', 'uploader_email', 'file_name', 'scanner_message')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(UploadExportJob)
class UploadExportJobAdmin(admin.ModelAdmin):
    list_display = ('uploaded_file', 'connection', 'destination_folder_id', 'status', 'created_at')
    list_filter = ('status', 'connection__provider')
    search_fields = ('uploaded_file__document__name', 'error_message', 'provider_file_id')
    readonly_fields = ('created_at', 'updated_at')
