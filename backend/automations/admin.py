from django.contrib import admin

from .models import (AutomationAssignment, AutomationDelivery, AutomationDestination,
                     AutomationRule)


@admin.register(AutomationDestination)
class AutomationDestinationAdmin(admin.ModelAdmin):
    list_display = ('name', 'destination_type', 'organization', 'created_by', 'is_active', 'created_at')
    list_filter = ('destination_type', 'is_active', 'organization')
    search_fields = ('name', 'endpoint_url')


@admin.register(AutomationRule)
class AutomationRuleAdmin(admin.ModelAdmin):
    list_display = ('name', 'scope_type', 'organization', 'created_by', 'is_active', 'created_at')
    list_filter = ('scope_type', 'is_active', 'organization')
    search_fields = ('name',)
    filter_horizontal = ('destinations',)


@admin.register(AutomationDelivery)
class AutomationDeliveryAdmin(admin.ModelAdmin):
    list_display = ('id', 'event_type', 'status', 'organization', 'rule', 'destination', 'attempt_count', 'created_at')
    list_filter = ('status', 'organization', 'event_type')
    search_fields = ('event_type', 'idempotency_key')


@admin.register(AutomationAssignment)
class AutomationAssignmentAdmin(admin.ModelAdmin):
    list_display = ('id', 'organization', 'assigned_user', 'assigned_by_rule', 'status', 'created_at')
    list_filter = ('status', 'organization')
    search_fields = ('assigned_user__email',)
