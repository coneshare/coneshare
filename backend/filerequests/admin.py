from django.contrib import admin
from .models import FileRequest

@admin.register(FileRequest)
class FileRequestAdmin(admin.ModelAdmin):
    list_display = ('name', 'folder', 'created_by', 'slug', 'is_active', 'expires_at', 'created_at')
    list_filter = ('is_active', 'created_by')
    search_fields = ('name', 'slug', 'folder__name', 'created_by__email')
    readonly_fields = ('slug', 'created_at', 'updated_at')
