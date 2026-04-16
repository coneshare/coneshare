import pytest
from unittest.mock import patch
from rest_framework import status
from django.utils import timezone

from datarooms.models import Dataroom, DataroomDocument
from sharelinks.models import ShareLink, ShareLinkDataroomSetting, ViewSession
from datarooms.models import DataroomFolder


pytestmark = pytest.mark.django_db


class TestEventDispatchIntegration:
    @patch('sharelinks.views.dispatch_automation_event_task.delay')
    def test_create_view_session_dispatches_document_event(self, mock_delay, public_client, share_link):
        response = public_client.post('/api/v1/view-sessions/', {'share_link': str(share_link.id)}, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        dispatched = {call.args[0]: call.args[1] for call in mock_delay.call_args_list}
        assert 'document_viewed' in dispatched
        assert dispatched['document_viewed']['document_name'] == share_link.document.name
        assert dispatched['document_viewed']['event_datetime'] is not None
        assert 'visitor_ip' in dispatched['document_viewed']
        assert 'visitor_country' in dispatched['document_viewed']
        assert 'visitor_city' in dispatched['document_viewed']
        assert 'visitor_latitude' in dispatched['document_viewed']
        assert 'visitor_longitude' in dispatched['document_viewed']

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
        dispatched = {call.args[0]: call.args[1] for call in mock_delay.call_args_list}
        assert 'dataroom_opened' in dispatched
        assert dispatched['dataroom_opened']['dataroom_name'] == dataroom.name

    @patch('sharelinks.views.dispatch_automation_event_task.delay')
    def test_record_download_dispatches_document_downloaded(self, mock_delay, public_client, share_link):
        view_session = ViewSession.objects.create(share_link=share_link)

        response = public_client.post(f'/api/v1/view-sessions/{view_session.id}/record-download/')

        assert response.status_code == status.HTTP_200_OK
        # First positional arg is event_type
        dispatched_event_types = [call.args[0] for call in mock_delay.call_args_list]
        assert 'document_downloaded' in dispatched_event_types

    @patch('sharelinks.views.dispatch_automation_event_task.delay')
    def test_record_download_for_dataroom_document_includes_viewer_and_document_name(
        self,
        mock_delay,
        public_client,
        user,
        organization,
        document,
    ):
        dataroom = Dataroom.objects.create(
            name='Record Download Dataroom',
            organization=organization,
            created_by=user,
        )
        DataroomDocument.objects.create(
            dataroom=dataroom,
            document=document,
            name='Visible Dataroom Doc',
        )
        link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user,
            name='Dataroom Link',
        )
        view_session = ViewSession.objects.create(share_link=link, viewer_email='b@b.com')

        response = public_client.post(
            f'/api/v1/view-sessions/{view_session.id}/record-download/',
            {'document_id': str(document.id)},
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        matched = [call for call in mock_delay.call_args_list if call.args[0] == 'document_downloaded']
        assert matched
        payload = matched[0].args[1]
        assert payload['viewer_email'] == 'b@b.com'
        assert payload['document_name'] == document.name
        assert payload['event_datetime'] is not None
        assert 'visitor_ip' in payload
        assert 'visitor_country' in payload
        assert 'visitor_city' in payload
        assert 'visitor_latitude' in payload
        assert 'visitor_longitude' in payload

    @patch('sharelinks.views.dispatch_automation_event_task.delay')
    def test_dataroom_document_open_dispatches_document_viewed(
        self,
        mock_delay,
        public_client,
        user,
        organization,
        document,
    ):
        dataroom = Dataroom.objects.create(
            name='Dispatch Dataroom For Doc View',
            organization=organization,
            created_by=user,
        )
        ddoc = DataroomDocument.objects.create(
            dataroom=dataroom,
            document=document,
            name='Dataroom Doc',
        )
        link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user,
            name='Dataroom Link',
        )

        response = public_client.get(f'/api/v1/links/{link.slug}/view-data/?document_id={document.id}')

        assert response.status_code == status.HTTP_200_OK
        event_types = [call.args[0] for call in mock_delay.call_args_list]
        assert 'document_viewed' in event_types

    @patch('sharelinks.views.dispatch_automation_event_task.delay')
    def test_dataroom_download_file_with_view_session_dispatches_document_downloaded(
        self,
        mock_delay,
        public_client,
        user,
        organization,
        image_document_with_content,
    ):
        dataroom = Dataroom.objects.create(
            name='Dispatch Dataroom For Download',
            organization=organization,
            created_by=user,
        )
        DataroomDocument.objects.create(
            dataroom=dataroom,
            document=image_document_with_content,
            name='Downloadable Doc',
        )
        link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user,
            name='Download Link',
        )
        view_session = ViewSession.objects.create(share_link=link)

        response = public_client.get(
            f'/api/v1/links/{link.slug}/download-file/?document_id={image_document_with_content.id}&view_session_id={view_session.id}'
        )

        assert response.status_code in {status.HTTP_200_OK, status.HTTP_302_FOUND}
        event_types = [call.args[0] for call in mock_delay.call_args_list]
        assert 'document_downloaded' in event_types

    @patch('sharelinks.views.dispatch_automation_event_task.delay')
    def test_dataroom_download_file_dispatches_even_if_session_already_marked_downloaded(
        self,
        mock_delay,
        public_client,
        user,
        organization,
        image_document_with_content,
    ):
        dataroom = Dataroom.objects.create(
            name='Dispatch Dataroom For Repeated Download',
            organization=organization,
            created_by=user,
        )
        DataroomDocument.objects.create(
            dataroom=dataroom,
            document=image_document_with_content,
            name='Downloadable Doc',
        )
        link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user,
            name='Download Link',
        )
        view_session = ViewSession.objects.create(
            share_link=link,
            downloaded_at=timezone.now(),
        )

        response = public_client.get(
            f'/api/v1/links/{link.slug}/download-file/?document_id={image_document_with_content.id}&view_session_id={view_session.id}'
        )

        assert response.status_code in {status.HTTP_200_OK, status.HTTP_302_FOUND}
        event_types = [call.args[0] for call in mock_delay.call_args_list]
        assert 'document_downloaded' in event_types

    @patch('sharelinks.views.dispatch_automation_event_task.delay')
    def test_dataroom_download_folder_dispatches_document_downloaded(
        self,
        mock_delay,
        public_client,
        user,
        organization,
    ):
        dataroom = Dataroom.objects.create(
            name='Dispatch Dataroom For Folder Download',
            organization=organization,
            created_by=user,
        )
        link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user,
            name='Folder Download Link',
        )
        root_folder = DataroomFolder.objects.create(
            dataroom=dataroom,
            name='Root Folder',
            parent=None,
        )

        ShareLinkDataroomSetting.objects.update_or_create(
            share_link=link,
            dataroom_folder=root_folder,
            defaults={
                'is_visible': True,
                'allow_download': True,
                'enable_watermark': False,
            },
        )
        view_session = ViewSession.objects.create(share_link=link, viewer_email='b@b.com')

        response = public_client.get(
            f'/api/v1/links/{link.slug}/download-folder/{root_folder.id}/?view_session_id={view_session.id}'
        )

        assert response.status_code == status.HTTP_200_OK
        matched = [call for call in mock_delay.call_args_list if call.args[0] == 'document_downloaded']
        assert matched
        payload = matched[0].args[1]
        assert payload['viewer_email'] == 'b@b.com'
        assert payload['dataroom_folder_id'] == str(root_folder.id)
        assert payload['dataroom_folder_name'] == root_folder.name

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
