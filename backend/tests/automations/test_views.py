import pytest
from unittest.mock import patch
from rest_framework import status

from core.models import Organization, User
from automations.models import AutomationDelivery, AutomationDestination, AutomationRule
from datarooms.models import Dataroom


pytestmark = pytest.mark.django_db


class TestAutomationDestinationViewSet:
    def test_create_destination_by_admin_sets_org_and_creator(self, admin_api_client, admin_user):
        response = admin_api_client.post(
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
        assert destination.organization == admin_user.organization
        assert destination.created_by == admin_user
        assert destination.destination_type == 'webhook'

    def test_create_destination_by_non_admin_is_forbidden(self, api_client):
        response = api_client.post(
            '/api/v1/automation-destinations/',
            {
                'name': 'Unauthorized Webhook',
                'destination_type': 'webhook',
                'endpoint_url': 'https://example.com/webhook',
                'http_method': 'POST',
                'is_active': True,
            },
            format='json',
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_staff_without_admin_role_cannot_mutate_destination(self, organization):
        staff_member = User.objects.create_user(
            username='staff-member@example.com',
            email='staff-member@example.com',
            password='password',
            role='member',
            is_staff=True,
            organization=organization,
        )
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=staff_member)

        response = client.post(
            '/api/v1/automation-destinations/',
            {
                'name': 'Staff Created Webhook',
                'destination_type': 'webhook',
                'endpoint_url': 'https://example.com/webhook',
                'http_method': 'POST',
                'is_active': True,
            },
            format='json',
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_headers_hidden_for_non_admin_member(self, api_client, admin_api_client, user):
        destination = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user,
            name='Secret Header Webhook',
            destination_type='webhook',
            endpoint_url='https://example.com/webhook',
            headers={'Authorization': 'Bearer secret-token-123'},
        )

        # Non-admin member sees empty headers
        member_resp = api_client.get(f'/api/v1/automation-destinations/{destination.id}/')
        assert member_resp.status_code == status.HTTP_200_OK
        assert member_resp.data['headers'] == {}

        # Admin sees full headers
        admin_resp = admin_api_client.get(f'/api/v1/automation-destinations/{destination.id}/')
        assert admin_resp.status_code == status.HTTP_200_OK
        assert admin_resp.data['headers'] == {'Authorization': 'Bearer secret-token-123'}

    def test_create_email_destination_manually_fails(self, admin_api_client):
        response = admin_api_client.post(
            '/api/v1/automation-destinations/',
            {
                'name': 'My Email Destination',
                'destination_type': 'email',
                'endpoint_url': None,
                'http_method': 'POST',
                'is_active': True,
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Email destination type cannot be created manually' in str(response.data)

    def test_list_destinations_is_scoped_to_organization(self, api_client, user, user2):
        own_destination = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user,
            name='Own Destination',
            destination_type='webhook',
            endpoint_url='https://example.com/a',
        )
        other_user_destination = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user2,
            name='Other User Destination',
            destination_type='webhook',
            endpoint_url='https://example.com/b',
        )

        response = api_client.get('/api/v1/automation-destinations/')

        assert response.status_code == status.HTTP_200_OK
        ids = {item['id'] for item in response.data}
        assert own_destination.id in ids
        assert other_user_destination.id in ids
        assert len(ids) == 2

    def test_list_destinations_isolates_other_users_email_destinations(self, api_client, user, user2):
        """
        Verify that shared webhook destinations are visible organization-wide,
        but personal email destinations are only visible to their creator.
        """
        shared_webhook = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user2,
            name='Shared Team Webhook',
            destination_type='webhook',
            endpoint_url='https://example.com/webhook',
        )
        own_email_dest = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user,
            name=f'Default Email ({user.email})',
            destination_type='email',
            endpoint_url=None,
        )
        other_email_dest = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user2,
            name=f'Default Email ({user2.email})',
            destination_type='email',
            endpoint_url=None,
        )

        response = api_client.get('/api/v1/automation-destinations/')
        assert response.status_code == status.HTTP_200_OK

        ids = {item['id'] for item in response.data}
        assert shared_webhook.id in ids
        assert own_email_dest.id in ids
        assert other_email_dest.id not in ids
        assert len(ids) == 2

    def test_create_rule_cannot_attach_other_users_email_destination(self, api_client, user, user2):
        other_email_dest = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user2,
            name=f'Default Email ({user2.email})',
            destination_type='email',
            endpoint_url=None,
        )

        response = api_client.post(
            '/api/v1/automations/',
            {
                'name': 'Malicious Hijack Rule',
                'scope_type': 'global',
                'subscribed_events': ['document_viewed'],
                'actions': [{'type': 'notify_destination'}],
                'destinations': [other_email_dest.id],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Cannot attach email destinations belonging to another user' in str(response.data)

    def test_create_rule_allows_destination_in_same_org(self, api_client, user, user2):
        foreign_owned_destination = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user2,
            name='Admin Configured Destination',
            destination_type='webhook',
            endpoint_url='https://example.com/other-user',
        )

        response = api_client.post(
            '/api/v1/automations/',
            {
                'name': 'Cross User Rule',
                'scope_type': 'global',
                'subscribed_events': ['document_viewed'],
                'actions': [{'type': 'notify_destination'}],
                'destinations': [str(foreign_owned_destination.id)],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED

    def test_create_rule_rejects_destination_in_other_org(self, api_client, user):
        other_org = Organization.objects.create(name='Other Org')
        other_user = User.objects.create_user(
            username='other-user@example.com',
            email='other-user@example.com',
            password='password',
            organization=other_org,
        )
        foreign_org_dest = AutomationDestination.objects.create(
            organization=other_org,
            created_by=other_user,
            name='Foreign Org Dest',
            destination_type='webhook',
            endpoint_url='https://example.com/foreign',
        )

        response = api_client.post(
            '/api/v1/automations/',
            {
                'name': 'Cross Org Rule',
                'scope_type': 'global',
                'subscribed_events': ['document_viewed'],
                'actions': [{'type': 'notify_destination'}],
                'destinations': [str(foreign_org_dest.id)],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'outside your organization' in str(response.data).lower()

    def test_detail_destination_in_same_org_returns_200(self, api_client, user, user2):
        other_user_destination = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user2,
            name='Other User Destination',
            destination_type='webhook',
            endpoint_url='https://example.com/other-user',
        )

        response = api_client.get(f'/api/v1/automation-destinations/{other_user_destination.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(other_user_destination.id)

    def test_detail_destination_in_other_org_returns_404(self, api_client, user):
        other_org = Organization.objects.create(name='Other Org')
        other_user = User.objects.create_user(
            username='foreign@example.com',
            email='foreign@example.com',
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

        response = api_client.get(f'/api/v1/automation-destinations/{foreign_destination.id}/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_destination_by_non_admin_is_forbidden(self, api_client, user):
        destination = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user,
            name='Member Destination',
            destination_type='webhook',
            endpoint_url='https://example.com/dest',
        )

        response = api_client.patch(
            f'/api/v1/automation-destinations/{destination.id}/',
            {'name': 'Hacked'},
            format='json',
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_update_destination_by_admin_succeeds(self, admin_api_client, admin_user):
        destination = AutomationDestination.objects.create(
            organization=admin_user.organization,
            created_by=admin_user,
            name='Admin Destination',
            destination_type='webhook',
            endpoint_url='https://example.com/admin-dest',
        )

        response = admin_api_client.patch(
            f'/api/v1/automation-destinations/{destination.id}/',
            {'name': 'Updated Destination'},
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Updated Destination'

    def test_delete_destination_by_non_admin_is_forbidden(self, api_client, user):
        destination = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user,
            name='Member Destination',
            destination_type='webhook',
            endpoint_url='https://example.com/dest',
        )

        response = api_client.delete(f'/api/v1/automation-destinations/{destination.id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_list_destinations_hides_other_org(self, api_client, user):
        other_org = Organization.objects.create(name='Other Org')
        other_user = User.objects.create_user(
            username='other-org-user@example.com',
            email='other-org-user@example.com',
            password='password',
            organization=other_org,
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
        assert len(response.data) == 0

    def test_create_destination_allows_duplicate_name_in_same_org(self, admin_api_client):
        payload = {
            'name': 'Shared Name',
            'destination_type': 'webhook',
            'endpoint_url': 'https://example.com/webhook-a',
            'http_method': 'POST',
            'headers': {},
            'is_active': True,
        }
        first = admin_api_client.post('/api/v1/automation-destinations/', payload, format='json')
        assert first.status_code == status.HTTP_201_CREATED

        second_payload = {
            **payload,
            'endpoint_url': 'https://example.com/webhook-b',
        }
        second = admin_api_client.post('/api/v1/automation-destinations/', second_payload, format='json')
        assert second.status_code == status.HTTP_201_CREATED
        assert second.data['name'] == payload['name']


class TestAutomationRuleViewSet:
    def test_create_rule_requires_at_least_one_destination(self, api_client):
        response = api_client.post(
            '/api/v1/automations/',
            {
                'name': 'No Destination Rule',
                'scope_type': 'global',
                'subscribed_events': ['document_viewed'],
                'actions': [{'type': 'notify_destination'}],
                'destinations': [],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'at least one destination is required' in str(response.data).lower()

    def test_create_rule_allows_duplicate_name_in_same_org(self, api_client, user):
        destination = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user,
            name='Rule Destination',
            destination_type='webhook',
            endpoint_url='https://example.com/rule-destination',
        )
        payload = {
            'name': 'Shared Rule Name',
            'scope_type': 'global',
            'subscribed_events': ['document_viewed'],
            'actions': [{'type': 'notify_destination'}],
            'destinations': [str(destination.id)],
        }

        first = api_client.post('/api/v1/automations/', payload, format='json')
        assert first.status_code == status.HTTP_201_CREATED

        second = api_client.post('/api/v1/automations/', payload, format='json')
        assert second.status_code == status.HTTP_201_CREATED
        assert second.data['name'] == payload['name']

    def test_create_share_link_scope_requires_share_link(self, api_client):
        response = api_client.post(
            '/api/v1/automations/',
            {
                'name': 'Missing Target Rule',
                'scope_type': 'share_link',
                'subscribed_events': ['document_viewed'],
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
                'subscribed_events': ['document_viewed'],
                'actions': [{'type': 'notify_destination'}],
                'destinations': [str(foreign_destination.id)],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'outside your organization' in str(response.data)

    def test_create_rule_with_valid_dataroom_scope(self, api_client, user, organization):
        destination = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user,
            name='Dataroom Destination',
            destination_type='webhook',
            endpoint_url='https://example.com/dataroom',
        )
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
                'destinations': [str(destination.id)],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        rule = AutomationRule.objects.get(id=response.data['id'])
        assert rule.organization == user.organization
        assert rule.created_by == user
        assert rule.dataroom == dataroom

    def test_create_file_request_uploaded_rule_rejects_non_global_scope(self, api_client, user, share_link):
        destination = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user,
            name='FR Destination',
            destination_type='webhook',
            endpoint_url='https://example.com/fr',
        )

        response = api_client.post(
            '/api/v1/automations/',
            {
                'name': 'Invalid FR Scope Rule',
                'scope_type': 'share_link',
                'share_link': str(share_link.id),
                'subscribed_events': ['file_request_uploaded'],
                'actions': [{'type': 'notify_destination'}],
                'destinations': [str(destination.id)],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'only supported for global scope' in str(response.data).lower()

    def test_create_file_request_security_rule_rejects_non_global_scope(self, api_client, user, share_link):
        destination = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user,
            name='FR Security Destination',
            destination_type='webhook',
            endpoint_url='https://example.com/fr-security',
        )

        response = api_client.post(
            '/api/v1/automations/',
            {
                'name': 'Invalid FR Security Scope Rule',
                'scope_type': 'share_link',
                'share_link': str(share_link.id),
                'subscribed_events': ['file_request_malware_detected'],
                'actions': [{'type': 'notify_destination'}],
                'destinations': [str(destination.id)],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'only supported for global scope' in str(response.data).lower()


class TestAutomationDeliveryViewSet:
    def test_list_deliveries_is_scoped_to_request_user(self, api_client, user, user2, share_link):
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
            subscribed_events=['document_viewed'],
            actions=[{'type': 'notify_destination'}],
        )
        own_delivery = AutomationDelivery.objects.create(
            organization=user.organization,
            rule=rule,
            destination=destination,
            event_type='document_viewed',
            payload={'share_link_id': str(share_link.id)},
        )

        other_destination = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user2,
            name='Other Delivery Destination',
            destination_type='webhook',
            endpoint_url='https://example.com/other',
        )
        other_dataroom = Dataroom.objects.create(
            name='Other Dataroom',
            organization=user.organization,
            created_by=user2,
        )
        other_rule = AutomationRule.objects.create(
            organization=user.organization,
            created_by=user2,
            name='Other Rule',
            scope_type='dataroom',
            dataroom=other_dataroom,
            subscribed_events=['dataroom_opened'],
            actions=[{'type': 'notify_destination'}],
        )
        AutomationDelivery.objects.create(
            organization=user.organization,
            rule=other_rule,
            destination=other_destination,
            event_type='dataroom_opened',
            payload={'dataroom_id': str(other_dataroom.id)},
        )

        response = api_client.get('/api/v1/automation-deliveries/')

        assert response.status_code == status.HTTP_200_OK
        ids = {item['id'] for item in response.data['results']}
        assert own_delivery.id in ids
        assert len(ids) == 1

    def test_deliveries_endpoint_is_read_only(self, api_client):
        response = api_client.post(
            '/api/v1/automation-deliveries/',
            {
                'event_type': 'document_viewed',
                'status': 'pending',
            },
            format='json',
        )

        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_list_deliveries_supports_destination_filter(self, api_client, user, share_link):
        destination_a = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user,
            name='Destination A',
            destination_type='webhook',
            endpoint_url='https://example.com/a',
        )
        destination_b = AutomationDestination.objects.create(
            organization=user.organization,
            created_by=user,
            name='Destination B',
            destination_type='webhook',
            endpoint_url='https://example.com/b',
        )
        rule = AutomationRule.objects.create(
            organization=user.organization,
            created_by=user,
            name='Rule for Filter',
            scope_type='share_link',
            share_link=share_link,
            subscribed_events=['document_viewed'],
            actions=[{'type': 'notify_destination'}],
        )
        delivery_a = AutomationDelivery.objects.create(
            organization=user.organization,
            rule=rule,
            destination=destination_a,
            event_type='document_viewed',
            payload={'share_link_id': str(share_link.id)},
        )
        AutomationDelivery.objects.create(
            organization=user.organization,
            rule=rule,
            destination=destination_b,
            event_type='document_viewed',
            payload={'share_link_id': str(share_link.id)},
        )

        response = api_client.get(f'/api/v1/automation-deliveries/?destination_id={destination_a.id}')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 1
        assert response.data['results'][0]['id'] == delivery_a.id

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
            subscribed_events=['document_viewed'],
            actions=[{'type': 'notify_destination'}],
        )
        delivery = AutomationDelivery.objects.create(
            organization=user.organization,
            rule=rule,
            destination=destination,
            event_type='document_viewed',
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


class TestAutomationRuleScopeAuthorization:
    """Tests for authorization boundaries when attaching automation rules to share links and datarooms."""

    def test_member_cannot_target_other_users_document_share_link(self, api_client, user, user2, document, organization):
        from sharelinks.models import ShareLink
        link = ShareLink.objects.create(document=document, created_by=user, name="User1 Link")

        dest2 = AutomationDestination.objects.create(
            organization=organization,
            created_by=user2,
            name="Dest2",
            destination_type="webhook",
            endpoint_url="https://example.com/dest2",
        )

        api_client.force_authenticate(user=user2)
        resp = api_client.post(
            '/api/v1/automations/',
            {
                'name': 'Scoped Link Rule',
                'scope_type': 'share_link',
                'share_link': str(link.id),
                'destinations': [str(dest2.id)],
                'subscribed_events': ['document_viewed'],
                'actions': [{'type': 'notify_destination'}],
            },
            format='json',
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_member_cannot_target_other_users_private_dataroom(self, api_client, user, user2, organization):
        dataroom = Dataroom.objects.create(name="Private Room", organization=organization, created_by=user)
        dest2 = AutomationDestination.objects.create(
            organization=organization,
            created_by=user2,
            name="Dest2",
            destination_type="webhook",
            endpoint_url="https://example.com/dest2",
        )

        api_client.force_authenticate(user=user2)
        resp = api_client.post(
            '/api/v1/automations/',
            {
                'name': 'Scoped Room Rule',
                'scope_type': 'dataroom',
                'dataroom': str(dataroom.id),
                'destinations': [str(dest2.id)],
                'subscribed_events': ['dataroom_opened'],
                'actions': [{'type': 'notify_destination'}],
            },
            format='json',
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_collaborator_can_target_collaborated_dataroom_and_link(self, api_client, user, user2, organization):
        from datarooms.models import DataroomCollaborator
        from sharelinks.models import ShareLink

        dataroom = Dataroom.objects.create(name="Collab Room", organization=organization, created_by=user)
        DataroomCollaborator.objects.create(dataroom=dataroom, user=user2, invited_by=user)
        link = ShareLink.objects.create(dataroom=dataroom, created_by=user, name="Dataroom Link")

        dest2 = AutomationDestination.objects.create(
            organization=organization,
            created_by=user2,
            name="Dest2",
            destination_type="webhook",
            endpoint_url="https://example.com/dest2",
        )

        api_client.force_authenticate(user=user2)

        # 1. Target dataroom
        resp_room = api_client.post(
            '/api/v1/automations/',
            {
                'name': 'Collab Room Rule',
                'scope_type': 'dataroom',
                'dataroom': str(dataroom.id),
                'destinations': [str(dest2.id)],
                'subscribed_events': ['dataroom_opened'],
                'actions': [{'type': 'notify_destination'}],
            },
            format='json',
        )
        assert resp_room.status_code == status.HTTP_201_CREATED

        # 2. Target dataroom link
        resp_link = api_client.post(
            '/api/v1/automations/',
            {
                'name': 'Collab Link Rule',
                'scope_type': 'share_link',
                'share_link': str(link.id),
                'destinations': [str(dest2.id)],
                'subscribed_events': ['document_viewed'],
                'actions': [{'type': 'notify_destination'}],
            },
            format='json',
        )
        assert resp_link.status_code == status.HTTP_201_CREATED

    def test_admin_can_target_any_link_or_dataroom_in_org(self, api_client, user, admin_user, document, organization):
        from sharelinks.models import ShareLink

        link = ShareLink.objects.create(document=document, created_by=user, name="User Link")
        dataroom = Dataroom.objects.create(name="User Room", organization=organization, created_by=user)

        admin_dest = AutomationDestination.objects.create(
            organization=organization,
            created_by=admin_user,
            name="Admin Dest",
            destination_type="webhook",
            endpoint_url="https://example.com/admin-dest",
        )

        api_client.force_authenticate(user=admin_user)

        resp_link = api_client.post(
            '/api/v1/automations/',
            {
                'name': 'Admin Link Rule',
                'scope_type': 'share_link',
                'share_link': str(link.id),
                'destinations': [str(admin_dest.id)],
                'subscribed_events': ['document_viewed'],
                'actions': [{'type': 'notify_destination'}],
            },
            format='json',
        )
        assert resp_link.status_code == status.HTTP_201_CREATED

        resp_room = api_client.post(
            '/api/v1/automations/',
            {
                'name': 'Admin Room Rule',
                'scope_type': 'dataroom',
                'dataroom': str(dataroom.id),
                'destinations': [str(admin_dest.id)],
                'subscribed_events': ['dataroom_opened'],
                'actions': [{'type': 'notify_destination'}],
            },
            format='json',
        )
        assert resp_room.status_code == status.HTTP_201_CREATED

