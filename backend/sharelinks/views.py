import hashlib
import logging
import math
import os
import secrets
import zipfile
from datetime import timedelta
from io import BytesIO
from urllib.parse import urljoin

import requests
from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.http import HttpResponse, HttpResponseRedirect
from django.utils import timezone
from django.utils.http import quote_etag
from django.utils.text import get_valid_filename
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, APIException
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from django.db.models import F
from geoip2.errors import AddressNotFoundError
from rest_framework.views import APIView

from datarooms.models import (DataroomDocument, DataroomFolder)
from datarooms.serializers import (PublicDataroomDocumentSerializer,
                                   PublicDataroomFolderSerializer)
from documents.fileserver import fileserver_client
from documents.models import DocumentPage
from documents.views import StandardResultsSetPagination, _prepare_pages_data
from .models import (EmailVerificationToken, PreviewSession,
                     ShareLink, ShareLinkDataroomSetting, ShareLinkPreset,
                     Viewer, ViewSession)
from .serializers import (PageViewRecordSerializer,
                          ShareLinkDataroomSettingUpdateSerializer,
                          ShareLinkEmailSerializer, ShareLinkPasswordSerializer,
                          ShareLinkPresetSerializer, ShareLinkSerializer,
                          ViewerSerializer, ViewSessionSerializer)

logger = logging.getLogger(__name__)


class WatermarkingError(Exception):
    """Custom exception for watermarking failures."""
    pass

class WatermarkingDependenciesMissingError(WatermarkingError):
    """Raised when required libraries for watermarking are not installed."""
    pass

class InvalidDocumentForWatermarkingError(WatermarkingError):
    """Raised when the document type is not suitable for watermarking."""
    pass


try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    Image = None
try:
    from pypdf import PdfReader, PdfWriter
except ImportError:
    PdfReader = None
    PdfWriter = None
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
except ImportError:
    canvas = None


def _get_active_share_link(slug: str) -> ShareLink:
    """
    Retrieves an active ShareLink by its slug, or raises an appropriate
    DRF exception if it's not found or inactive.
    """
    try:
        # select_related is an optimization for views that access link targets
        link = ShareLink.objects.select_related('document', 'dataroom').get(slug=slug)
    except ShareLink.DoesNotExist:
        raise NotFound(detail="Link not found.")

    if not link.is_active:
        # Treat inactive links as "not found" from a public perspective.
        raise NotFound(detail="This link is not available.")

    return link


class ShareLinkPresetViewSet(viewsets.ModelViewSet):
    queryset = ShareLinkPreset.objects.all()
    serializer_class = ShareLinkPresetSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ShareLinkPreset.objects.filter(organization=self.request.user.organization)


class ShareLinkViewSet(viewsets.ModelViewSet):
    queryset = ShareLink.objects.all()
    serializer_class = ShareLinkSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = ShareLink.objects.filter(created_by=self.request.user).prefetch_related('dataroom_settings')
        dataroom_id = self.request.query_params.get('dataroom_id')
        if dataroom_id:
            queryset = queryset.filter(dataroom_id=dataroom_id)
        return queryset

    @action(detail=True, methods=['get'], url_path='view-sessions')
    def view_sessions(self, request, pk=None):
        share_link = self.get_object()
        view_queryset = share_link.view_sessions.all()

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(view_queryset, request, view=self)
        if page is not None:
            serializer = ViewSessionSerializer(page, many=True, context=self.get_serializer_context())
            return paginator.get_paginated_response(serializer.data)

        serializer = ViewSessionSerializer(view_queryset, many=True, context=self.get_serializer_context())
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='preview')
    def create_preview_session(self, request, pk=None):
        """
        Creates a short-lived, single-use preview session for the share link owner.
        """
        share_link = self.get_object()  # This correctly uses the scoped get_queryset

        # Clean up any old, expired sessions for this link to prevent clutter
        share_link.preview_sessions.filter(expires_at__lt=timezone.now()).delete()

        session = PreviewSession.objects.create(
            share_link=share_link,
            user=request.user,
            token=secrets.token_urlsafe(32),
            expires_at=timezone.now() + timedelta(minutes=5)
        )
        return Response({'previewToken': session.token}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch'], url_path='dataroom-settings')
    def dataroom_settings(self, request, pk=None):
        """
        Bulk updates settings for items within a dataroom share link.
        """
        share_link = self.get_object()
        if not share_link.dataroom:
            return Response(
                {"detail": "This share link is not for a dataroom."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = ShareLinkDataroomSettingUpdateSerializer(data=request.data, many=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        settings_to_update = serializer.validated_data
        setting_ids = [item['id'] for item in settings_to_update]

        # Fetch all settings that match the provided IDs AND the share link.
        valid_settings_count = ShareLinkDataroomSetting.objects.filter(
            id__in=setting_ids, share_link=share_link
        ).count()

        # If the number of valid settings found doesn't match the number of IDs
        # provided, it means some IDs were invalid or didn't belong to this link.
        if valid_settings_count != len(setting_ids):
            return Response(
                {"detail": "One or more setting IDs are invalid or do not belong to this share link."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            with transaction.atomic():
                # TODO: potential N+1 query problem!
                for item in settings_to_update:
                    setting_id = item.pop('id')
                    ShareLinkDataroomSetting.objects.filter(id=setting_id, share_link=share_link).update(**item)

            return Response({"detail": "Settings updated successfully."}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Failed to bulk update dataroom settings for link {pk}: {e}")
            return Response(
                {"detail": "An internal server error occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ShareLinkViewDataView(APIView):
    """
    Provides the data needed for a public viewer to render a document from a share link.
    This view includes all necessary security checks.
    """
    # No permission_classes, as this is a public endpoint with internal checks.

    def get(self, request, slug, *args, **kwargs):
        is_preview = False
        preview_token = request.query_params.get('previewToken')
        access_token = request.query_params.get('accessToken')

        if preview_token:
            try:
                with transaction.atomic():
                    session = PreviewSession.objects.select_related('user', 'share_link__created_by').select_for_update().get(token=preview_token)
                    if not session.is_expired() and session.share_link.slug == slug:
                        # Security check: Ensure the user who created the preview session
                        # is the same user who created the share link.
                        if session.user == session.share_link.created_by:
                            is_preview = True
                            request.session['preview_owner_email'] = session.user.email
                            
                            # Authorize the link in the session for page requests
                            authorized_links = request.session.get('authorized_share_links', {})
                            authorized_links[str(session.share_link.id)] = {
                                'password_verified': True,
                                'email_verified': True,
                                'viewer_email': session.user.email,
                            }
                            request.session['authorized_share_links'] = authorized_links

                            session.delete()  # Invalidate token after use
            except PreviewSession.DoesNotExist:
                # Token is invalid, proceed with normal access checks.
                pass

        try:
            link = _get_active_share_link(slug)
        except NotFound as e:
            return Response({"message": e.detail}, status=status.HTTP_404_NOT_FOUND)

        if access_token:
            try:
                with transaction.atomic():
                    verification = EmailVerificationToken.objects.select_for_update().get(token=access_token)
                    if not verification.is_expired() and verification.share_link == link:
                        # Magic link authorizes both steps.
                        authorized_links = request.session.get('authorized_share_links', {})
                        authorized_links[str(link.id)] = {
                            'password_verified': True,
                            'email_verified': True,
                            'viewer_email': verification.email,
                        }
                        request.session['authorized_share_links'] = authorized_links
                        verification.delete()
            except EmailVerificationToken.DoesNotExist:
                logger.debug(f"Invalid or expired access token used for share link {slug}: {access_token}")
                pass  # Token is invalid, proceed with normal checks.

        # --- SERVER-SIDE ACCESS CONTROL ---
        if not is_preview:
            # 1. Check for expiration
            if link.expires_at and link.expires_at < timezone.now():
                return Response({"message": "This link has expired."}, status=status.HTTP_410_GONE)

            # 2. Sequential Protection Checks
            authorized_links = request.session.get('authorized_share_links', {})
            auth_status = authorized_links.get(str(link.id), {})

            # Step 2a: Check password first
            if link.password and not auth_status.get('password_verified'):
                return Response(
                    {"message": "This link is password-protected. Please enter the password to continue.", "protectionType": "password"},
                    status=status.HTTP_401_UNAUTHORIZED
                )

            # Step 2b: Check email second
            if link.requires_email and not auth_status.get('email_verified'):
                return Response(
                    {"message": "This link requires an email address to view.", "protectionType": "email"},
                    status=status.HTTP_401_UNAUTHORIZED
                )

        # If all checks passed (or there were none), authorize the session for page views.
        auth_status = request.session.get('authorized_share_links', {}).get(str(link.id), {})
        if not auth_status:
            authorized_links = request.session.get('authorized_share_links', {})
            authorized_links[str(link.id)] = {
                'password_verified': True,  # Bypassed if not required
                'email_verified': True,  # Bypassed if not required
                'viewer_email': '',
            }
            request.session['authorized_share_links'] = authorized_links

        # If all checks pass, proceed to fetch and return data based on link type.
        dataroom_document_id = request.query_params.get('document_id')

        document_to_return = None
        dataroom_setting = None  # To hold the setting if it's a dataroom link
        # Case 1: Fetching a specific document from within a dataroom link.
        if link.dataroom and dataroom_document_id:
            try:
                # Security check: ensure the requested document is part of this dataroom
                # and is visible according to the link's settings.
                setting = link.dataroom_settings.get(
                    dataroom_document__document_id=dataroom_document_id,
                    is_visible=True
                )
                document_to_return = setting.dataroom_document.document
                dataroom_setting = setting
            except ShareLinkDataroomSetting.DoesNotExist:
                return Response({"detail": "You do not have permission to view this document through this link."}, status=status.HTTP_403_FORBIDDEN)

        # Case 2: Fetching a direct document link.
        elif link.document:
            document_to_return = link.document

        if document_to_return:
            document = document_to_return
            primary_version = document.versions.filter(is_primary=True).first()

            if not primary_version or document.status != 'ready':
                return Response(
                    {"message": "Document is not yet ready for viewing."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Determine the correct settings to use (link vs. item-specific)
            allow_download = link.allow_download
            enable_watermark = link.enable_watermark

            if dataroom_setting:
                allow_download = dataroom_setting.allow_download
                enable_watermark = dataroom_setting.enable_watermark

            pages_data = _prepare_pages_data(document, primary_version, share_link=link)

            download_url = None
            is_watermarked = enable_watermark and link.watermark_text
            if is_watermarked:
                base_url = f"/api/v1/links/{link.slug}/download/"
                if link.dataroom:
                    download_url = urljoin(settings.SITE_DOMAIN, f"{base_url}?document_id={document.id}")
                else:
                    download_url = urljoin(settings.SITE_DOMAIN, base_url)
            elif document.type == 'image' and pages_data:
                # For images, the download URL is the same as the single page's URL.
                download_url = pages_data[0]['url']
            elif primary_version and primary_version.original_storage_key:
                try:
                    download_url = fileserver_client.generate_download_url(primary_version.original_storage_key, is_internal=False)
                except APIException:
                    # If file server is down, we can't generate a download URL.
                    download_url = None

            response_data = {
                "link_type": "document",
                "id": document.id,
                "name": document.name,
                "type": document.type,
                "num_pages": document.num_pages,
                "download_only": document.download_only,
                "file_size": primary_version.file_size if primary_version else None,
                "pages": pages_data,
                "download_url": download_url,
                "link_settings": {
                    "id": link.id,
                    "allow_download": allow_download,
                    "enable_watermark": enable_watermark,
                    "watermark_text": link.watermark_text,
                }
            }
            return Response(response_data, status=status.HTTP_200_OK)

        # Case 3: Fetching the content list for a dataroom link.
        elif link.dataroom:
            dataroom = link.dataroom
            all_settings = link.dataroom_settings.select_related(
                'dataroom_document__folder'
            ).all()

            # Find all folders explicitly set to be invisible.
            invisible_folder_ids = {
                s.dataroom_folder_id for s in all_settings if s.dataroom_folder_id and not s.is_visible
            }

            # To avoid N+1 queries during recursion, fetch the whole folder hierarchy for the dataroom.
            all_dataroom_folders = list(DataroomFolder.objects.filter(dataroom=dataroom).values('id', 'parent_id'))
            
            # Recursively find all children of invisible folders.
            # This loop continues until no new descendants of invisible folders are found.
            # TODO: this iterative approach can be less efficient than a database-native
            # recursive Common Table Expression (CTE).
            while True:
                newly_found_ids = {
                    f['id'] for f in all_dataroom_folders
                    if f['parent_id'] in invisible_folder_ids and f['id'] not in invisible_folder_ids
                }
                if not newly_found_ids:
                    break
                invisible_folder_ids.update(newly_found_ids)

            # Filter the settings to get the final list of truly visible items.
            dataroom_link_settings = [
                s for s in all_settings if (
                    s.is_visible and
                    # A document is not visible if its parent folder is in the invisible set.
                    not (s.dataroom_document and s.dataroom_document.folder_id in invisible_folder_ids) and
                    # A folder is not visible if it's in the invisible set itself.
                    not (s.dataroom_folder_id and s.dataroom_folder_id in invisible_folder_ids)
                )
            ]

            # Create a map for quick lookup of settings in serializers
            settings_map = {}
            for s in dataroom_link_settings:
                key = s.dataroom_document_id or s.dataroom_folder_id
                if key:
                    settings_map[key] = {'allow_download': s.allow_download, 'enable_watermark': s.enable_watermark}

            visible_doc_ids = [s.dataroom_document_id for s in dataroom_link_settings if s.dataroom_document_id]
            visible_folder_ids = [s.dataroom_folder_id for s in dataroom_link_settings if s.dataroom_folder_id]

            # Fetch all visible documents and folders to construct the hierarchy
            all_docs = DataroomDocument.objects.filter(id__in=visible_doc_ids).select_related('document', 'folder')
            all_folders = DataroomFolder.objects.filter(id__in=visible_folder_ids)

            # Use context to pass settings to serializers
            serializer_context = {'request': request, 'settings_map': settings_map}

            response_data = {
                'link_type': 'dataroom',
                'id': dataroom.id,
                'name': dataroom.name,
                'documents': PublicDataroomDocumentSerializer(all_docs, many=True, context=serializer_context).data,
                'folders': PublicDataroomFolderSerializer(all_folders, many=True, context=serializer_context).data,
                'link_settings': {
                    'id': link.id,
                    'allow_download': link.allow_download,
                    'enable_watermark': link.enable_watermark,
                    'watermark_text': link.watermark_text,
                }
            }
            return Response(response_data, status=status.HTTP_200_OK)

        return Response({"detail": "This link does not point to a valid resource."}, status=status.HTTP_404_NOT_FOUND)


class PerSlugScopedRateThrottle(ScopedRateThrottle):
    """
    A custom throttle that scopes the rate limit to a combination of the user's
    IP address and the share link's slug. This prevents a single IP from being
    blocked across all links if it targets just one.
    """
    def get_cache_key(self, request, view):
        # The 'slug' is retrieved from the URL kwargs.
        slug = view.kwargs.get('slug')

        # Use a more robust identifier that combines the standard IP-based ident
        # with the slug for per-link throttling.
        ident = self.get_ident(request)

        return self.cache_format % {
            'scope': self.scope,
            'ident': f"{ident}:{slug}"
        }


class ShareLinkVerifyPasswordView(APIView):
    """
    Verifies the password for a share link and authorizes the session.
    """
    throttle_classes = [PerSlugScopedRateThrottle]
    throttle_scope = 'password_verify'
    # No permission_classes, as this is a public endpoint.

    def post(self, request, slug, *args, **kwargs):
        try:
            link = _get_active_share_link(slug)
        except NotFound as e:
            return Response({"message": e.detail}, status=status.HTTP_404_NOT_FOUND)

        if not link.password:
            return Response(
                {"message": "This link is not password protected."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = ShareLinkPasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        password = serializer.validated_data['password']
        if secrets.compare_digest(password, link.password):
            # Password is correct. Store granular authorization in the session.
            authorized_links = request.session.get('authorized_share_links', {})
            if str(link.id) not in authorized_links:
                authorized_links[str(link.id)] = {}
            authorized_links[str(link.id)]['password_verified'] = True
            request.session['authorized_share_links'] = authorized_links
            return Response({"message": "Password verified successfully."}, status=status.HTTP_200_OK)
        else:
            return Response(
                {"message": "Invalid password.", "protectionType": "password"},
                status=status.HTTP_401_UNAUTHORIZED
            )


class ShareLinkRequestAccessView(APIView):
    """
    Handles a viewer's request to access a link that requires an email.
    """
    # No permission_classes, as this is a public endpoint.

    def post(self, request, slug, *args, **kwargs):
        try:
            link = _get_active_share_link(slug)
        except NotFound as e:
            return Response({"message": e.detail}, status=status.HTTP_404_NOT_FOUND)

        if not link.requires_email:
            return Response(
                {"message": "This link does not require an email address."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = ShareLinkEmailSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['email']

        # Ensure viewer record exists for tracking purposes
        if link.document:
            organization = link.document.organization
        elif link.dataroom:
            organization = link.dataroom.organization
        else:
            # This case should be prevented by model constraints but is a safeguard.
            logger.error(f"ShareLink {link.id} has no document or dataroom associated.")
            return Response(
                {"message": "An unexpected error occurred: link target is missing."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        viewer, _ = Viewer.objects.get_or_create(
            organization=organization,
            email=email
        )

        if not link.requires_email_verification:
            # Just authorize the session and grant access immediately.
            authorized_links = request.session.get('authorized_share_links', {})
            if str(link.id) not in authorized_links:
                authorized_links[str(link.id)] = {}
            authorized_links[str(link.id)]['email_verified'] = True
            authorized_links[str(link.id)]['viewer_email'] = email
            request.session['authorized_share_links'] = authorized_links
            return Response({"message": "Access granted.", "verification_required": False}, status=status.HTTP_200_OK)
        else:
            # To prevent database bloat and user confusion from multiple valid links,
            # atomically delete any existing tokens for this email and link before creating a new one.
            EmailVerificationToken.objects.filter(share_link=link, email=email).delete()
            verification = EmailVerificationToken.objects.create(share_link=link, email=email)
            
            # Construct magic link URL
            access_url = urljoin(
                settings.SITE_DOMAIN,
                f"/view/{link.slug}?accessToken={verification.token}"
            )
            
            # Send email
            try:
                target_name = link.document.name if link.document else link.dataroom.name
                # In a real app, this would use an HTML template.
                email_body = (
                    f"Hello,\n\n"
                    f"Please click the link below to view '{target_name}'.\n\n"
                    f"{access_url}\n\n"
                    f"This link will expire in 15 minutes.\n\n"
                    f"Thank you."
                )
                send_mail(
                    subject=f"Verify your email to view '{target_name}'",
                    message=email_body,
                    from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@coneshare.com'),
                    recipient_list=[email],
                    fail_silently=False,
                )
            except Exception as e:
                logger.error(f"Failed to send verification email: {e}")
                return Response(
                    {"message": "Could not send verification email. Please try again later."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            return Response(
                {"message": "Verification link sent. Please check your email to continue.", "verification_required": True},
                status=status.HTTP_200_OK
            )


def _calculate_watermark_grid_params(page_width, page_height, rotated_tile_width, rotated_tile_height):
    """
    Calculates spacing and drawing range for a tiled watermark grid.
    This logic is shared between Pillow (image) and ReportLab (PDF) generation.
    """
    x_spacing = int(rotated_tile_width + page_width / 5)
    y_spacing = int(rotated_tile_height + page_height / 5)

    x_range = range(-int(rotated_tile_width), int(page_width) + x_spacing, x_spacing)
    y_range = range(-int(rotated_tile_height), int(page_height) + y_spacing, y_spacing)

    return {
        'x_range': x_range,
        'y_range': y_range,
    }


def _render_watermark_text(template_string: str, request, viewer_email: str = '') -> str:
    """Renders a watermark template string with dynamic variables."""
    ip_address = request.META.get('REMOTE_ADDR', 'N/A')
    email = viewer_email or 'N/A'
    # Add more variables here in the future if needed
    rendered_text = template_string.replace('{{ip-address}}', ip_address)
    rendered_text = rendered_text.replace('{{email}}', email)
    return rendered_text


class ShareLinkPageView(APIView):
    """
    Serves a single, non-watermarked page image for a document accessed
    via a public share link. It performs all necessary security checks
    for each page request and serves the file from storage.
    """
    def get(self, request, slug, page_number, *args, **kwargs):
        try:
            link = _get_active_share_link(slug)
        except NotFound as e:
            return Response({"message": e.detail}, status=status.HTTP_404_NOT_FOUND)

        # A simplified check; the main /view-data/ endpoint handles the full
        # sequential auth flow. This just ensures a session is authorized.
        authorized_links = request.session.get('authorized_share_links', {})
        print(authorized_links)
        if not authorized_links.get(str(link.id)):
            return Response(
                {"message": "Authorization required to view this content."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        document = None
        if link.dataroom:
            document_id = request.query_params.get('document_id')
            if not document_id:
                return Response({"message": "Document ID is required."}, status=status.HTTP_400_BAD_REQUEST)
            try:
                setting = link.dataroom_settings.get(
                    dataroom_document__document_id=document_id, is_visible=True
                )
                document = setting.dataroom_document.document
            except ShareLinkDataroomSetting.DoesNotExist:
                return Response({"message": "You do not have permission to view this document."}, status=status.HTTP_403_FORBIDDEN)
        elif link.document:
            document = link.document
        else:
            return Response({"message": "Invalid link target."}, status=status.HTTP_400_BAD_REQUEST)

        primary_version = document.versions.filter(is_primary=True).first()
        if not primary_version:
            return Response({"message": "Document version not found."}, status=status.HTTP_404_NOT_FOUND)

        source_image_key = None
        if document.type == 'image' and page_number == 1:
            source_image_key = primary_version.original_storage_key
        elif primary_version.has_pages:
            try:
                page = DocumentPage.objects.get(document_version=primary_version, page_number=page_number)
                source_image_key = page.storage_key
            except DocumentPage.DoesNotExist:
                return Response({"message": "Page not found."}, status=status.HTTP_404_NOT_FOUND)

        if not source_image_key:
            return Response({"message": "Source image for page not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            download_url = fileserver_client.generate_download_url(source_image_key, is_internal=False)
            return HttpResponseRedirect(download_url)
        except APIException as e:
            logger.error(f"Failed to get download URL from file server for {source_image_key}: {e}")
            return Response(
                {"detail": "Could not retrieve file. Please try again later."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class WatermarkedPageRenderView(APIView):
    """
    Dynamically renders a watermarked image for a document page.
    This is a public endpoint, but it checks for an active share link.
    """
    def get(self, request, slug, page_number, *args, **kwargs):
        if not Image:
            logger.error("Pillow is not installed. Watermarking is not available.")
            return Response(
                {"detail": "Watermarking service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        try:
            link = _get_active_share_link(slug)
        except NotFound as e:
            return Response({"message": e.detail}, status=status.HTTP_404_NOT_FOUND)

        if not link.enable_watermark or not link.watermark_text:
            return Response({"message": "Watermarking is not enabled for this link."}, status=status.HTTP_400_BAD_REQUEST)

        document = None
        if link.dataroom:
            document_id = request.query_params.get('document_id')
            if not document_id:
                return Response({"message": "Document ID is required."}, status=status.HTTP_400_BAD_REQUEST)
            try:
                # Security check: ensure the requested document is part of this dataroom
                # and is visible according to the link's settings.
                setting = link.dataroom_settings.get(
                    dataroom_document__document_id=document_id,
                    is_visible=True
                )
                document = setting.dataroom_document.document
            except ShareLinkDataroomSetting.DoesNotExist:
                return Response({"message": "You do not have permission to view this document."}, status=status.HTTP_403_FORBIDDEN)
        elif link.document:
            document = link.document
        else:
            return Response({"message": "Invalid link target."}, status=status.HTTP_400_BAD_REQUEST)

        primary_version = document.versions.filter(is_primary=True).first()

        if not primary_version:
            return Response({"message": "Document version not found."}, status=status.HTTP_404_NOT_FOUND)

        # Get source image
        source_image_key = None
        if document.type == 'image' and page_number == 1:
            source_image_key = primary_version.original_storage_key
        elif primary_version.has_pages:
            try:
                page = DocumentPage.objects.get(document_version=primary_version, page_number=page_number)
                source_image_key = page.storage_key
            except DocumentPage.DoesNotExist:
                return Response({"message": "Page not found."}, status=status.HTTP_404_NOT_FOUND)

        if not source_image_key:
            return Response({"message": "Source image for page not found."}, status=status.HTTP_404_NOT_FOUND)

        authorized_links = request.session.get('authorized_share_links', {})
        auth_status = authorized_links.get(str(link.id), {})
        viewer_email = auth_status.get('viewer_email', '')

        # Generate an ETag based on factors that would change the output image.
        ip_address = request.META.get('REMOTE_ADDR', '')
        etag_source = f"{source_image_key}-{link.updated_at.isoformat()}-{link.watermark_text}-{ip_address}-{viewer_email}"
        etag = hashlib.md5(etag_source.encode()).hexdigest()

        # Check against the If-None-Match header from the client.
        if_none_match = request.META.get('HTTP_IF_NONE_MATCH')
        if if_none_match and quote_etag(etag) == if_none_match:
            return HttpResponse(status=304)

        # Render watermark
        try:
            download_url = fileserver_client.generate_download_url(source_image_key, is_internal=True)
            response = requests.get(download_url)
            response.raise_for_status()
            image = Image.open(BytesIO(response.content)).convert("RGBA")

            watermark_text = _render_watermark_text(link.watermark_text, request, viewer_email=viewer_email)
            
            # Create a transparent layer for the text
            txt_layer = Image.new('RGBA', image.size, (255, 255, 255, 0))
            draw = ImageDraw.Draw(txt_layer)
            
            try:
                # TODO: A default font is usually available on most systems, but it's small.
                # For production, consider including a specific .ttf font file in the container.
                font_size = max(12, int(image.width / 40))
                font = ImageFont.truetype("DejaVuSans.ttf", size=font_size)
            except IOError:
                font = ImageFont.load_default()

            # --- Tiled & Rotated Watermark Logic ---
            # Measure text size
            text_bbox = draw.textbbox((0, 0), watermark_text, font=font)
            # Use the right and bottom coordinates of the bounding box for the tile size
            # to ensure the canvas is large enough for the font's internal bearings.
            text_width = text_bbox[2] - text_bbox[0]
            text_height = text_bbox[3] - text_bbox[1]

            text_tile = Image.new('RGBA', (text_width, text_height), (255, 255, 255, 0))
            text_tile_draw = ImageDraw.Draw(text_tile)

            # Draw at (0,0) - the text's internal offsets will place it correctly on this larger canvas.
            text_tile_draw.text((-text_bbox[0], -text_bbox[1]), watermark_text, font=font, fill=(0, 0, 0, 60))

            # Rotate the text tile. 'expand=True' makes the image larger to fit the rotated text.
            rotated_tile = text_tile.rotate(45, resample=Image.BICUBIC, expand=True)

            grid_params = _calculate_watermark_grid_params(
                page_width=image.width,
                page_height=image.height,
                rotated_tile_width=rotated_tile.width,
                rotated_tile_height=rotated_tile.height
            )

            # Tile the rotated watermark across the entire image layer
            for x in grid_params['x_range']:
                for y in grid_params['y_range']:
                    txt_layer.alpha_composite(rotated_tile, (x, y))  # USE alpha_composite instead of paste

            watermarked_image = Image.alpha_composite(image, txt_layer)

            # Save to buffer and return as response
            buffer = BytesIO()
            watermarked_image.convert("RGB").save(buffer, format="JPEG", quality=90)
            buffer.seek(0)

            response = HttpResponse(buffer.getvalue(), content_type="image/jpeg")
            response["Content-Length"] = str(len(buffer.getvalue()))
            response["Content-Disposition"] = f'inline; filename="{document.id}_page_{page_number}.jpg"'

            # Set caching headers with the new ETag
            response['ETag'] = quote_etag(etag)
            response['Cache-Control'] = 'public, max-age=60, must-revalidate'

            return response

        except Exception as e:
            logger.exception(f"Failed to apply watermark for page: {e}")
            return Response(
                {"message": "An error occurred while generating the watermark."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


def _generate_watermarked_pdf(document, primary_version, watermark_text, request, viewer_email):
    """
    Generates a watermarked PDF in-memory and returns it as a BytesIO buffer.
    """
    if not PdfReader or not canvas:
        missing = []
        if not PdfReader: missing.append("pypdf")
        if not canvas: missing.append("reportlab")
        logger.error(f"{', '.join(missing)} is not installed. PDF watermarking is not available.")
        raise WatermarkingDependenciesMissingError("PDF watermarking service is currently unavailable.")

    # Get source PDF. For office docs, use the converted PDF (storage_key). For PDFs, use original.
    if document.type == 'pdf':
        source_pdf_key = primary_version.original_storage_key
    elif document.type == 'document' and primary_version.storage_key:  # office doc that was converted
        source_pdf_key = primary_version.storage_key
    else:
        raise InvalidDocumentForWatermarkingError("A previewable PDF is not available for this document type.")

    try:
        download_url = fileserver_client.generate_download_url(source_pdf_key, is_internal=True)
        response = requests.get(download_url)
        response.raise_for_status()
        reader = PdfReader(BytesIO(response.content))
        writer = PdfWriter()

        if not reader.pages:
            raise InvalidDocumentForWatermarkingError("Cannot apply watermark to an empty PDF.")

        rendered_watermark_text = _render_watermark_text(watermark_text, request, viewer_email)

        # Create a watermark page in memory
        watermark_buffer = BytesIO()
        first_page_box = reader.pages[0].mediabox
        page_width, page_height = (float(first_page_box.width), float(first_page_box.height))

        # --- Logic mirrored from Pillow implementation ---
        font_size = max(12, int(page_width / 40))
        
        # Use a temporary canvas to get text dimensions
        temp_canvas = canvas.Canvas(BytesIO())
        temp_canvas.setFont("Helvetica", font_size)
        text_width = temp_canvas.stringWidth(rendered_watermark_text, "Helvetica", font_size)
        text_height = font_size  # Approximation

        # Calculate bounding box of rotated text
        rad_angle = 45 * (math.pi / 180)
        cos_a = math.cos(rad_angle)
        sin_a = math.sin(rad_angle)
        rotated_width = text_width * cos_a + text_height * sin_a
        rotated_height = text_width * sin_a + text_height * cos_a

        grid_params = _calculate_watermark_grid_params(
            page_width=page_width,
            page_height=page_height,
            rotated_tile_width=rotated_width,
            rotated_tile_height=rotated_height
        )

        # --- Create the actual watermark page ---
        p = canvas.Canvas(watermark_buffer, pagesize=(page_width, page_height))
        p.setFont("Helvetica", font_size)
        p.setFillColor(colors.black, alpha=0.1)

        # Draw rotated text at each grid position
        for x in grid_params['x_range']:
            for y in grid_params['y_range']:
                p.saveState()
                p.translate(x, y)
                p.rotate(45)
                p.drawCentredString(0, 0, rendered_watermark_text)
                p.restoreState()
        p.save()
        watermark_buffer.seek(0)
        
        watermark_pdf = PdfReader(watermark_buffer)
        watermark_page = watermark_pdf.pages[0]
        
        # Merge watermark onto each page
        for page in reader.pages:
            page.merge_page(watermark_page)
            writer.add_page(page)

        output_buffer = BytesIO()
        writer.write(output_buffer)
        output_buffer.seek(0)
        return output_buffer
    except Exception as e:
        logger.exception(f"Failed to apply watermark to PDF: {e}")
        raise WatermarkingError("An error occurred while generating the watermarked file.") from e


class WatermarkedFileDownloadView(APIView):
    """
    Dynamically generates and serves a watermarked PDF file for download.
    This is a public endpoint that checks for an active share link.
    """
    def get(self, request, slug, *args, **kwargs):
        try:
            link = _get_active_share_link(slug)
        except NotFound as e:
            return Response({"message": e.detail}, status=status.HTTP_404_NOT_FOUND)

        if not link.enable_watermark or not link.watermark_text:
            return Response({"message": "Watermarking is not enabled for this link."}, status=status.HTTP_400_BAD_REQUEST)

        document = None
        allow_download = False

        if link.dataroom:
            document_id = request.query_params.get('document_id')
            if not document_id:
                return Response({"message": "Document ID is required for dataroom downloads."}, status=status.HTTP_400_BAD_REQUEST)

            try:
                setting = link.dataroom_settings.get(dataroom_document__document_id=document_id)
                document = setting.dataroom_document.document
                allow_download = setting.allow_download
            except ShareLinkDataroomSetting.DoesNotExist:
                return Response({"message": "Document not found in this dataroom link."}, status=status.HTTP_404_NOT_FOUND)

        elif link.document:
            document = link.document
            allow_download = link.allow_download
        
        else:
            return Response({"message": "Invalid link target."}, status=status.HTTP_400_BAD_REQUEST)

        if not allow_download:
            return Response({"message": "Download is not allowed for this item."}, status=status.HTTP_403_FORBIDDEN)

        authorized_links = request.session.get('authorized_share_links', {})
        auth_status = authorized_links.get(str(link.id), {})
        viewer_email = auth_status.get('viewer_email', '')

        primary_version = document.versions.filter(is_primary=True).first()

        if not primary_version:
            return Response({"message": "Document version not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            pdf_buffer = _generate_watermarked_pdf(document, primary_version, link.watermark_text, request, viewer_email)
            response = HttpResponse(pdf_buffer, content_type='application/pdf')
            safe_filename = get_valid_filename(document.name)
            response['Content-Disposition'] = f'attachment; filename="{safe_filename}"'
            return response
        except WatermarkingDependenciesMissingError as e:
            return Response({"message": str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except InvalidDocumentForWatermarkingError as e:
            return Response({"message": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except WatermarkingError as e:
            logger.exception(f"A watermarking error occurred for link {slug}: {e}")
            return Response(
                {"message": "An error occurred while generating the watermarked file."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class DataroomFolderDownloadView(APIView):
    """
    Handles the download of an entire dataroom folder as a ZIP archive.
    """
    def _add_folder_to_zip(self, zipf, folder, current_path, link, request, viewer_email):
        """
        Recursively adds a folder's contents to the ZIP archive, respecting
        all visibility and permission settings.
        """
        # To avoid N+1 queries, fetch settings for all children at once.
        child_folders = folder.children.all()
        child_docs = DataroomDocument.objects.filter(folder=folder).select_related('document').prefetch_related('document__versions')

        settings_qs = ShareLinkDataroomSetting.objects.filter(share_link=link)
        folder_settings = {s.dataroom_folder_id: s for s in settings_qs.filter(dataroom_folder__in=child_folders)}
        doc_settings = {s.dataroom_document_id: s for s in settings_qs.filter(dataroom_document__in=child_docs)}
        
        for child_folder in child_folders:
            setting = folder_settings.get(child_folder.id)
            if setting and setting.is_visible:
                new_path = os.path.join(current_path, get_valid_filename(child_folder.name))
                zipf.writestr(new_path + '/', '')
                self._add_folder_to_zip(zipf, child_folder, new_path, link, request, viewer_email)

        for child_doc in child_docs:
            setting = doc_settings.get(child_doc.id)
            if setting and setting.is_visible and setting.allow_download:
                doc = child_doc.document
                primary_version = doc.versions.filter(is_primary=True).first()
                if not primary_version:
                    continue

                file_path = os.path.join(current_path, get_valid_filename(doc.name))
                
                try:
                    if setting.enable_watermark and link.watermark_text:
                        pdf_buffer = _generate_watermarked_pdf(doc, primary_version, link.watermark_text, request, viewer_email)
                        zipf.writestr(file_path, pdf_buffer.getvalue())
                    elif primary_version.original_storage_key:
                        storage_key = primary_version.original_storage_key
                        download_url = fileserver_client.generate_download_url(storage_key, is_internal=True)
                        response = requests.get(download_url)
                        response.raise_for_status()
                        zipf.writestr(file_path, response.content)
                except Exception as e:
                    logger.error(f"Failed to add file '{doc.name}' to zip for link '{link.slug}'. Error: {e}")

    def get(self, request, slug, folder_id, *args, **kwargs):
        is_preview = False
        preview_token = request.query_params.get('previewToken')
        if preview_token:
            try:
                with transaction.atomic():
                    session = PreviewSession.objects.select_related('user', 'share_link__created_by').select_for_update().get(token=preview_token)
                    if not session.is_expired() and session.share_link.slug == slug:
                        if session.user == session.share_link.created_by:
                            is_preview = True
                            request.session['preview_owner_email'] = session.user.email
                            session.delete()
            except PreviewSession.DoesNotExist:
                pass

        try:
            link = _get_active_share_link(slug)
        except NotFound as e:
            return Response({"message": e.detail}, status=status.HTTP_404_NOT_FOUND)

        if not is_preview:
            if link.expires_at and link.expires_at < timezone.now():
                return Response({"message": "This link has expired."}, status=status.HTTP_410_GONE)

            authorized_links = request.session.get('authorized_share_links', {})
            auth_status = authorized_links.get(str(link.id), {})

            if link.password and not auth_status.get('password_verified'):
                return Response(
                    {"message": "This link is password-protected.", "protectionType": "password"},
                    status=status.HTTP_401_UNAUTHORIZED
                )

            if link.requires_email and not auth_status.get('email_verified'):
                return Response(
                    {"message": "This link requires an email address to view.", "protectionType": "email"},
                    status=status.HTTP_401_UNAUTHORIZED
                )

        if not link.dataroom:
            return Response({"message": "This link is not for a dataroom."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            root_folder = DataroomFolder.objects.get(id=folder_id, dataroom=link.dataroom)
        except DataroomFolder.DoesNotExist:
            return Response({"message": "Folder not found in this dataroom."}, status=status.HTTP_404_NOT_FOUND)

        try:
            root_setting = link.dataroom_settings.get(dataroom_folder=root_folder)
            if not root_setting.allow_download:
                return Response({"message": "You are not allowed to download this folder."}, status=status.HTTP_403_FORBIDDEN)
        except ShareLinkDataroomSetting.DoesNotExist:
            return Response({"message": "Download permission not configured for this folder."}, status=status.HTTP_403_FORBIDDEN)

        view_session_id = request.query_params.get('view_session_id')
        if view_session_id:
            try:
                view_session = ViewSession.objects.get(id=view_session_id, share_link=link)
                if not view_session.downloaded_at:
                    view_session.downloaded_at = timezone.now()
                    view_session.save(update_fields=['downloaded_at'])
            except ViewSession.DoesNotExist:
                logger.warning(f"Could not find view session {view_session_id} for link {link.id} to record download.")

        authorized_links = request.session.get('authorized_share_links', {})
        auth_status = authorized_links.get(str(link.id), {})
        viewer_email = auth_status.get('viewer_email', '')

        zip_buffer = BytesIO()
        # TODO: For very large folders, creating the zip in-memory can consume a lot of RAM.
        # Consider replacing this with a streaming approach (e.g., using zipstream-ng)
        # to improve memory efficiency.
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            root_folder_name = get_valid_filename(root_folder.name)
            zipf.writestr(root_folder_name + '/', '')
            self._add_folder_to_zip(zipf, root_folder, root_folder_name, link, request, viewer_email)

        zip_buffer.seek(0)
        
        response = HttpResponse(zip_buffer, content_type='application/zip')
        response['Content-Disposition'] = f'attachment; filename="{get_valid_filename(root_folder.name)}.zip"'
        return response


class ViewerViewSet(viewsets.ModelViewSet):
    queryset = Viewer.objects.all()
    serializer_class = ViewerSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Viewer.objects.filter(organization=self.request.user.organization)


class ViewSessionViewSet(viewsets.ModelViewSet):
    queryset = ViewSession.objects.all()
    serializer_class = ViewSessionSerializer

    def get_permissions(self):
        """
        Allow anonymous users to create view sessions, but restrict
        all other actions to authenticated users.
        """
        if self.action in ['create', 'record_download']:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    @action(detail=True, methods=['post'], url_path='record-download')
    def record_download(self, request, pk=None):
        """Records that a document was downloaded during this view session."""
        try:
            view_session = ViewSession.objects.get(pk=pk)
            # Only record the first download
            if view_session.downloaded_at is None:
                view_session.downloaded_at = timezone.now()
                view_session.save(update_fields=['downloaded_at'])
            return Response(status=status.HTTP_200_OK)
        except ViewSession.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

    def get_queryset(self):
        return ViewSession.objects.filter(share_link__document__organization=self.request.user.organization)

    def perform_create(self, serializer):
        ip_address = self.request.META.get('REMOTE_ADDR')
        user_agent = self.request.META.get('HTTP_USER_AGENT', '')[:255]

        # Check for owner preview first, which takes precedence.
        preview_owner_email = self.request.session.pop('preview_owner_email', None)

        if preview_owner_email:
            viewer_email = preview_owner_email
        else:
            # Attempt to find a regular viewer's email from the session if they've been
            # authorized via an email-required link.
            share_link = serializer.validated_data.get('share_link')
            viewer_email = ''
            if share_link:
                authorized_links = self.request.session.get('authorized_share_links', {})
                auth_status = authorized_links.get(str(share_link.id), {})
                if auth_status.get('email_verified'):
                    viewer_email = auth_status.get('viewer_email')

        # GeoIP lookup
        location_data = {}
        if ip_address and settings.GEOIP:
            try:
                location_data = settings.GEOIP.city(ip_address)
            except AddressNotFoundError:
                pass  # Expected for local/private IPs
            except Exception as e:
                logger.error(f"GeoIP2 lookup failed: {e}")

        serializer.save(
            ip_address=ip_address,
            user_agent=user_agent,
            viewer_email=viewer_email,
            country=location_data.get('country_name', ''),
            city=location_data.get('city', ''),
            latitude=location_data.get('latitude'),
            longitude=location_data.get('longitude')
        )


class RecordPageView(APIView):
    """
    Receives and records granular page view tracking data.
    """
    # No permission_classes, as this is a public endpoint. Security is implicit
    # as it requires a valid, existing `view_id`.

    def post(self, request, *args, **kwargs):
        serializer = PageViewRecordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated_data = serializer.validated_data
        view_session = validated_data['view_session']
        duration = validated_data['duration_seconds']

        try:
            with transaction.atomic():
                # 1. Create the PageView record
                serializer.save()

                # 2. Atomically update the parent View's total duration to prevent race conditions.
                view_session.duration_seconds = F('duration_seconds') + duration

                # 3. Update completion rate
                document = view_session.share_link.document
                update_fields = ['duration_seconds']
                if document and document.num_pages and document.num_pages > 0:
                    viewed_pages_count = view_session.page_views.values('page_number').distinct().count()
                    completion_rate = viewed_pages_count / document.num_pages
                    view_session.completion_rate = min(completion_rate, 1.0)
                    update_fields.append('completion_rate')

                view_session.save(update_fields=update_fields)

            return Response({"message": "View recorded"}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error recording page view: {e}")
            return Response({"error": "Server error"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
