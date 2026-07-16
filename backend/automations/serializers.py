from rest_framework import serializers

from .models import (AutomationAssignment, AutomationDelivery, AutomationDestination,
                     AutomationRule)

ALLOWED_AUTOMATION_EVENTS = {
    'document_viewed',
    'dataroom_opened',
    'document_downloaded',
    'email_identified',
    'qna_thread_created',
    'qna_message_created',
    'qna_thread_closed',
    'qna_thread_reopened',
    'file_request_uploaded',
    'file_request_malware_detected',
    'file_request_scan_failed',
}


class AutomationDestinationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AutomationDestination
        fields = [
            'id', 'organization', 'created_by', 'name', 'destination_type', 'endpoint_url',
            'http_method', 'headers', 'signing_secret', 'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organization', 'created_by', 'created_at', 'updated_at']
        extra_kwargs = {
            'signing_secret': {'write_only': True, 'required': False, 'allow_blank': True},
        }

    def validate_destination_type(self, value):
        if value == AutomationDestination.DestinationType.EMAIL:
            raise serializers.ValidationError('Email destination type cannot be created manually.')
        return value

    def validate_endpoint_url(self, value):
        # Allow None for email, but require valid URL for others
        if value is None or value == '':
            return value
        if not (value.startswith('https://') or value.startswith('http://')):
            raise serializers.ValidationError('Endpoint URL must start with http:// or https://')
        return value


class AutomationRuleSerializer(serializers.ModelSerializer):
    destinations = serializers.PrimaryKeyRelatedField(
        queryset=AutomationDestination.objects.all(), many=True, required=False
    )

    class Meta:
        model = AutomationRule
        fields = [
            'id', 'organization', 'created_by', 'name', 'is_active', 'scope_type',
            'share_link', 'dataroom', 'subscribed_events', 'actions', 'destinations',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organization', 'created_by', 'created_at', 'updated_at']

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        org = getattr(user, 'organization', None)

        scope_type = attrs.get('scope_type', getattr(self.instance, 'scope_type', None))
        share_link = attrs.get('share_link', getattr(self.instance, 'share_link', None))
        dataroom = attrs.get('dataroom', getattr(self.instance, 'dataroom', None))

        if scope_type == AutomationRule.ScopeType.GLOBAL and (share_link or dataroom):
            raise serializers.ValidationError('Global scope cannot target a share link or dataroom.')
        if scope_type == AutomationRule.ScopeType.SHARE_LINK and not share_link:
            raise serializers.ValidationError('Share link scope requires a share_link.')
        if scope_type == AutomationRule.ScopeType.SHARE_LINK and dataroom:
            raise serializers.ValidationError('Share link scope cannot include dataroom.')
        if scope_type == AutomationRule.ScopeType.DATAROOM and not dataroom:
            raise serializers.ValidationError('Dataroom scope requires a dataroom.')
        if scope_type == AutomationRule.ScopeType.DATAROOM and share_link:
            raise serializers.ValidationError('Dataroom scope cannot include share_link.')

        if share_link and org and share_link.created_by.organization_id != org.id:
            raise serializers.ValidationError('share_link must belong to your organization.')
        if dataroom and org and dataroom.organization_id != org.id:
            raise serializers.ValidationError('dataroom must belong to your organization.')

        destinations = attrs.get('destinations')
        if destinations is not None and org:
            invalid = [d.id for d in destinations if d.organization_id != org.id]
            if invalid:
                raise serializers.ValidationError(f'destinations contain ids outside your organization: {invalid}')
            if user:
                not_owned = [d.id for d in destinations if d.created_by_id != user.id]
                if not_owned:
                    raise serializers.ValidationError(f'destinations must be owned by you: {not_owned}')

        # Require at least one destination for every automation rule.
        if self.instance:
            resulting_destinations = destinations if destinations is not None else self.instance.destinations.all()
        else:
            resulting_destinations = destinations if destinations is not None else []

        if not resulting_destinations:
            raise serializers.ValidationError('At least one destination is required.')

        subscribed_events = attrs.get('subscribed_events', getattr(self.instance, 'subscribed_events', []))
        allowed_events = ALLOWED_AUTOMATION_EVENTS
        if not isinstance(subscribed_events, list) or not subscribed_events:
            raise serializers.ValidationError('At least one subscribed event is required.')
        invalid_events = [e for e in subscribed_events if e not in allowed_events]
        if invalid_events:
            raise serializers.ValidationError(
                f'Unsupported subscribed events: {invalid_events}. Allowed events: {sorted(allowed_events)}'
            )
        file_request_global_only_events = {
            'file_request_uploaded',
            'file_request_malware_detected',
            'file_request_scan_failed',
        }
        if any(event in subscribed_events for event in file_request_global_only_events) and scope_type != AutomationRule.ScopeType.GLOBAL:
            raise serializers.ValidationError(
                'file_request_uploaded, file_request_malware_detected, and file_request_scan_failed are only supported for global scope rules.'
            )

        return attrs


class AutomationDeliverySerializer(serializers.ModelSerializer):
    class Meta:
        model = AutomationDelivery
        fields = [
            'id', 'organization', 'rule', 'destination', 'event_type', 'payload', 'status',
            'response_code', 'response_body_excerpt', 'attempt_count', 'next_retry_at',
            'delivered_at', 'idempotency_key', 'created_at', 'updated_at'
        ]
        read_only_fields = fields


class AutomationAssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = AutomationAssignment
        fields = [
            'id', 'organization', 'delivery', 'assigned_user', 'assigned_by_rule', 'status',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organization', 'created_at', 'updated_at']
