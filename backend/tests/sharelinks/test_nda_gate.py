import pytest
from rest_framework import status
from django.utils import timezone
from sharelinks.models import ShareLink, NDAAcceptance, ViewSession
from documents.models import Document, DocumentVersion, DocumentPage

@pytest.fixture
def nda_share_link(user, document):
    # Setup document pages for viewing tests
    version = document.versions.get(is_primary=True)
    version.has_pages = True
    version.num_pages = 1
    version.save()
    DocumentPage.objects.create(
        document_version=version, page_number=1, storage_key="pages/shared_1.png"
    )
    document.num_pages = 1
    document.save()

    link = ShareLink.objects.create(
        document=document,
        created_by=user,
        require_nda=True,
        nda_text="Please sign this NDA text.",
        nda_version=1
    )
    return link

@pytest.mark.django_db
class TestShareLinkNDAGate:
    def test_public_meta_includes_nda_info(self, public_client, nda_share_link):
        """Test that public meta endpoint returns NDA requirements."""
        response = public_client.get(f'/api/v1/links/{nda_share_link.slug}/public-meta/')
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data['require_nda'] is True
        assert data['nda_text'] == "Please sign this NDA text."
        assert data['nda_version'] == 1
        assert data['has_accepted_current_nda'] is False

    def test_view_data_gated_by_nda(self, public_client, nda_share_link):
        """Test that view-data returns 401 when NDA is not accepted."""
        response = public_client.get(f'/api/v1/links/{nda_share_link.slug}/view-data/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        data = response.json()
        assert data['protectionType'] == 'nda'
        assert data['require_nda'] is True
        assert data['nda_text'] == "Please sign this NDA text."
        assert data['nda_version'] == 1

    def test_accept_nda_creates_session_and_acceptance(self, public_client, nda_share_link):
        """Test that accepting NDA creates a ViewSession and NDAAcceptance record."""
        assert NDAAcceptance.objects.count() == 0
        assert ViewSession.objects.count() == 0

        # Accept NDA without providing view_session_id (anonymous flow)
        response = public_client.post(f'/api/v1/links/{nda_share_link.slug}/accept-nda/')
        assert response.status_code == status.HTTP_200_OK
        
        data = response.json()
        assert 'view_session_id' in data
        view_session_id = data['view_session_id']

        # Verify DB records
        assert NDAAcceptance.objects.count() == 1
        assert ViewSession.objects.count() == 1
        
        acceptance = NDAAcceptance.objects.first()
        assert acceptance.share_link == nda_share_link
        assert acceptance.nda_version == 1
        assert str(acceptance.view_session_id) == view_session_id

        # Now view-data should pass
        response_view = public_client.get(
            f'/api/v1/links/{nda_share_link.slug}/view-data/',
            data={'view_session_id': view_session_id}
        )
        assert response_view.status_code == status.HTTP_200_OK

    def test_pages_and_renders_gated_by_nda(self, public_client, nda_share_link):
        """Test that page viewing and watermarked rendering block access until NDA is accepted."""
        # 1. Page view blocks
        response_page = public_client.get(f'/api/v1/links/{nda_share_link.slug}/page/1/')
        assert response_page.status_code == status.HTTP_401_UNAUTHORIZED # requires authorized session
        
        # Now authorize password/email but not NDA
        # Let's populate the session to simulate authorized password/email
        session = public_client.session
        session['authorized_share_links'] = {
            str(nda_share_link.id): {
                'password_verified': True,
                'email_verified': True,
                'viewer_email': 'test@example.com',
                'nda_accepted_version': 0
            }
        }
        session.save()

        # Page view should return 403 Forbidden due to NDA gate
        response_page = public_client.get(f'/api/v1/links/{nda_share_link.slug}/page/1/')
        assert response_page.status_code == status.HTTP_403_FORBIDDEN

        # Render watermarked page should return 403 Forbidden
        response_render = public_client.get(f'/api/v1/links/{nda_share_link.slug}/render-page/1/')
        assert response_render.status_code == status.HTTP_403_FORBIDDEN

        # Accept NDA
        response_accept = public_client.post(f'/api/v1/links/{nda_share_link.slug}/accept-nda/')
        assert response_accept.status_code == status.HTTP_200_OK

        # Page view should pass (with redirects/mock pages or storage link redirects)
        # Note: view-page endpoint redirects to file server, which returns 302
        response_page = public_client.get(f'/api/v1/links/{nda_share_link.slug}/page/1/')
        assert response_page.status_code in (status.HTTP_200_OK, status.HTTP_302_FOUND)

    def test_nda_version_increment_requires_reacceptance(self, public_client, nda_share_link):
        """Test that updating NDA text increments the version and requires re-acceptance."""
        # 1. Accept first NDA version
        response = public_client.post(f'/api/v1/links/{nda_share_link.slug}/accept-nda/')
        assert response.status_code == status.HTTP_200_OK
        view_session_id = response.json()['view_session_id']

        # Verify access is open
        response_view = public_client.get(
            f'/api/v1/links/{nda_share_link.slug}/view-data/',
            data={'view_session_id': view_session_id}
        )
        assert response_view.status_code == status.HTTP_200_OK

        # 2. Update NDA text
        nda_share_link.nda_text = "New NDA agreement terms."
        nda_share_link.save()
        assert nda_share_link.nda_version == 2

        # 3. Verify access is gated again
        response_view = public_client.get(
            f'/api/v1/links/{nda_share_link.slug}/view-data/',
            data={'view_session_id': view_session_id}
        )
        assert response_view.status_code == status.HTTP_401_UNAUTHORIZED
        assert response_view.json()['nda_version'] == 2

        # 4. Accept version 2
        response = public_client.post(
            f'/api/v1/links/{nda_share_link.slug}/accept-nda/',
            data={'view_session_id': view_session_id}
        )
        assert response.status_code == status.HTTP_200_OK

        # 5. Access should be open again
        response_view = public_client.get(
            f'/api/v1/links/{nda_share_link.slug}/view-data/',
            data={'view_session_id': view_session_id}
        )
        assert response_view.status_code == status.HTTP_200_OK

    def test_accept_nda_triggers_notifications_and_automation(self, public_client, nda_share_link):
        """Test that accepting NDA triggers notifications and dispatch events if no session existed."""
        from unittest.mock import patch
        nda_share_link.receive_email_notification = True
        nda_share_link.save()

        with patch('sharelinks.views._dispatch_automation_event') as mock_dispatch:
            response = public_client.post(f'/api/v1/links/{nda_share_link.slug}/accept-nda/')
            assert response.status_code == status.HTTP_200_OK
            mock_dispatch.assert_called_once()

    def test_nda_save_update_fields_increments_version(self, nda_share_link):
        """Test that update_fields=['nda_text'] save triggers version increment and updates database."""
        assert nda_share_link.nda_version == 1
        
        nda_share_link.nda_text = "Third NDA text terms."
        nda_share_link.save(update_fields=['nda_text'])
        
        nda_share_link.refresh_from_db()
        assert nda_share_link.nda_version == 2
        assert nda_share_link.nda_text == "Third NDA text terms."

    def test_accept_nda_email_verified_flow(self, public_client, nda_share_link):
        """Test that accepting NDA when email verification is required satisfies constraints (XOR check)."""
        from sharelinks.models import Viewer
        org = nda_share_link.document.organization
        Viewer.objects.create(organization=org, email='viewer@example.com')

        nda_share_link.requires_email = True
        nda_share_link.save()

        # Step 1: Ensure email verification is prompted first
        response = public_client.get(f'/api/v1/links/{nda_share_link.slug}/view-data/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.json()['protectionType'] == 'email'

        # Step 2: Simulate successful email verification by setting session variables
        session = public_client.session
        session['authorized_share_links'] = {
            str(nda_share_link.id): {
                'email_verified': True,
                'viewer_email': 'viewer@example.com'
            }
        }
        session.save()

        # Step 3: Call view-data, which should now prompt for NDA
        response = public_client.get(f'/api/v1/links/{nda_share_link.slug}/view-data/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.json()['protectionType'] == 'nda'

        # Step 4: Accept NDA
        response_accept = public_client.post(f'/api/v1/links/{nda_share_link.slug}/accept-nda/')
        assert response_accept.status_code == status.HTTP_200_OK

        # Step 5: Verify the database NDAAcceptance record satisfies XOR check constraint
        assert NDAAcceptance.objects.count() == 1
        acceptance = NDAAcceptance.objects.first()
        assert acceptance.viewer is not None
        assert acceptance.viewer.email == 'viewer@example.com'
        assert acceptance.view_session is None  # <--- Satisfies the XOR constraint!

    def test_accept_nda_password_verified_flow(self, public_client, nda_share_link):
        """Test that accepting NDA when password verification is required allows access."""
        nda_share_link.password = "secret123"
        nda_share_link.save()

        # Step 1: Ensure password verification is prompted first
        response = public_client.get(f'/api/v1/links/{nda_share_link.slug}/view-data/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.json()['protectionType'] == 'password'

        # Step 2: Simulate successful password verification
        session = public_client.session
        session['authorized_share_links'] = {
            str(nda_share_link.id): {
                'password_verified': True,
                'nda_accepted_version': 0
            }
        }
        session.save()

        # Step 3: Call view-data, which should now prompt for NDA
        response = public_client.get(f'/api/v1/links/{nda_share_link.slug}/view-data/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.json()['protectionType'] == 'nda'

        # Step 4: Accept NDA
        response_accept = public_client.post(f'/api/v1/links/{nda_share_link.slug}/accept-nda/')
        assert response_accept.status_code == status.HTTP_200_OK

        # Step 5: Verify access is now open
        view_session_id = response_accept.json()['view_session_id']
        response_view = public_client.get(
            f'/api/v1/links/{nda_share_link.slug}/view-data/',
            data={'view_session_id': view_session_id}
        )
        assert response_view.status_code == status.HTTP_200_OK

    def test_accept_nda_twice_reuses_view_session(self, public_client, nda_share_link):
        """Test that accepting NDA twice does not create a duplicate ViewSession."""
        assert ViewSession.objects.count() == 0

        # Accept NDA first time
        response1 = public_client.post(f'/api/v1/links/{nda_share_link.slug}/accept-nda/')
        assert response1.status_code == status.HTTP_200_OK
        assert ViewSession.objects.count() == 1
        session_id1 = response1.json()['view_session_id']

        # Accept NDA second time (simulated retry / double-click without passing id in query)
        response2 = public_client.post(f'/api/v1/links/{nda_share_link.slug}/accept-nda/')
        assert response2.status_code == status.HTTP_200_OK
        assert ViewSession.objects.count() == 1  # Should not create a second one!
        session_id2 = response2.json()['view_session_id']
        assert session_id1 == session_id2

    def test_preview_token_invalid_bypass_fails(self, public_client, nda_share_link):
        """Test that passing an invalid/fake previewToken does not bypass the NDA gate."""
        response = public_client.get(
            f'/api/v1/links/{nda_share_link.slug}/view-data/',
            data={'previewToken': 'invalid-token-123'}
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.json()['protectionType'] == 'nda'

    def test_preview_token_valid_bypass_succeeds(self, public_client, nda_share_link):
        """Test that passing a valid previewToken successfully bypasses the NDA gate."""
        from sharelinks.models import PreviewSession
        import secrets
        from datetime import timedelta
        
        token = secrets.token_urlsafe(32)
        PreviewSession.objects.create(
            share_link=nda_share_link,
            user=nda_share_link.created_by,
            token=token,
            expires_at=timezone.now() + timedelta(minutes=5)
        )

        response = public_client.get(
            f'/api/v1/links/{nda_share_link.slug}/view-data/',
            data={'previewToken': token}
        )
        assert response.status_code == status.HTTP_200_OK

        # Verify that subsequent calls to the page endpoint bypass the NDA check
        response_page = public_client.get(
            f'/api/v1/links/{nda_share_link.slug}/page/1/'
        )
        assert response_page.status_code != status.HTTP_403_FORBIDDEN
        assert response_page.status_code != status.HTTP_401_UNAUTHORIZED

    def test_owner_clean_link_access_populates_session(self, api_client, nda_share_link):
        """Test that the owner accessing their clean link automatically authorizes the session."""
        # Force authentication as owner
        api_client.force_authenticate(user=nda_share_link.created_by)

        # GET view-data (owner bypasses checks)
        response = api_client.get(f'/api/v1/links/{nda_share_link.slug}/view-data/')
        assert response.status_code == status.HTTP_200_OK

        # Verify that their session cookie is authorized
        session = api_client.session
        auth_status = session.get('authorized_share_links', {}).get(str(nda_share_link.id), {})
        assert auth_status.get('nda_accepted_version') == nda_share_link.nda_version
        assert auth_status.get('password_verified') is True

