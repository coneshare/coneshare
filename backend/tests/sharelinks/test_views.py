import pytest
from unittest.mock import patch, mock_open, MagicMock
from datetime import timedelta
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from django.utils.text import get_valid_filename
from rest_framework import status

from datarooms.models import Dataroom, DataroomDocument, DataroomFolder
from documents.models import (Document, DocumentPage, DocumentVersion)
from sharelinks.models import (DataroomVisit, EmailVerificationToken, PageView,
                               PreviewSession, ShareLink,
                               ShareLinkDataroomSetting, ViewSession)
import zipfile
from io import BytesIO
try:
    from PIL import Image
except ImportError:
    Image = None

User = get_user_model()

@pytest.fixture
def document_factory(user, organization):
    def _create_document(**kwargs):
        defaults = {
            "created_by": user,
            "organization": organization,
            "status": "ready",
        }
        defaults.update(kwargs)
        doc = Document.objects.create(**defaults)
        DocumentVersion.objects.create(document=doc, version_number=1, is_primary=True, original_storage_key="path/to/original.pdf")
        return doc
    return _create_document


pytestmark = pytest.mark.django_db


@pytest.mark.django_db
class TestRecordPageView:
    def test_record_page_view_success(self, public_client, share_link):
        """Test that a page view is recorded successfully."""
        # 1. Create a View session
        view_session = ViewSession.objects.create(share_link=share_link, duration_seconds=10)
        assert PageView.objects.count() == 0

        # 2. Send tracking data
        data = {
            'view_session': view_session.id,
            'page_number': 1,
            'duration_seconds': 5
        }
        response = public_client.post('/api/v1/page-views/record/', data)

        # 3. Assertions
        assert response.status_code == status.HTTP_200_OK
        assert PageView.objects.count() == 1

        page_view = PageView.objects.first()
        assert page_view.view_session == view_session
        assert page_view.page_number == 1
        assert page_view.duration_seconds == 5

        view_session.refresh_from_db()
        assert view_session.duration_seconds == 15  # 10 + 5

    def test_record_page_view_invalid_view_id(self, public_client):
        """Test that recording a page view with an invalid view ID fails."""
        data = {
            'view_session': '01J4Z7YJ8ZJ4Z7YJ8ZJ4Z7YJ8Z',  # A valid but non-existent ULID
            'page_number': 1,
            'duration_seconds': 5
        }
        response = public_client.post('/api/v1/page-views/record/', data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        # It's a validation error because the view does not exist.
        assert 'view_session' in response.data
        assert PageView.objects.count() == 0

    def test_record_page_view_missing_data(self, public_client, share_link):
        """Test that recording a page view with missing data fails."""
        view_session = ViewSession.objects.create(share_link=share_link)
        data = {
            'view_session': view_session.id,
            # 'page_number' is missing
            'duration_seconds': 5
        }
        response = public_client.post('/api/v1/page-views/record/', data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'page_number' in response.data
        assert PageView.objects.count() == 0

    def test_record_page_view_updates_completion_rate(self, public_client, document, share_link):
        """
        Test that recording page views correctly updates the parent ViewSession's
        completion rate.
        """
        # Set the total number of pages on the document
        document.num_pages = 4
        document.save()

        view_session = ViewSession.objects.create(share_link=share_link)
        assert view_session.completion_rate == 0.0

        # View page 1
        public_client.post('/api/v1/page-views/record/', {
            'view_session': view_session.id, 'page_number': 1, 'duration_seconds': 5
        })
        view_session.refresh_from_db()
        assert view_session.completion_rate == 0.25  # 1 of 4 pages viewed

        # View page 2
        public_client.post('/api/v1/page-views/record/', {
            'view_session': view_session.id, 'page_number': 2, 'duration_seconds': 5
        })
        view_session.refresh_from_db()
        assert view_session.completion_rate == 0.50  # 2 of 4 pages viewed

        # View page 1 again (should not increase completion rate)
        public_client.post('/api/v1/page-views/record/', {
            'view_session': view_session.id, 'page_number': 1, 'duration_seconds': 10
        })
        view_session.refresh_from_db()
        assert view_session.completion_rate == 0.50  # Still 2 unique pages viewed

        # View page 4
        public_client.post('/api/v1/page-views/record/', {
            'view_session': view_session.id, 'page_number': 4, 'duration_seconds': 8
        })
        view_session.refresh_from_db()
        assert view_session.completion_rate == 0.75  # 3 of 4 pages viewed


@pytest.mark.django_db
class TestViewSessionViewSet:
    @patch('sharelinks.views.settings.GEOIP')
    def test_create_view_records_ip_and_user_agent(self, mock_geoip, public_client, share_link):
        """Test that creating a view session records the IP, User-Agent, and location."""
        # Mock the GeoIP2 lookup
        mock_city_data = {
            'city': 'Mountain View',
            'country_name': 'United States',
            'latitude': 37.422,
            'longitude': -122.084,
        }
        mock_geoip.city.return_value = mock_city_data
        assert ViewSession.objects.count() == 0

        user_agent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36"

        response = public_client.post(
            '/api/v1/view-sessions/',
            {'share_link': share_link.id},
            HTTP_USER_AGENT=user_agent,
            REMOTE_ADDR='98.137.11.155'  # Example public IP for Yahoo
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert ViewSession.objects.count() == 1

        view_session = ViewSession.objects.first()
        assert view_session.share_link == share_link
        assert view_session.ip_address == '98.137.11.155'
        assert view_session.user_agent == user_agent
        assert view_session.city == 'Mountain View'
        assert view_session.country == 'United States'
        assert view_session.latitude == 37.422
        assert view_session.longitude == -122.084

    @patch('sharelinks.views.settings.GEOIP')
    def test_create_view_records_ip_from_x_real_ip(self, mock_geoip, public_client, share_link):
        """Test that X-Real-IP header is prioritized for IP address if present."""
        mock_geoip.city.return_value = {}  # Mock to avoid errors, not testing location here

        real_ip = "1.2.3.4"
        proxy_ip = "98.137.11.155"
        spoofed_xff = "5.6.7.8"

        response = public_client.post(
            '/api/v1/view-sessions/',
            {'share_link': share_link.id},
            HTTP_X_REAL_IP=real_ip,
            HTTP_X_FORWARDED_FOR=f'{spoofed_xff}, {proxy_ip}',
            REMOTE_ADDR=proxy_ip
        )

        assert response.status_code == status.HTTP_201_CREATED
        view_session = ViewSession.objects.first()
        assert view_session.ip_address == real_ip

    def test_record_download(self, public_client, share_link):
        """Test that a download can be recorded for a view session."""
        # 1. Create a View session
        view_session = ViewSession.objects.create(share_link=share_link)
        assert view_session.downloaded_at is None

        # 2. Record the download
        url = f'/api/v1/view-sessions/{view_session.id}/record-download/'
        response = public_client.post(url)
        assert response.status_code == status.HTTP_200_OK

        # 3. Verify the timestamp is set
        view_session.refresh_from_db()
        assert view_session.downloaded_at is not None
        first_download_time = view_session.downloaded_at

        # 4. Try to record again - timestamp should not change
        response_2 = public_client.post(url)
        assert response_2.status_code == status.HTTP_200_OK
        view_session.refresh_from_db()
        assert view_session.downloaded_at == first_download_time

    def test_create_view_session_for_dataroom_link(self, public_client, dataroom, user):
        """Test that creating a view session for a dataroom link works."""
        link = ShareLink.objects.create(dataroom=dataroom, created_by=user)
        assert ViewSession.objects.count() == 0

        response = public_client.post(
            '/api/v1/view-sessions/',
            {'share_link': link.id},
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert ViewSession.objects.count() == 1
        vs = ViewSession.objects.first()
        assert vs.share_link == link

    def test_record_download_for_non_existent_session(self, public_client):
        """Test that recording a download for a non-existent session returns 404."""
        non_existent_id = '01J4Z7YJ8ZJ4Z7YJ8ZJ4Z7YJ8Z'
        url = f'/api/v1/view-sessions/{non_existent_id}/record-download/'
        response = public_client.post(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_create_view_session_for_authenticated_user_records_email(self, api_client, share_link, user):
        """
        Test that creating a view session as a logged-in user records their email,
        even if the link does not require an email.
        """
        assert ViewSession.objects.count() == 0

        response = api_client.post(
            '/api/v1/view-sessions/',
            {'share_link': share_link.id},
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert ViewSession.objects.count() == 1
        vs = ViewSession.objects.first()
        assert vs.share_link == share_link
        assert vs.viewer_email == user.email

    @patch('sharelinks.views.send_view_notification_email_task.delay')
    def test_create_view_session_triggers_email_notification(self, mock_task_delay, public_client, share_link):
        """
        Test that creating a view session for a link with notifications enabled
        triggers the email notification task.
        """
        share_link.receive_email_notification = True
        share_link.save()

        response = public_client.post(
            '/api/v1/view-sessions/',
            {'share_link': share_link.id},
        )
        
        assert response.status_code == status.HTTP_201_CREATED
        vs = ViewSession.objects.first()
        assert vs is not None

        mock_task_delay.assert_called_once_with(str(vs.id))

    @patch('sharelinks.views.send_view_notification_email_task.delay')
    def test_create_view_session_does_not_trigger_email_notification(self, mock_task_delay, public_client, share_link):
        """
        Test that creating a view session does not trigger an email if the
        setting is disabled.
        """
        share_link.receive_email_notification = False
        share_link.save()

        response = public_client.post(
            '/api/v1/view-sessions/',
            {'share_link': share_link.id},
        )
        
        assert response.status_code == status.HTTP_201_CREATED
        mock_task_delay.assert_not_called()


@pytest.mark.django_db
class TestShareLinkViewDataView:
    """Tests for the public ShareLinkViewDataView endpoint."""

    @pytest.fixture
    def document_with_pages(self, document):
        """Fixture for a document that has pages."""
        version = document.versions.get(is_primary=True)
        version.has_pages = True
        version.num_pages = 1
        version.save()
        DocumentPage.objects.create(
            document_version=version, page_number=1, storage_key="pages/shared_1.png"
        )
        document.num_pages = 1
        document.save()
        return document

    @override_settings(SITE_DOMAIN="http://test.coneshare.com")
    def test_get_share_link_data_success(self, public_client, share_link, document_with_pages):
        """
        Test successful retrieval of public share link data, ensuring it
        returns secure, proxied page URLs instead of direct storage links.
        """
        response = public_client.get(f'/api/v1/links/{share_link.slug}/view-data/')

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data['id'] == str(document_with_pages.id)
        assert data['name'] == document_with_pages.name
        assert data['num_pages'] == 1
        assert len(data['pages']) == 1

        expected_url = f"http://test.coneshare.com/api/v1/links/{share_link.slug}/page/1/"
        assert data['pages'][0]['url'] == expected_url
        assert data['link_settings']['allow_download'] == share_link.allow_download

    @override_settings(SITE_DOMAIN="http://test.coneshare.com")
    @patch('sharelinks.views.fileserver_client.generate_download_url')
    def test_get_share_link_data_includes_download_url(self, mock_fs_download_url, public_client, share_link):
        """Test that the view data includes a correctly constructed download_url."""
        # Setup
        primary_version = share_link.document.versions.get(is_primary=True)
        primary_version.original_storage_key = "path/to/original.pdf"
        primary_version.save()
        mock_fs_download_url.return_value = "http://test.coneshare.com/files/download/some-token"

        # Action
        response = public_client.get(f'/api/v1/links/{share_link.slug}/view-data/')

        # Assertions
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "download_url" in data
        assert data["download_url"] == "http://test.coneshare.com/files/download/some-token"

        mock_fs_download_url.assert_called_once_with("path/to/original.pdf", is_internal=False)

    @override_settings(SITE_DOMAIN="http://test.coneshare.com")
    def test_get_share_link_data_for_image_document(self, public_client, image_document_with_content, user):
        """
        Test successful retrieval of share link data for an image, ensuring it
        returns a secure, proxied page URL.
        """
        # Setup
        image_share_link = ShareLink.objects.create(
            document=image_document_with_content,
            created_by=user
        )

        # Action
        response = public_client.get(f'/api/v1/links/{image_share_link.slug}/view-data/')

        # Assertions
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data['id'] == str(image_document_with_content.id)
        assert data['type'] == 'image'
        assert data['num_pages'] == 1
        assert len(data['pages']) == 1

        page_data = data['pages'][0]
        assert page_data['page_number'] == 1

        expected_url = f"http://test.coneshare.com/api/v1/links/{image_share_link.slug}/page/1/"
        assert page_data['url'] == expected_url

    def test_get_share_link_data_not_found(self, public_client):
        """Test getting a link with a non-existent slug returns 404."""
        response = public_client.get('/api/v1/links/non-existent-slug/view-data/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_share_link_data_inactive(self, public_client, share_link):
        """Test that an inactive link returns 404."""
        share_link.is_active = False
        share_link.save()
        response = public_client.get(f'/api/v1/links/{share_link.slug}/view-data/')
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.json()["message"] == "This link is not available."

    def test_get_share_link_data_expired(self, public_client, share_link):
        """Test that an expired link returns 410 Gone."""
        share_link.expires_at = timezone.now() - timedelta(days=1)
        share_link.save()
        response = public_client.get(f'/api/v1/links/{share_link.slug}/view-data/')
        assert response.status_code == status.HTTP_410_GONE

    def test_get_share_link_data_password_protected(self, public_client, share_link_with_password):
        """Test that a password-protected link returns 401 Unauthorized."""
        response = public_client.get(f'/api/v1/links/{share_link_with_password.slug}/view-data/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestDataroomVisitTracking:
    @pytest.fixture
    def dataroom_link_with_content(self, user, dataroom, document_factory):
        doc = document_factory(name="Test Doc.pdf")
        folder = DataroomFolder.objects.create(dataroom=dataroom, name="Test Folder")
        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=doc, folder=folder)
        link = ShareLink.objects.create(dataroom=dataroom, created_by=user)
        session = ViewSession.objects.create(share_link=link)
        return {
            "session": session,
            "folder": folder,
            "ddoc": ddoc,
        }

    def test_record_dataroom_document_visit(self, public_client, dataroom_link_with_content):
        """Test that a visit to a dataroom document is recorded."""
        session = dataroom_link_with_content['session']
        ddoc = dataroom_link_with_content['ddoc']
        
        url = f'/api/v1/view-sessions/{session.id}/record-visit/'
        data = {'dataroom_document_id': str(ddoc.id)}
        
        assert DataroomVisit.objects.count() == 0
        response = public_client.post(url, data)
        
        assert response.status_code == status.HTTP_201_CREATED
        assert DataroomVisit.objects.count() == 1
        visit = DataroomVisit.objects.first()
        assert visit.view_session == session
        assert visit.dataroom_document == ddoc
        assert visit.dataroom_folder is None

    def test_record_dataroom_folder_visit(self, public_client, dataroom_link_with_content):
        """Test that a visit to a dataroom folder is recorded."""
        session = dataroom_link_with_content['session']
        folder = dataroom_link_with_content['folder']
        
        url = f'/api/v1/view-sessions/{session.id}/record-visit/'
        data = {'dataroom_folder_id': str(folder.id)}
        
        assert DataroomVisit.objects.count() == 0
        response = public_client.post(url, data)
        
        assert response.status_code == status.HTTP_201_CREATED
        assert DataroomVisit.objects.count() == 1
        visit = DataroomVisit.objects.first()
        assert visit.view_session == session
        assert visit.dataroom_folder == folder
        assert visit.dataroom_document is None

    def test_record_visit_for_non_dataroom_link_fails(self, public_client, share_link):
        """Test that recording a visit fails for a regular document share link."""
        session = ViewSession.objects.create(share_link=share_link)
        url = f'/api/v1/view-sessions/{session.id}/record-visit/'
        data = {'dataroom_folder_id': 'some_id'}
        response = public_client.post(url, data)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_record_visit_with_invalid_id_fails(self, public_client, dataroom_link_with_content):
        """Test recording a visit with an ID for an item not in the dataroom fails."""
        session = dataroom_link_with_content['session']
        
        url = f'/api/v1/view-sessions/{session.id}/record-visit/'
        data = {'dataroom_document_id': 'ddoc_00000000000000000000000000'}
        response = public_client.post(url, data)
        
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_share_link_data_document_not_ready(self, public_client, share_link, document):
        """Test link for a document that isn't ready returns 400."""
        document.status = 'processing'
        document.save()
        response = public_client.get(f'/api/v1/links/{share_link.slug}/view-data/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_get_dataroom_link_data_hides_content_in_invisible_folder(self, public_client, user, organization, document_factory):
        """
        Test that if a folder is invisible, its contents are not shown in the
        public view data, regardless of their individual visibility settings.
        """
        # 1. Setup Dataroom and content
        dataroom = Dataroom.objects.create(name="Test Dataroom", created_by=user, organization=organization)
        parent_folder = DataroomFolder.objects.create(dataroom=dataroom, name="Parent Folder")
        sub_folder = DataroomFolder.objects.create(dataroom=dataroom, name="Subfolder", parent=parent_folder)
        doc_in_subfolder = document_factory(name="Secret.pdf")
        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=doc_in_subfolder, folder=sub_folder)

        # 2. Create share link (this will trigger signal to create settings)
        link = ShareLink.objects.create(dataroom=dataroom, created_by=user)
        
        # 3. Update settings: make parent folder invisible, but document and subfolder visible
        parent_folder_setting = ShareLinkDataroomSetting.objects.get(share_link=link, dataroom_folder=parent_folder)
        parent_folder_setting.is_visible = False
        parent_folder_setting.save()

        doc_setting = ShareLinkDataroomSetting.objects.get(share_link=link, dataroom_document=ddoc)
        doc_setting.is_visible = True
        doc_setting.save()

        sub_folder_setting = ShareLinkDataroomSetting.objects.get(share_link=link, dataroom_folder=sub_folder)
        sub_folder_setting.is_visible = True
        sub_folder_setting.save()
        
        # 4. Access public data
        url = f'/api/v1/links/{link.slug}/view-data/'
        response = public_client.get(url)
        
        # 5. Assertions
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        # The parent folder and its children (subfolder and document) should not be present
        folder_names = {f['name'] for f in data['folders']}
        doc_names = {d['document_name'] for d in data['documents']}
        
        assert "Parent Folder" not in folder_names
        assert "Subfolder" not in folder_names
        assert "Secret.pdf" not in doc_names

    def test_get_document_from_dataroom_link_returns_item_specific_settings(self, public_client, user, dataroom, document):
        """
        Test that fetching a document from a dataroom link returns the item-specific
        settings, not the parent link's settings.
        """
        # 1. Setup dataroom with content and a link where settings differ.
        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=document)
        link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user,
            allow_download=True  # Link default is TRUE
        )

        # 2. Modify the specific setting to be different from the link's default.
        setting = link.dataroom_settings.get(dataroom_document=ddoc)
        setting.allow_download = False  # Item-specific is FALSE
        setting.save()

        # 3. Request the document through the dataroom link.
        url = f"/api/v1/links/{link.slug}/view-data/?document_id={document.id}"
        response = public_client.get(url)

        # 4. Assertions.
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "link_settings" in data
        assert data['link_settings']['allow_download'] is False  # Should reflect the specific setting

    @override_settings(SITE_DOMAIN="http://test.coneshare.com")
    def test_get_dataroom_document_with_watermark_returns_correct_download_url(self, public_client, user, dataroom, document):
        """
        Test that fetching a document from a watermarked dataroom link returns
        a download_url with the correct document_id query parameter.
        """
        # 1. Setup dataroom with content and a watermarked link.
        DataroomDocument.objects.create(dataroom=dataroom, document=document)
        link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user,
            enable_watermark=True,
            watermark_text="CONFIDENTIAL"
        )

        # 2. Request the document through the dataroom link.
        url = f"/api/v1/links/{link.slug}/view-data/?document_id={document.id}"
        response = public_client.get(url)

        # 3. Assertions.
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "download_url" in data
        
        expected_url = f"http://test.coneshare.com/api/v1/links/{link.slug}/download/?document_id={document.id}"
        assert data['download_url'] == expected_url

@pytest.mark.django_db
class TestShareLinkPreview:
    """Tests for the Share Link Preview functionality."""

    def test_create_preview_session_for_share_link(self, api_client, share_link):
        """
        Verify that a preview session can be created for a share link.
        """
        url = f'/api/v1/share-links/{share_link.id}/preview/'
        response = api_client.post(url)

        assert response.status_code == status.HTTP_201_CREATED
        assert 'previewToken' in response.data
        assert PreviewSession.objects.filter(share_link=share_link).exists()

    @patch('sharelinks.views.fileserver_client.generate_download_url')
    def test_preview_token_bypasses_share_link_security(self, mock_fs_download, api_client, share_link_with_password, public_client):
        """
        Verify that a valid preview token bypasses share link security, allows
        page viewing, and is single-use.
        """
        # Add a page to the document for testing
        doc = share_link_with_password.document
        version = doc.versions.get(is_primary=True)
        version.has_pages = True
        version.save()
        DocumentPage.objects.create(document_version=version, page_number=1, storage_key="pages/preview_1.png")

        # 1. Create a preview session as the owner
        url_create = f'/api/v1/share-links/{share_link_with_password.id}/preview/'
        response_create = api_client.post(url_create)
        assert response_create.status_code == status.HTTP_201_CREATED
        token = response_create.data['previewToken']
        assert PreviewSession.objects.count() == 1

        # 2. Use the token to view the data - should succeed and consume the token
        url_view = f'/api/v1/links/{share_link_with_password.slug}/view-data/?previewToken={token}'
        response_view = public_client.get(url_view)

        assert response_view.status_code == status.HTTP_200_OK
        assert response_view.data['id'] == str(doc.id)
        assert PreviewSession.objects.count() == 0  # Token should be deleted

        # 3. Now, try to view the page - should succeed because the session is authorized
        mock_fs_download.return_value = "http://test.coneshare.com/files/download/some-token"
        url_page = f'/api/v1/links/{share_link_with_password.slug}/page/1/'
        response_page = public_client.get(url_page)
        assert response_page.status_code == status.HTTP_302_FOUND

        # 4. Try to use the token again for view-data - should fail (revert to password protection)
        # Use a new client to ensure a completely clean session.
        unauthorized_client = APIClient()
        response_view_2 = unauthorized_client.get(url_view)
        assert response_view_2.status_code == status.HTTP_401_UNAUTHORIZED

@pytest.mark.django_db
class TestShareLinkPasswordProtection:
    """Tests for password-protected share links."""

    def test_view_data_requires_password(self, public_client, share_link_with_password):
        """Accessing data for a password-protected link should fail with 401."""
        url = f'/api/v1/links/{share_link_with_password.slug}/view-data/'
        response = public_client.get(url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.json()['protectionType'] == 'password'

    def test_verify_password_wrong_password(self, public_client, share_link_with_password):
        """Submitting an incorrect password should fail."""
        url = f'/api/v1/links/{share_link_with_password.slug}/verify-password/'
        response = public_client.post(url, {'password': 'wrong-password'})

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert 'Invalid password' in response.json()['message']

    def test_verify_password_and_view_data_success(self, public_client, share_link_with_password):
        """
        Submitting the correct password should grant access for subsequent requests
        within the same session.
        """
        # Step 1: Verify the password
        verify_url = f'/api/v1/links/{share_link_with_password.slug}/verify-password/'
        response_verify = public_client.post(verify_url, {'password': 'password123'})

        assert response_verify.status_code == status.HTTP_200_OK
        assert 'verified successfully' in response_verify.json()['message']

        # Step 2: Access the data with the authorized session
        view_data_url = f'/api/v1/links/{share_link_with_password.slug}/view-data/'
        response_view = public_client.get(view_data_url)

        assert response_view.status_code == status.HTTP_200_OK
        assert 'id' in response_view.json()
        assert response_view.json()['id'] == str(share_link_with_password.document.id)

    def test_verify_password_for_non_protected_link(self, public_client, share_link):
        """Attempting to verify a password for a non-protected link should fail."""
        url = f'/api/v1/links/{share_link.slug}/verify-password/'
        response = public_client.post(url, {'password': 'any-password'})

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'not password protected' in response.json()['message']

    def test_password_verification_is_rate_limited(self, public_client, share_link_with_password):
        """Test that the password verification endpoint is rate-limited."""
        url = f'/api/v1/links/{share_link_with_password.slug}/verify-password/'
        data = {'password': 'wrong-password'}

        # The rate limit is 10/min.
        for i in range(10):
            response = public_client.post(url, data)
            # The first 10 attempts should be unauthorized but not rate-limited.
            assert response.status_code == status.HTTP_401_UNAUTHORIZED

        # The 11th attempt should be rate-limited.
        response = public_client.post(url, data)
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS


@pytest.mark.django_db
class TestShareLinkViewSet:
    def test_list_share_links_is_scoped_to_user(self, api_client, user, user2):
        """Test retrieving a list of share links is scoped to the current user."""
        doc1 = Document.objects.create(organization=user.organization, created_by=user)
        doc2 = Document.objects.create(organization=user.organization, created_by=user2)
        ShareLink.objects.create(document=doc1, created_by=user, name="My Link")
        ShareLink.objects.create(document=doc2, created_by=user2, name="Other's Link")

        response = api_client.get('/api/v1/share-links/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['name'] == "My Link"

    def test_list_share_links_can_be_filtered_by_dataroom(self, api_client, dataroom, document, user):
        """
        Test that the share link list endpoint can be filtered by a dataroom_id.
        """
        # A link for the dataroom
        ShareLink.objects.create(dataroom=dataroom, name="Dataroom Link", created_by=user)
        # A link for a regular document
        ShareLink.objects.create(document=document, name="Document Link", created_by=user)

        # 1. No filter: should return both links
        url = '/api/v1/share-links/'
        response_all = api_client.get(url)
        assert response_all.status_code == status.HTTP_200_OK
        assert len(response_all.data) == 2

        # 2. Filter by dataroom_id: should return only the dataroom link
        url_filtered = f'/api/v1/share-links/?dataroom_id={dataroom.id}'
        response_filtered = api_client.get(url_filtered)
        assert response_filtered.status_code == status.HTTP_200_OK
        assert len(response_filtered.data) == 1
        assert response_filtered.data[0]['name'] == "Dataroom Link"

    def test_bulk_update_dataroom_settings(self, api_client, dataroom, document, user):
        """
        Test bulk updating visibility and permissions for items in a dataroom
        share link.
        """
        # Setup dataroom with content
        ddoc1 = DataroomDocument.objects.create(dataroom=dataroom, document=document)
        other_doc = Document.objects.create(name="Other.pdf", organization=user.organization, created_by=user)
        ddoc2 = DataroomDocument.objects.create(dataroom=dataroom, document=other_doc)

        # Create share link for dataroom
        link = ShareLink.objects.create(dataroom=dataroom, name="DR Link", created_by=user)
        assert link.dataroom_settings.count() == 2

        setting1 = link.dataroom_settings.get(dataroom_document=ddoc1)
        setting2 = link.dataroom_settings.get(dataroom_document=ddoc2)

        # Initial state
        assert setting1.is_visible is True
        assert setting1.allow_download is True
        assert setting2.is_visible is True
        assert setting2.allow_download is True

        # Update settings: make ddoc1 not visible, and ddoc2 not downloadable
        update_data = [
            {'id': str(setting1.id), 'is_visible': False},
            {'id': str(setting2.id), 'allow_download': False}
        ]

        url = f'/api/v1/share-links/{link.id}/dataroom-settings/'
        response = api_client.patch(url, update_data, format='json')

        assert response.status_code == status.HTTP_200_OK

        setting1.refresh_from_db()
        setting2.refresh_from_db()

        assert setting1.is_visible is False
        assert setting1.allow_download is True  # Unchanged
        assert setting2.is_visible is True  # Unchanged
        assert setting2.allow_download is False

    def test_bulk_update_dataroom_settings_for_document_link_fails(self, api_client, share_link):
        """
        Test that the endpoint rejects attempts to update settings on a link
        that is not for a dataroom.
        """
        url = f'/api/v1/share-links/{share_link.id}/dataroom-settings/'
        response = api_client.patch(url, [{'id': 'any', 'is_visible': False}], format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_bulk_update_dataroom_settings_for_other_user_link_fails(self, api_client, user, user2, dataroom, document):
        """
        Test that a user cannot update settings for a share link they do not own.
        """
        # user2 creates a link
        DataroomDocument.objects.create(dataroom=dataroom, document=document)
        link_by_user2 = ShareLink.objects.create(dataroom=dataroom, created_by=user2)
        setting = link_by_user2.dataroom_settings.first()
        assert setting is not None

        # api_client (logged in as user) tries to update it
        url = f'/api/v1/share-links/{link_by_user2.id}/dataroom-settings/'
        response = api_client.patch(url, [{'id': str(setting.id), 'is_visible': False}], format='json')

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_bulk_update_dataroom_settings_is_atomic(self, api_client, dataroom, document, user):
        """
        Test that a bulk update is atomic. If one update fails, none should be applied.
        """
        DataroomDocument.objects.create(dataroom=dataroom, document=document)
        link = ShareLink.objects.create(dataroom=dataroom, created_by=user)
        setting = link.dataroom_settings.first()
        assert setting.is_visible is True

        # Update with one valid setting and one non-existent one
        update_data = [
            {'id': str(setting.id), 'is_visible': False},
            {'id': 'sds_00000000000000000000000000', 'allow_download': False}
        ]

        url = f'/api/v1/share-links/{link.id}/dataroom-settings/'
        response = api_client.patch(url, update_data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        
        # Verify that the valid change was rolled back
        setting.refresh_from_db()
        assert setting.is_visible is True

    def test_bulk_update_dataroom_settings_is_scoped_to_link(self, api_client, dataroom, document, user):
        """
        Test that a user cannot update a setting that does not belong to the
        specified share link.
        """
        # Create two links for the same dataroom
        DataroomDocument.objects.create(dataroom=dataroom, document=document)
        link1 = ShareLink.objects.create(dataroom=dataroom, created_by=user)
        link2 = ShareLink.objects.create(dataroom=dataroom, created_by=user)

        setting_from_link2 = link2.dataroom_settings.first()
        assert setting_from_link2 is not None

        # Try to update link2's setting via link1's endpoint
        update_data = [{'id': str(setting_from_link2.id), 'is_visible': False}]
        url = f'/api/v1/share-links/{link1.id}/dataroom-settings/'
        response = api_client.patch(url, update_data, format='json')

        # The server should report that the ID was not found within the scope of this link
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        setting_from_link2.refresh_from_db()
        assert setting_from_link2.is_visible is True

    def test_bulk_update_dataroom_folder_settings(self, api_client, dataroom, user):
        """Test bulk updating settings for a dataroom folder."""
        # Setup dataroom with a folder
        dr_folder = DataroomFolder.objects.create(dataroom=dataroom, name="Test DR Folder")
        link = ShareLink.objects.create(dataroom=dataroom, name="DR Link", created_by=user)
        assert link.dataroom_settings.count() == 1

        setting = link.dataroom_settings.get(dataroom_folder=dr_folder)
        assert setting.is_visible is True

        # Update the folder setting
        update_data = [{'id': str(setting.id), 'is_visible': False}]
        url = f'/api/v1/share-links/{link.id}/dataroom-settings/'
        response = api_client.patch(url, update_data, format='json')

        assert response.status_code == status.HTTP_200_OK
        setting.refresh_from_db()
        assert setting.is_visible is False

    def test_bulk_update_dataroom_settings_malformed_data(self, api_client, dataroom, document, user):
        """Test that requests with malformed data are rejected."""
        DataroomDocument.objects.create(dataroom=dataroom, document=document)
        link = ShareLink.objects.create(dataroom=dataroom, created_by=user)
        setting = link.dataroom_settings.first()
        url = f'/api/v1/share-links/{link.id}/dataroom-settings/'

        # Case 1: Missing 'id'
        data_no_id = [{'is_visible': False}]
        response_no_id = api_client.patch(url, data_no_id, format='json')
        assert response_no_id.status_code == status.HTTP_400_BAD_REQUEST

        # Case 2: No settings provided
        data_no_settings = [{'id': str(setting.id)}]
        response_no_settings = api_client.patch(url, data_no_settings, format='json')
        assert response_no_settings.status_code == status.HTTP_400_BAD_REQUEST

        # Case 3: Invalid boolean value
        data_invalid_bool = [{'id': str(setting.id), 'is_visible': 'not-a-bool'}]
        response_invalid_bool = api_client.patch(url, data_invalid_bool, format='json')
        assert response_invalid_bool.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_dataroom_link_with_same_name_as_document_link_succeeds(self, api_client, user, document, dataroom):
        """
        Test that updating a dataroom link does not fail validation when a
        document link with the same name exists.
        """
        # 1. Create a document link
        ShareLink.objects.create(document=document, name="Test Link", created_by=user)
        
        # 2. Create a dataroom link with the same name
        dataroom_link = ShareLink.objects.create(dataroom=dataroom, name="Test Link", created_by=user)
        
        # 3. Attempt to update the dataroom link. This will trigger validation.
        # The bug would cause this to fail with a 400 error.
        url = f'/api/v1/share-links/{dataroom_link.id}/'
        response = api_client.patch(url, {'is_active': False}, format='json')
        
        # 4. Assert that the update succeeds
        assert response.status_code == status.HTTP_200_OK
        dataroom_link.refresh_from_db()
        assert dataroom_link.is_active is False


@pytest.mark.django_db
class TestShareLinkEmailProtection:
    """Tests for email-protected share links."""

    @pytest.fixture
    def dataroom_link_requires_email(self, dataroom, user):
        """Fixture for a dataroom share link that requires email but not verification."""
        return ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user,
            requires_email=True,
            requires_email_verification=False
        )

    @pytest.fixture
    def dataroom_link_requires_email_verification(self, dataroom, user):
        """Fixture for a dataroom share link that requires email and verification."""
        return ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user,
            requires_email=True,
            requires_email_verification=True
        )

    def test_view_data_requires_email(self, public_client, share_link_requires_email):
        """Accessing data for an email-protected link should fail with 401."""
        url = f'/api/v1/links/{share_link_requires_email.slug}/view-data/'
        response = public_client.get(url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.json()['protectionType'] == 'email'

    def test_request_access_for_non_protected_link(self, public_client, share_link):
        """Attempting to request access for a non-protected link should fail."""
        url = f'/api/v1/links/{share_link.slug}/request-access/'
        response = public_client.post(url, {'email': 'viewer@example.com'})

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'does not require an email' in response.json()['message']

    def test_request_access_no_verification_success(self, public_client, share_link_requires_email):
        """
        Requesting access for a link that requires email (but not verification)
        should grant access immediately.
        """
        # Step 1: Request access
        request_url = f'/api/v1/links/{share_link_requires_email.slug}/request-access/'
        response_request = public_client.post(request_url, {'email': 'viewer@example.com'})

        assert response_request.status_code == status.HTTP_200_OK
        assert response_request.json()['verification_required'] is False

        # Step 2: Access the data with the authorized session
        view_data_url = f'/api/v1/links/{share_link_requires_email.slug}/view-data/'
        response_view = public_client.get(view_data_url)

        assert response_view.status_code == status.HTTP_200_OK
        assert 'id' in response_view.json()

    @patch('sharelinks.views.send_mail')
    def test_request_access_with_verification_success(self, mock_send_mail, public_client, share_link_requires_email_verification):
        """
        Requesting access for a link that requires email verification should
        trigger an email and not grant immediate access.
        """
        request_url = f'/api/v1/links/{share_link_requires_email_verification.slug}/request-access/'
        response_request = public_client.post(request_url, {'email': 'viewer@example.com'})

        assert response_request.status_code == status.HTTP_200_OK
        assert response_request.json()['verification_required'] is True
        
        # Check that an email was sent and a token was created
        mock_send_mail.assert_called_once()
        assert EmailVerificationToken.objects.count() == 1
        
        # Check that immediate access is not granted
        view_data_url = f'/api/v1/links/{share_link_requires_email_verification.slug}/view-data/'
        response_view = public_client.get(view_data_url)
        assert response_view.status_code == status.HTTP_401_UNAUTHORIZED

    def test_view_data_with_valid_access_token(self, public_client, share_link_requires_email_verification):
        """
        Using a valid access token from an email magic link should grant access.
        """
        # Step 1: Create a token manually (as if an email was sent)
        token = EmailVerificationToken.objects.create(
            share_link=share_link_requires_email_verification,
            email='viewer@example.com'
        )
        assert EmailVerificationToken.objects.count() == 1

        # Step 2: Access the data with the token
        view_data_url = f'/api/v1/links/{share_link_requires_email_verification.slug}/view-data/?accessToken={token.token}'
        response_view = public_client.get(view_data_url)

        assert response_view.status_code == status.HTTP_200_OK
        assert 'id' in response_view.json()
        
        # Step 3: Verify the token was single-use and deleted
        assert EmailVerificationToken.objects.count() == 0

        # Step 4: Subsequent access without the token should be allowed due to session
        response_view_2 = public_client.get(f'/api/v1/links/{share_link_requires_email_verification.slug}/view-data/')
        assert response_view_2.status_code == status.HTTP_200_OK

    def test_view_data_with_expired_access_token(self, public_client, share_link_requires_email_verification):
        """An expired access token should not grant access."""
        # Create an expired token
        expired_time = timezone.now() - timedelta(minutes=30)
        token = EmailVerificationToken.objects.create(
            share_link=share_link_requires_email_verification,
            email='viewer@example.com',
            expires_at=expired_time
        )

        view_data_url = f'/api/v1/links/{share_link_requires_email_verification.slug}/view-data/?accessToken={token.token}'
        response_view = public_client.get(view_data_url)

        assert response_view.status_code == status.HTTP_401_UNAUTHORIZED
        assert 'protectionType' in response_view.json()
        assert response_view.json()['protectionType'] == 'email'

    def test_request_access_for_dataroom_no_verification_success(self, public_client, dataroom_link_requires_email):
        """
        Requesting access for a dataroom link that requires email should grant access.
        """
        # Step 1: Request access
        request_url = f'/api/v1/links/{dataroom_link_requires_email.slug}/request-access/'
        response_request = public_client.post(request_url, {'email': 'viewer@example.com'})

        assert response_request.status_code == status.HTTP_200_OK
        assert response_request.json()['verification_required'] is False

        # Step 2: Access the data with the authorized session
        view_data_url = f'/api/v1/links/{dataroom_link_requires_email.slug}/view-data/'
        response_view = public_client.get(view_data_url)

        assert response_view.status_code == status.HTTP_200_OK
        assert 'id' in response_view.json()

    @patch('sharelinks.views.send_mail')
    def test_request_access_for_dataroom_with_verification_success(self, mock_send_mail, public_client, dataroom_link_requires_email_verification):
        """
        Requesting access for a dataroom link that requires email verification
        should trigger an email with the correct dataroom name.
        """
        request_url = f'/api/v1/links/{dataroom_link_requires_email_verification.slug}/request-access/'
        response_request = public_client.post(request_url, {'email': 'viewer@example.com'})

        assert response_request.status_code == status.HTTP_200_OK
        assert response_request.json()['verification_required'] is True

        mock_send_mail.assert_called_once()

        # Check that the email subject and body contain the dataroom name
        _, call_kwargs = mock_send_mail.call_args
        dataroom_name = dataroom_link_requires_email_verification.dataroom.name
        assert f"view '{dataroom_name}'" in call_kwargs['subject']
        assert f"view '{dataroom_name}'" in call_kwargs['message']


@pytest.mark.django_db
class TestOwnerPreviewFlag:

    def test_owner_preview_is_flagged_in_view_sessions(self, api_client, public_client, user, document):
        """
        Verify that a view session created from an owner's preview is correctly
        flagged as 'is_owner_view' in the analytics.
        """
        # 1. User (owner) creates a share link.
        share_link = ShareLink.objects.create(document=document, created_by=user)

        # 2. User creates a preview session for the link.
        preview_url = f'/api/v1/share-links/{share_link.id}/preview/'
        response_preview = api_client.post(preview_url)
        assert response_preview.status_code == status.HTTP_201_CREATED
        preview_token = response_preview.data['previewToken']

        # 3. User "views" the document using the preview token with the public client.
        # This simulates a browser session that will be used to create the view.
        view_data_url = f'/api/v1/links/{share_link.slug}/view-data/?previewToken={preview_token}'
        response_view_data = public_client.get(view_data_url)
        assert response_view_data.status_code == status.HTTP_200_OK

        # 4. The frontend would then create a ViewSession. We simulate this.
        # The public_client now has the 'preview_owner_email' in its session.
        response_create_view = public_client.post(
            '/api/v1/view-sessions/',
            {'share_link': share_link.id}
        )
        assert response_create_view.status_code == status.HTTP_201_CREATED
        view_session = ViewSession.objects.get(id=response_create_view.data['id'])
        assert view_session.viewer_email == user.email

        # 5. As the authenticated owner, fetch the view sessions for the document.
        sessions_url = f'/api/v1/documents/{document.id}/view-sessions/'
        response_sessions = api_client.get(sessions_url)
        assert response_sessions.status_code == status.HTTP_200_OK

        # 6. Verify the 'is_owner_view' flag is true.
        results = response_sessions.json()['results']
        assert len(results) == 1
        assert results[0]['is_owner_view'] is True
        assert results[0]['viewer_email'] == user.email

    def test_non_owner_view_is_not_flagged(self, api_client, public_client, user, document):
        """
        Verify that a view session from a regular viewer is not flagged as 'is_owner_view'.
        """
        # 1. User (owner) creates a share link that requires email.
        share_link = ShareLink.objects.create(
            document=document,
            created_by=user,
            requires_email=True,
            requires_email_verification=False  # for simplicity
        )

        # 2. A different person requests access to the link.
        viewer_email = "random.viewer@example.com"
        request_access_url = f'/api/v1/links/{share_link.slug}/request-access/'
        response_access = public_client.post(request_access_url, {'email': viewer_email})
        assert response_access.status_code == status.HTTP_200_OK

        # 3. Frontend creates a ViewSession with the now-authorized public_client.
        response_create_view = public_client.post(
            '/api/v1/view-sessions/',
            {'share_link': share_link.id}
        )
        assert response_create_view.status_code == status.HTTP_201_CREATED

        # 4. As the authenticated owner, fetch the view sessions.
        sessions_url = f'/api/v1/documents/{document.id}/view-sessions/'
        response_sessions = api_client.get(sessions_url)
        assert response_sessions.status_code == status.HTTP_200_OK

        # 5. Verify the 'is_owner_view' flag is false for this external viewer.
        results = response_sessions.json()['results']
        assert len(results) == 1
        assert results[0]['is_owner_view'] is False
        assert results[0]['viewer_email'] == viewer_email


@pytest.mark.django_db
class TestShareLinkPageView:
    """Tests for the new secure, non-watermarked page serving view."""

    @pytest.fixture
    def document_with_pages(self, document):
        version = document.versions.get(is_primary=True)
        version.has_pages = True
        version.num_pages = 2
        version.save()
        DocumentPage.objects.create(
            document_version=version, page_number=1, storage_key="pages/page_1.png"
        )
        DocumentPage.objects.create(
            document_version=version, page_number=2, storage_key="pages/page_2.png"
        )
        document.num_pages = 2
        document.save()
        return document

    @pytest.fixture
    def authorized_client(self, public_client, share_link_with_password):
        # Create a client and authorize its session by verifying a password.
        # This simulates a viewer who has already passed the first security step.
        verify_url = f'/api/v1/links/{share_link_with_password.slug}/verify-password/'
        response_verify = public_client.post(verify_url, {'password': 'password123'})
        assert response_verify.status_code == status.HTTP_200_OK
        return public_client

    @override_settings(SITE_DOMAIN="http://test.coneshare.com")
    @patch('sharelinks.views.fileserver_client.generate_download_url')
    def test_get_page_success_redirects(self, mock_fs_download_url, authorized_client, share_link_with_password, document_with_pages):
        """
        Test that an authorized request to the page endpoint successfully
        redirects to a temporary URL from the file server.
        """
        share_link_with_password.document = document_with_pages
        share_link_with_password.save()
        mock_fs_download_url.return_value = "http://test.coneshare.com/files/download/some-token"

        url = f'/api/v1/links/{share_link_with_password.slug}/page/1/'
        response = authorized_client.get(url)

        assert response.status_code == status.HTTP_302_FOUND
        assert response.url == "http://test.coneshare.com/files/download/some-token"
        page = DocumentPage.objects.get(page_number=1)
        mock_fs_download_url.assert_called_once_with(page.storage_key, is_internal=False)

    def test_get_page_unauthorized_fails(self, public_client, share_link, document_with_pages):
        """
        Test that a request to the page endpoint without an authorized session
        is rejected.
        """
        share_link.document = document_with_pages
        share_link.save()

        url = f'/api/v1/links/{share_link.slug}/page/1/'
        response = public_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @patch('sharelinks.views.fileserver_client.generate_download_url')
    def test_get_page_for_public_link_succeeds_after_view_data(self, mock_fs_download_url, public_client, share_link, document_with_pages):
        """
        Tests that viewing a public link (no password/email) authorizes the session
        to then successfully view pages.
        """
        share_link.document = document_with_pages
        share_link.save()
        
        # 1. Call view-data first to authorize the session
        view_data_url = f'/api/v1/links/{share_link.slug}/view-data/'
        response_view = public_client.get(view_data_url)
        assert response_view.status_code == status.HTTP_200_OK

        # 2. Now request the page - it should succeed
        mock_fs_download_url.return_value = "http://test.coneshare.com/files/download/some-token"
        page_url = f'/api/v1/links/{share_link.slug}/page/1/'
        response_page = public_client.get(page_url)

        assert response_page.status_code == status.HTTP_302_FOUND
        assert response_page.url == "http://test.coneshare.com/files/download/some-token"

    @override_settings(SITE_DOMAIN="http://test.coneshare.com")
    @patch('sharelinks.views.fileserver_client.generate_download_url')
    def test_get_page_for_dataroom_success(self, mock_fs_download_url, dataroom, document_with_pages, user):
        """
        Test that a page for a document within a dataroom can be successfully retrieved.
        """
        client = APIClient()
        DataroomDocument.objects.create(dataroom=dataroom, document=document_with_pages)
        link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user,
            password="password123"
        )
        # Authorize the client session
        verify_url = f'/api/v1/links/{link.slug}/verify-password/'
        response_verify = client.post(verify_url, {'password': 'password123'})
        assert response_verify.status_code == status.HTTP_200_OK

        mock_fs_download_url.return_value = "http://test.coneshare.com/files/download/some-token"
        url = f'/api/v1/links/{link.slug}/page/1/?document_id={document_with_pages.id}'
        response = client.get(url)

        assert response.status_code == status.HTTP_302_FOUND
        assert response.url == "http://test.coneshare.com/files/download/some-token"

    def test_get_page_for_dataroom_missing_doc_id(self, authorized_client, dataroom, share_link_with_password):
        """
        Test that a request to a dataroom link's page endpoint without a
        document_id fails.
        """
        share_link_with_password.dataroom = dataroom
        share_link_with_password.document = None
        share_link_with_password.save()
        
        url = f'/api/v1/links/{share_link_with_password.slug}/page/1/'
        response = authorized_client.get(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_get_non_existent_page_fails(self, authorized_client, share_link_with_password, document_with_pages):
        """Test that requesting a page number that does not exist returns a 404."""
        share_link_with_password.document = document_with_pages
        share_link_with_password.save()

        url = f'/api/v1/links/{share_link_with_password.slug}/page/99/'
        response = authorized_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestWatermarkingViews:
    """Tests for the dynamic watermarking endpoints."""

    @pytest.fixture
    def document_with_page(self, document):
        """Fixture for a document that has one page."""
        version = document.versions.get(is_primary=True)
        version.has_pages = True
        version.num_pages = 1
        version.original_storage_key = "path/to/original.pdf"
        version.save()
        DocumentPage.objects.create(
            document_version=version, page_number=1, storage_key="pages/page_1.png"
        )
        document.num_pages = 1
        document.type = 'pdf'
        document.save()
        return document

    @pytest.fixture
    def watermarked_link(self, share_link_with_watermark, document_with_page):
        """Connects the watermarked link to the document with a page."""
        share_link_with_watermark.document = document_with_page
        share_link_with_watermark.save()
        return share_link_with_watermark

    @patch('sharelinks.views.requests.get')
    @patch('sharelinks.views.fileserver_client.generate_download_url')
    def test_render_watermarked_page_success(self, mock_fs_download_url, mock_requests_get, public_client, watermarked_link):
        """Test that a watermarked page image is rendered successfully."""
        mock_fs_download_url.return_value = "/files/download/token"
        img = Image.new('RGB', (100, 100), color='white')
        buffer = BytesIO()
        img.save(buffer, 'JPEG')
        buffer.seek(0)

        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.content = buffer.getvalue()
        mock_requests_get.return_value = mock_response

        url = f'/api/v1/links/{watermarked_link.slug}/render-page/1/'
        response = public_client.get(url, REMOTE_ADDR='192.168.1.1')

        assert response.status_code == status.HTTP_200_OK
        assert response.get('Content-Type') == 'image/jpeg'

        page = DocumentPage.objects.get(page_number=1)
        mock_fs_download_url.assert_called_once_with(page.storage_key, is_internal=True)

    @patch('sharelinks.views.requests.get')
    @patch('sharelinks.views.fileserver_client.generate_download_url')
    def test_download_watermarked_file_success(self, mock_fs_download_url, mock_requests_get, public_client, watermarked_link):
        """Test that a watermarked PDF file is generated and served for download."""
        mock_fs_download_url.return_value = "/files/download/token"
        pdf_content = b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000059 00000 n \n0000000112 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF'
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.content = pdf_content
        mock_requests_get.return_value = mock_response
        
        url = f'/api/v1/links/{watermarked_link.slug}/download/'
        response = public_client.get(url, REMOTE_ADDR='192.168.1.1')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.get('Content-Type') == 'application/pdf'
        assert 'attachment; filename=' in response.get('Content-Disposition')
        
        assert response.content.startswith(b'%PDF-')
        assert len(response.content) > len(pdf_content)

        version = watermarked_link.document.versions.get(is_primary=True)
        mock_fs_download_url.assert_called_once_with(version.original_storage_key, is_internal=True)

    def test_download_watermarked_file_not_allowed(self, public_client, watermarked_link):
        """Test that downloading is forbidden if allow_download is false."""
        watermarked_link.allow_download = False
        watermarked_link.save()

        url = f'/api/v1/links/{watermarked_link.slug}/download/'
        response = public_client.get(url)

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "not allowed for this item" in response.data['message']

    def test_render_page_for_link_without_watermark_fails(self, public_client, share_link):
        """Test that the render endpoint fails if watermarking is not enabled."""
        url = f'/api/v1/links/{share_link.slug}/render-page/1/'
        response = public_client.get(url)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Watermarking is not enabled' in response.data['message']

    @patch('sharelinks.views.requests.get')
    @patch('sharelinks.views.fileserver_client.generate_download_url')
    def test_render_watermarked_page_returns_caching_headers(self, mock_fs_download, mock_requests_get, public_client, watermarked_link):
        """Test that the initial response for a watermarked page includes ETag and Cache-Control headers."""
        mock_fs_download.return_value = "http://core:8080/files/download/token"
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        img = Image.new('RGB', (100, 100), color='white')
        buffer = BytesIO()
        img.save(buffer, 'JPEG')
        buffer.seek(0)
        mock_response.content = buffer.getvalue()
        mock_requests_get.return_value = mock_response

        url = f'/api/v1/links/{watermarked_link.slug}/render-page/1/'
        response = public_client.get(url, REMOTE_ADDR='192.168.1.1')

        assert response.status_code == status.HTTP_200_OK
        assert 'ETag' in response
        assert response['ETag'] is not None
        assert 'Cache-Control' in response
        assert response['Cache-Control'] == 'public, max-age=60, must-revalidate'

    @patch('sharelinks.views.requests.get')
    @patch('sharelinks.views.fileserver_client.generate_download_url')
    def test_render_watermarked_page_with_etag_returns_304(self, mock_fs_download, mock_requests_get, public_client, watermarked_link):
        """Test that sending a valid ETag in If-None-Match returns a 304 Not Modified."""
        mock_fs_download.return_value = "http://core:8080/files/download/token"
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        img = Image.new('RGB', (100, 100), color='white')
        buffer = BytesIO()
        img.save(buffer, 'JPEG')
        buffer.seek(0)
        mock_response.content = buffer.getvalue()
        mock_requests_get.return_value = mock_response

        # First request to get the ETag
        url = f'/api/v1/links/{watermarked_link.slug}/render-page/1/'
        response1 = public_client.get(url, REMOTE_ADDR='192.168.1.1')
        assert response1.status_code == status.HTTP_200_OK
        etag = response1['ETag']

        # Second request with the ETag
        response2 = public_client.get(url, REMOTE_ADDR='192.168.1.1', HTTP_IF_NONE_MATCH=etag)
        assert response2.status_code == status.HTTP_304_NOT_MODIFIED

        # Ensure the file was only fetched once
        mock_fs_download.assert_called_once()
        mock_requests_get.assert_called_once()

    @patch('sharelinks.views.requests.get')
    @patch('sharelinks.views.fileserver_client.generate_download_url')
    def test_render_watermarked_page_with_changed_link_returns_200(self, mock_fs_download, mock_requests_get, public_client, watermarked_link):
        """
        Test that ETag validation fails and returns a new 200 response if the
        link's watermark text has changed.
        """
        def setup_mocks(*args, **kwargs):
            mock_response = MagicMock()
            mock_response.raise_for_status.return_value = None
            img = Image.new('RGB', (100, 100), color='white')
            buffer = BytesIO()
            img.save(buffer, 'JPEG')
            buffer.seek(0)
            mock_response.content = buffer.getvalue()
            mock_requests_get.return_value = mock_response
        
        mock_fs_download.return_value = "http://core:8080/files/download/token"
        setup_mocks()

        # First request to get the ETag
        url = f'/api/v1/links/{watermarked_link.slug}/render-page/1/'
        response1 = public_client.get(url, REMOTE_ADDR='192.168.1.1')
        assert response1.status_code == status.HTTP_200_OK
        etag1 = response1['ETag']

        # Change the watermark text, which should invalidate the ETag
        watermarked_link.watermark_text = "New Watermark"
        watermarked_link.save()

        # Second request with the old ETag
        response2 = public_client.get(url, REMOTE_ADDR='192.168.1.1', HTTP_IF_NONE_MATCH=etag1)
        assert response2.status_code == status.HTTP_200_OK
        etag2 = response2['ETag']

        assert etag1 != etag2

    @patch('sharelinks.views.requests.get')
    @patch('sharelinks.views.fileserver_client.generate_download_url')
    def test_render_watermarked_page_etag_varies_by_email(self, mock_fs_download, mock_requests_get, public_client, watermarked_link):
        """
        Test that the ETag for a watermarked page is different for different
        viewers when the {{email}} variable is used.
        """
        watermarked_link.requires_email = True
        watermarked_link.watermark_text = "Viewed by {{email}}"
        watermarked_link.save()

        def setup_mocks(*args, **kwargs):
            mock_response = MagicMock()
            mock_response.raise_for_status.return_value = None
            img = Image.new('RGB', (100, 100), color='white')
            buffer = BytesIO()
            img.save(buffer, 'JPEG')
            buffer.seek(0)
            mock_response.content = buffer.getvalue()
            mock_requests_get.return_value = mock_response

        mock_fs_download.return_value = "http://core:8080/files/download/token"
        setup_mocks()

        # --- Viewer 1 ---
        # Authorize viewer 1
        request_url = f'/api/v1/links/{watermarked_link.slug}/request-access/'
        public_client.post(request_url, {'email': 'viewer1@example.com'})

        # Get ETag for viewer 1
        render_url = f'/api/v1/links/{watermarked_link.slug}/render-page/1/'
        response1 = public_client.get(render_url, REMOTE_ADDR='192.168.1.1')
        assert response1.status_code == status.HTTP_200_OK
        etag1 = response1['ETag']

        # --- Viewer 2 ---
        # Use a new client to simulate a new viewer with a clean session
        client2 = APIClient()
        request_url = f'/api/v1/links/{watermarked_link.slug}/request-access/'
        client2.post(request_url, {'email': 'viewer2@example.com'})

        # Get ETag for viewer 2
        response2 = client2.get(render_url, REMOTE_ADDR='192.168.1.1')
        assert response2.status_code == status.HTTP_200_OK
        etag2 = response2['ETag']

        assert etag1 is not None
        assert etag2 is not None
        assert etag1 != etag2

    @patch('sharelinks.views.requests.get')
    @patch('sharelinks.views.fileserver_client.generate_download_url')
    def test_render_watermarked_page_etag_varies_by_x_real_ip(self, mock_fs_download, mock_requests_get, public_client, watermarked_link):
        """
        Test that the ETag for a watermarked page is different for different
        viewers when the IP address is taken from X-Real-IP.
        """
        watermarked_link.watermark_text = "Viewed from {{ip-address}}"
        watermarked_link.save()

        def setup_mocks(*args, **kwargs):
            mock_response = MagicMock()
            mock_response.raise_for_status.return_value = None
            img = Image.new('RGB', (100, 100), color='white')
            buffer = BytesIO()
            img.save(buffer, 'JPEG')
            buffer.seek(0)
            mock_response.content = buffer.getvalue()
            mock_requests_get.return_value = mock_response

        mock_fs_download.return_value = "http://core:8080/files/download/token"
        setup_mocks()

        # --- Viewer 1 ---
        render_url = f'/api/v1/links/{watermarked_link.slug}/render-page/1/'
        response1 = public_client.get(render_url, HTTP_X_REAL_IP='1.1.1.1', HTTP_X_FORWARDED_FOR='5.5.5.5', REMOTE_ADDR='192.168.1.1')
        assert response1.status_code == status.HTTP_200_OK
        etag1 = response1['ETag']

        # --- Viewer 2 ---
        # Use the same client but a different X-Real-IP
        response2 = public_client.get(render_url, HTTP_X_REAL_IP='2.2.2.2', HTTP_X_FORWARDED_FOR='5.5.5.5', REMOTE_ADDR='192.168.1.1')
        assert response2.status_code == status.HTTP_200_OK
        etag2 = response2['ETag']

        assert etag1 is not None
        assert etag2 is not None
        assert etag1 != etag2

    @patch('sharelinks.views.requests.get')
    @patch('sharelinks.views.fileserver_client.generate_download_url')
    def test_render_watermarked_page_from_dataroom_success(self, mock_fs_download, mock_requests_get, public_client, dataroom_with_watermarked_link):
        """Test that a watermarked page can be rendered from a dataroom link."""
        mock_fs_download.return_value = "http://core:8080/files/download/token"
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        img = Image.new('RGB', (100, 100), color='white')
        buffer = BytesIO()
        img.save(buffer, 'JPEG')
        buffer.seek(0)
        mock_response.content = buffer.getvalue()
        mock_requests_get.return_value = mock_response

        link = dataroom_with_watermarked_link['link']
        document = dataroom_with_watermarked_link['document']

        url = f'/api/v1/links/{link.slug}/render-page/1/?document_id={document.id}'
        response = public_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.get('Content-Type') == 'image/jpeg'

    @pytest.fixture
    def dataroom_with_watermarked_link(self, dataroom, user, document_with_page):
        """
        Sets up a dataroom with a document and a watermarked share link.
        """
        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=document_with_page)
        link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user,
            enable_watermark=True,
            watermark_text="CONFIDENTIAL",
            allow_download=True  # Link-level setting
        )
        return {
            'link': link,
            'document': document_with_page,
            'ddoc': ddoc,
        }

    @patch('sharelinks.views.requests.get')
    @patch('sharelinks.views.fileserver_client.generate_download_url')
    def test_download_watermarked_file_from_dataroom_success(self, mock_fs_download, mock_requests_get, public_client, dataroom_with_watermarked_link):
        """Test that a watermarked file can be downloaded from a dataroom link."""
        mock_fs_download.return_value = "http://core:8080/files/download/token"
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        pdf_content = b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000059 00000 n \n0000000112 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF'
        mock_response.content = pdf_content
        mock_requests_get.return_value = mock_response
        
        link = dataroom_with_watermarked_link['link']
        document = dataroom_with_watermarked_link['document']
        
        url = f'/api/v1/links/{link.slug}/download/?document_id={document.id}'
        response = public_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.get('Content-Type') == 'application/pdf'
        assert f'attachment; filename="{get_valid_filename(document.name)}"' in response.get('Content-Disposition')
        assert len(response.content) > len(pdf_content)

    def test_download_watermarked_file_from_dataroom_permission_denied(self, public_client, dataroom_with_watermarked_link):
        """Test download is denied if dataroom item setting is allow_download=False."""
        link = dataroom_with_watermarked_link['link']
        document = dataroom_with_watermarked_link['document']
        ddoc = dataroom_with_watermarked_link['ddoc']
        
        # Override setting for this item
        setting = link.dataroom_settings.get(dataroom_document=ddoc)
        setting.allow_download = False
        setting.save()
        
        url = f'/api/v1/links/{link.slug}/download/?document_id={document.id}'
        response = public_client.get(url)
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "not allowed for this item" in response.data['message']

    def test_download_watermarked_file_from_dataroom_missing_doc_id(self, public_client, dataroom_with_watermarked_link):
        """Test that calling the download endpoint for a dataroom link without a document_id fails."""
        link = dataroom_with_watermarked_link['link']
        url = f'/api/v1/links/{link.slug}/download/'
        response = public_client.get(url)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Document ID is required" in response.data['message']

    def test_download_watermarked_file_from_dataroom_invalid_doc_id(self, public_client, dataroom_with_watermarked_link):
        """Test that downloading with a document_id not in the dataroom link fails."""
        link = dataroom_with_watermarked_link['link']
        invalid_doc_id = 'doc_00000000000000000000000000'
        url = f'/api/v1/links/{link.slug}/download/?document_id={invalid_doc_id}'
        response = public_client.get(url)
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "Document not found" in response.data['message']


@pytest.mark.django_db
class TestDataroomFolderDownloadView:
    @pytest.fixture
    def dataroom_with_content_and_link(self, dataroom, user, document_factory):
        """
        Sets up a dataroom with a nested structure, documents, and a share link.
        """
        # Create folder structure
        root_folder = DataroomFolder.objects.create(dataroom=dataroom, name="Root Folder")
        subfolder = DataroomFolder.objects.create(dataroom=dataroom, name="Subfolder", parent=root_folder)

        # Create documents
        doc_a = document_factory(name="Doc A.pdf", type='pdf')
        doc_b = document_factory(name="Doc B.pdf", type='pdf')
        invisible_doc = document_factory(name="Invisible.pdf", type='pdf')
        not_downloadable_doc = document_factory(name="Not Downloadable.pdf", type='pdf')

        # Add documents to dataroom
        ddoc_a = DataroomDocument.objects.create(dataroom=dataroom, document=doc_a, folder=root_folder)
        ddoc_b = DataroomDocument.objects.create(dataroom=dataroom, document=doc_b, folder=subfolder)
        ddoc_invisible = DataroomDocument.objects.create(dataroom=dataroom, document=invisible_doc, folder=root_folder)
        ddoc_not_downloadable = DataroomDocument.objects.create(dataroom=dataroom, document=not_downloadable_doc, folder=root_folder)
        
        # Create share link, which will auto-generate settings
        link = ShareLink.objects.create(dataroom=dataroom, created_by=user)

        return {
            'link': link,
            'root_folder': root_folder,
            'subfolder': subfolder,
            'ddoc_a': ddoc_a,
            'ddoc_b': ddoc_b,
            'ddoc_invisible': ddoc_invisible,
            'ddoc_not_downloadable': ddoc_not_downloadable,
        }

    @patch('sharelinks.views.requests.get')
    @patch('sharelinks.views.fileserver_client.generate_download_url')
    def test_download_folder_success(self, mock_fs_download, mock_requests_get, public_client, dataroom_with_content_and_link):
        mock_fs_download.return_value = "/files/download/token"
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.content = b"file content"
        mock_requests_get.return_value = mock_response

        link = dataroom_with_content_and_link['link']
        root_folder = dataroom_with_content_and_link['root_folder']

        url = f'/api/v1/links/{link.slug}/download-folder/{root_folder.id}/'
        response = public_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response['Content-Type'] == 'application/zip'
        assert 'attachment; filename="Root_Folder.zip"' in response['Content-Disposition']

        zip_buffer = BytesIO(response.content)
        with zipfile.ZipFile(zip_buffer, 'r') as zf:
            names = zf.namelist()
            assert 'Root_Folder/' in names
            assert 'Root_Folder/Doc_A.pdf' in names
            assert 'Root_Folder/Subfolder/' in names
            assert 'Root_Folder/Subfolder/Doc_B.pdf' in names

    def test_download_folder_permission_denied(self, public_client, dataroom_with_content_and_link):
        link = dataroom_with_content_and_link['link']
        root_folder = dataroom_with_content_and_link['root_folder']

        # Make the root folder not downloadable
        setting = link.dataroom_settings.get(dataroom_folder=root_folder)
        setting.allow_download = False
        setting.save()

        url = f'/api/v1/links/{link.slug}/download-folder/{root_folder.id}/'
        response = public_client.get(url)

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @patch('sharelinks.views.requests.get')
    @patch('sharelinks.views.fileserver_client.generate_download_url')
    def test_zip_archive_respects_permissions(self, mock_fs_download, mock_requests_get, public_client, dataroom_with_content_and_link):
        mock_fs_download.return_value = "http://core:8080/files/download/token"
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.content = b"file content"
        mock_requests_get.return_value = mock_response
        link = dataroom_with_content_and_link['link']
        root_folder = dataroom_with_content_and_link['root_folder']
        ddoc_invisible = dataroom_with_content_and_link['ddoc_invisible']
        ddoc_not_downloadable = dataroom_with_content_and_link['ddoc_not_downloadable']

        # Update settings for specific documents
        setting_invisible = link.dataroom_settings.get(dataroom_document=ddoc_invisible)
        setting_invisible.is_visible = False
        setting_invisible.save()

        setting_not_downloadable = link.dataroom_settings.get(dataroom_document=ddoc_not_downloadable)
        setting_not_downloadable.allow_download = False
        setting_not_downloadable.save()
        
        url = f'/api/v1/links/{link.slug}/download-folder/{root_folder.id}/'
        response = public_client.get(url)

        assert response.status_code == status.HTTP_200_OK

        zip_buffer = BytesIO(response.content)
        with zipfile.ZipFile(zip_buffer, 'r') as zf:
            names = zf.namelist()
            assert 'Root_Folder/Doc_A.pdf' in names
            assert 'Root_Folder/Invisible.pdf' not in names
            assert 'Root_Folder/Not_Downloadable.pdf' not in names

    @patch('sharelinks.views._generate_watermarked_pdf')
    def test_zip_archive_includes_watermarked_file(self, mock_generate_pdf, public_client, dataroom_with_content_and_link):
        link = dataroom_with_content_and_link['link']
        root_folder = dataroom_with_content_and_link['root_folder']
        ddoc_a = dataroom_with_content_and_link['ddoc_a']
        
        link.enable_watermark = True
        link.watermark_text = "TEST"
        link.save()

        setting_a = link.dataroom_settings.get(dataroom_document=ddoc_a)
        setting_a.enable_watermark = True
        setting_a.save()

        mock_generate_pdf.return_value = BytesIO(b"watermarked pdf content")

        url = f'/api/v1/links/{link.slug}/download-folder/{root_folder.id}/'
        response = public_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        mock_generate_pdf.assert_called_once()

        zip_buffer = BytesIO(response.content)
        with zipfile.ZipFile(zip_buffer, 'r') as zf:
            content = zf.read('Root_Folder/Doc_A.pdf')
            assert content == b"watermarked pdf content"
            
    def test_download_folder_password_protected_fails(self, public_client, dataroom_with_content_and_link):
        link = dataroom_with_content_and_link['link']
        root_folder = dataroom_with_content_and_link['root_folder']
        
        link.password = "password123"
        link.save()

        url = f'/api/v1/links/{link.slug}/download-folder/{root_folder.id}/'
        response = public_client.get(url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
