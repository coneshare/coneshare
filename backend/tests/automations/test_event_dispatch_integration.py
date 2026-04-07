import pytest
from unittest.mock import patch
from rest_framework import status

from datarooms.models import Dataroom
from sharelinks.models import ShareLink, ViewSession


pytestmark = pytest.mark.django_db


class TestEventDispatchIntegration:
    @patch('sharelinks.views.dispatch_automation_event_task.delay')
    def test_create_view_session_dispatches_link_and_document_events(self, mock_delay, public_client, share_link):
        response = public_client.post('/api/v1/view-sessions/', {'share_link': str(share_link.id)}, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        event_types = [call.args[0] for call in mock_delay.call_args_list]
        assert 'link_viewed' in event_types
        assert 'document_viewed' in event_types

    @patch('sharelinks.views.dispatch_automation_event_task.delay')
    def test_create_view_session_dispatches_dataroom_opened_for_dataroom_link(
        self,
        mock_delay,
        public_client,
        user,
        organization,
    ):
        dataroom = Dataroom.objects.create(
            name='Dispatch Dataroom',
            organization=organization,
            created_by=user,
        )
        link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user,
            name='Dataroom Link',
        )

        response = public_client.post('/api/v1/view-sessions/', {'share_link': str(link.id)}, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        event_types = [call.args[0] for call in mock_delay.call_args_list]
        assert 'link_viewed' in event_types
        assert 'dataroom_opened' in event_types

    @patch('sharelinks.views.dispatch_automation_event_task.delay')
    def test_record_download_dispatches_document_downloaded(self, mock_delay, public_client, share_link):
        view_session = ViewSession.objects.create(share_link=share_link)

        response = public_client.post(f'/api/v1/view-sessions/{view_session.id}/record-download/')

        assert response.status_code == status.HTTP_200_OK
        # First positional arg is event_type
        dispatched_event_types = [call.args[0] for call in mock_delay.call_args_list]
        assert 'document_downloaded' in dispatched_event_types

    @patch('sharelinks.views.dispatch_automation_event_task.delay')
    def test_request_access_dispatches_email_identified_when_no_verification(
        self,
        mock_delay,
        public_client,
        share_link,
    ):
        share_link.requires_email = True
        share_link.requires_email_verification = False
        share_link.save(update_fields=['requires_email', 'requires_email_verification'])

        response = public_client.post(
            f'/api/v1/links/{share_link.slug}/request-access/',
            {'email': 'buyer@example.com'},
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        dispatched_event_types = [call.args[0] for call in mock_delay.call_args_list]
        assert 'email_identified' in dispatched_event_types
