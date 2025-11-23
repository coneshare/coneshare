from django.contrib import admin

from .models import AppConfiguration


@admin.register(AppConfiguration)
class AppConfigurationAdmin(admin.ModelAdmin):
    list_display = ('key', 'value', 'description')
    search_fields = ('key', 'description')
    list_per_page = 50
