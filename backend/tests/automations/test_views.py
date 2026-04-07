import pytest
from unittest.mock import patch
from rest_framework import status

from core.models import Organization, User
from automations.models import AutomationDelivery, AutomationDestination, AutomationRule
from datarooms.models import Dataroom


pytestmark = pytest.mark.django_db


class TestAutomationDestinationViewSet:
    def test_create_destination_sets_org_and_creator(self, api_client, user):
        response = api_client.post(
            '/api/v1/automation-destinations/',
            {
                'name': 'Primary Webhook',
                'destination_type': 'webhook',
                'endpoint_url': 'https://example.com/webhook',
                'http_method': 'POST',
                'headers': {'X-Test': '1'},
                'signing_secret': 'secret-123',
                'is_active': True,
            },
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        destination = AutomationDestination.objects.get(id=response.data['id'])
        assert destination.organization == user.organization
        assert destination.created_by == user
        assert destination.destination_type == 'webhook'

    def test_list_destinations_is_scoped_to_request_user_org(self, api_client, user):
        other_org = Organization.objects.create(name='Other Org')
        other_user = User.objects.create_user(
            username='other-org-user@example.com',
            email='other-org-user@example.com',
            password='password',
            organization=other_org,
        )

        own_destination = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user,
            name='Own Destination',
            destination_type='webhook',
            endpoint_url='https://example.com/a',
        )
        AutomationDestination.objects.create(
            organization=other_org,
            created_by=other_user,
            name='Other Destination',
            destination_type='webhook',
            endpoint_url='https://example.com/b',
        )

        response = api_client.get('/api/v1/automation-destinations/')

        assert response.status_code == status.HTTP_200_OK
        ids = {item['id'] for item in response.data}
        assert own_destination.id in ids
        assert len(ids) == 1


class TestAutomationRuleViewSet:
    def test_create_share_link_scope_requires_share_link(self, api_client):
        response = api_client.post(
            '/api/v1/automations/',
            {
                'name': 'Missing Target Rule',
                'scope_type': 'share_link',
                'subscribed_events': ['link_viewed'],
                'actions': [{'type': 'notify_destination'}],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'requires a share_link' in str(response.data).lower()

    def test_create_dataroom_scope_requires_dataroom(self, api_client):
        response = api_client.post(
            '/api/v1/automations/',
            {
                'name': 'Missing Dataroom Rule',
                'scope_type': 'dataroom',
                'subscribed_events': ['dataroom_opened'],
                'actions': [{'type': 'notify_owner'}],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'requires a dataroom' in str(response.data).lower()

    def test_create_rule_rejects_destination_from_other_org(self, api_client, user):
        other_org = Organization.objects.create(name='Other Org')
        other_user = User.objects.create_user(
            username='x-org@example.com',
            email='x-org@example.com',
            password='password',
            organization=other_org,
        )
        foreign_destination = AutomationDestination.objects.create(
            organization=other_org,
            created_by=other_user,
            name='Foreign Destination',
            destination_type='webhook',
            endpoint_url='https://example.com/foreign',
        )

        response = api_client.post(
            '/api/v1/automations/',
            {
                'name': 'Cross Org Rule',
                'scope_type': 'global',
                'subscribed_events': ['link_viewed'],
                'actions': [{'type': 'notify_destination'}],
                'destinations': [str(foreign_destination.id)],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'outside your organization' in str(response.data)

    def test_create_rule_with_valid_dataroom_scope(self, api_client, user, organization):
        dataroom = Dataroom.objects.create(
            name='Automation Dataroom',
            organization=organization,
            created_by=user,
        )

        response = api_client.post(
            '/api/v1/automations/',
            {
                'name': 'Dataroom Rule',
                'scope_type': 'dataroom',
                'dataroom': str(dataroom.id),
                'subscribed_events': ['dataroom_opened'],
                'actions': [{'type': 'notify_owner'}],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        rule = AutomationRule.objects.get(id=response.data['id'])
        assert rule.organization == user.organization
        assert rule.created_by == user
        assert rule.dataroom == dataroom


class TestAutomationDeliveryViewSet:
    def test_list_deliveries_is_scoped_to_org(self, api_client, user, share_link):
        destination = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user,
            name='Own Delivery Destination',
            destination_type='webhook',
            endpoint_url='https://example.com/own',
        )
        rule = AutomationRule.objects.create(
            organization=user.organization,
            created_by=user,
            name='Own Rule',
            scope_type='share_link',
            share_link=share_link,
            subscribed_events=['link_viewed'],
            actions=[{'type': 'notify_destination'}],
        )
        own_delivery = AutomationDelivery.objects.create(
            organization=user.organization,
            rule=rule,
            destination=destination,
            event_type='link_viewed',
            payload={'share_link_id': str(share_link.id)},
        )

        other_org = Organization.objects.create(name='Other Org')
        other_user = User.objects.create_user(
            username='delivery-other@example.com',
            email='delivery-other@example.com',
            password='password',
            organization=other_org,
        )
        other_destination = AutomationDestination.objects.create(
            organization=other_org,
            created_by=other_user,
            name='Other Delivery Destination',
            destination_type='webhook',
            endpoint_url='https://example.com/other',
        )
        other_dataroom = Dataroom.objects.create(
            name='Other Dataroom',
            organization=other_org,
            created_by=other_user,
        )
        other_rule = AutomationRule.objects.create(
            organization=other_org,
            created_by=other_user,
            name='Other Rule',
            scope_type='dataroom',
            dataroom=other_dataroom,
            subscribed_events=['dataroom_opened'],
            actions=[{'type': 'notify_destination'}],
        )
        AutomationDelivery.objects.create(
            organization=other_org,
            rule=other_rule,
            destination=other_destination,
            event_type='dataroom_opened',
            payload={'dataroom_id': str(other_dataroom.id)},
        )

        response = api_client.get('/api/v1/automation-deliveries/')

        assert response.status_code == status.HTTP_200_OK
        ids = {item['id'] for item in response.data}
        assert own_delivery.id in ids
        assert len(ids) == 1

    def test_deliveries_endpoint_is_read_only(self, api_client):
        response = api_client.post(
            '/api/v1/automation-deliveries/',
            {
                'event_type': 'link_viewed',
                'status': 'pending',
            },
            format='json',
        )

        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    @patch('automations.views.deliver_automation_delivery_task.delay')
    def test_replay_endpoint_resets_and_queues_delivery(self, mock_delay, api_client, user, share_link):
        destination = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user,
            name='Replay Destination',
            destination_type='webhook',
            endpoint_url='https://example.com/replay',
        )
        rule = AutomationRule.objects.create(
            organization=user.organization,
            created_by=user,
            name='Replay Rule',
            scope_type='share_link',
            share_link=share_link,
            subscribed_events=['link_viewed'],
            actions=[{'type': 'notify_destination'}],
        )
        delivery = AutomationDelivery.objects.create(
            organization=user.organization,
            rule=rule,
            destination=destination,
            event_type='link_viewed',
            payload={'share_link_id': str(share_link.id)},
            status=AutomationDelivery.Status.DEAD_LETTER,
            response_code=500,
            response_body_excerpt='failed',
            attempt_count=3,
        )

        response = api_client.post(f'/api/v1/automation-deliveries/{delivery.id}/replay/')

        assert response.status_code == status.HTTP_202_ACCEPTED
        delivery.refresh_from_db()
        assert delivery.status == AutomationDelivery.Status.PENDING
        assert delivery.attempt_count == 0
        assert delivery.response_code is None
        assert delivery.response_body_excerpt == ''
        mock_delay.assert_called_once_with(str(delivery.id))
