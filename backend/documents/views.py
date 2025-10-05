import logging
import os
import secrets
from datetime import timedelta
from pathlib import Path
from urllib.parse import urljoin

from django.conf import settings
from django.core.mail import send_mail
from django.core.files.storage import default_storage
from django.contrib.auth.hashers import check_password
from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from geoip2.errors import AddressNotFoundError
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import Document, Folder, ShareLink, ShareLinkPreset, View, Viewer, PreviewSession, EmailVerificationToken
from .serializers import (
    DocumentSerializer,
    FolderFromPathSerializer,
    FolderSerializer,
    PageViewRecordSerializer,
    ShareLinkEmailSerializer,
    ShareLinkPresetSerializer,
    ShareLinkSerializer,
    ViewerSerializer,
    ViewSerializer,
)
from .services import (
    create_document_from_upload,
    create_new_document_version,
    delete_document_and_files,
)


logger = logging.getLogger(__name__)


def _get_folder_from_path(organization, folder_path: str) -> Folder | None:
    """
    Finds a folder based on a path string, starting from the organization's
    invisible root folder. Returns the final Folder instance or None if not found.
    """
    try:
        parent = Folder.objects.get(
            organization=organization, name='__root__', parent=None
        )
    except Folder.DoesNotExist:
        logger.error(f"Invisible root folder not found for organization {organization.id}")
        return None

    path = Path(folder_path)
    target_folder = parent
    for part in path.parts:
        try:
            target_folder = Folder.objects.get(
                organization=organization,
                name=part,
                parent=parent
            )
            parent = target_folder
        except Folder.DoesNotExist:
            return None
    return target_folder


def _get_or_create_folders_from_path(requesting_user, folder_path: str) -> Folder:
    """
    Recursively finds or creates folders from a path string, starting from the
    organization's invisible root folder. Returns the final Folder instance.
    """
    try:
        parent = Folder.objects.get(
            organization=requesting_user.organization, name='__root__', parent=None
        )
    except Folder.DoesNotExist:
        logger.error(f"Invisible root folder not found for user {requesting_user.id}'s organization")
        # This is a critical failure, as the root folder should always exist.
        # We will let this fail hard, which will result in a 500 error.
        raise

    path = Path(folder_path)
    for part in path.parts:
        folder, _ = Folder.objects.get_or_create(
            organization=requesting_user.organization,
            name=part,
            parent=parent,
            defaults={'created_by': requesting_user}
        )
        parent = folder
    return parent


class DocumentUploadView(APIView):
    """
    A dedicated view for handling file uploads and creating Document records.
    """
    parser_classes = (MultiPartParser,)
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response(
                {"detail": "No file provided."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Handle folder creation and filename override from path
        relative_path = request.POST.get('path')
        parent_folder = None

        if relative_path:
            folder_path, file_name_from_path = os.path.split(relative_path)
            if folder_path:
                parent_folder = _get_folder_from_path(
                    request.user.organization, folder_path
                )
                if parent_folder is None:
                    return Response(
                        {"detail": f"Folder path '{folder_path}' does not exist. Please ensure path is created first."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            if file_name_from_path:
                # Override the uploaded file's name if a name is provided in path
                file_obj.name = file_name_from_path

        try:
            document = create_document_from_upload(
                requesting_user=request.user,
                uploaded_file=file_obj,
                folder=parent_folder
            )
        except Exception as e:
            # In a real app, log this exception
            return Response(
                {"detail": f"Failed to start document processing: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        serializer = DocumentSerializer(document, context={'request': request})
        return Response(serializer.data, status=status.HTTP_202_ACCEPTED)


class FolderFromPathView(APIView):
    """
    A view to ensure a folder path exists, creating it if necessary.
    This is designed to be called once before a batch of uploads to a new folder.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = FolderFromPathSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        folder_path = serializer.validated_data['path']
        requesting_user = request.user

        # --- Permission Check ---
        try:
            parent = Folder.objects.get(
                organization=requesting_user.organization, name='__root__', parent=None
            )
        except Folder.DoesNotExist:
            logger.error(f"Invisible root folder not found for user {requesting_user.id}'s organization")
            return Response(
                {"detail": "An unexpected error occurred: root folder missing."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        path = Path(folder_path)
        for part in path.parts:
            try:
                folder = Folder.objects.get(
                    organization=requesting_user.organization,
                    name=part,
                    parent=parent
                )
                if folder.created_by != requesting_user:
                    return Response(
                        {"detail": f"You do not have permission to access or create subfolders in '{part}'."},
                        status=status.HTTP_403_FORBIDDEN
                    )
                parent = folder
            except Folder.DoesNotExist:
                # This part of the path doesn't exist, so we can stop checking.
                # The rest of the path will be created.
                break

        try:
            folder = _get_or_create_folders_from_path(
                requesting_user=requesting_user,
                folder_path=folder_path
            )
            folder_serializer = FolderSerializer(folder, context={'request': request})
            return Response(folder_serializer.data, status=status.HTTP_201_CREATED)
        except Exception:
            logger.exception("Failed to ensure folder path exists for path: %s", folder_path)
            return Response(
                {"detail": "An unexpected error occurred while creating the folder structure."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class DocumentVersionUploadView(APIView):
    """
    A dedicated view for uploading a new version of an existing document.
    """
    parser_classes = (MultiPartParser,)
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, document_id, *args, **kwargs):
        # 1. Authorize the user
        try:
            document = Document.objects.get(
                id=document_id,
                organization=request.user.organization,
                created_by=request.user
            )
        except Document.DoesNotExist:
            return Response(
                {"detail": "Access denied or document not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        uploaded_file = request.data.get('file')
        if not uploaded_file:
            return Response(
                {"detail": "No file provided"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 2. Delegate to the service layer
        try:
            create_new_document_version(
                document=document,
                uploaded_file=uploaded_file,
                requesting_user=request.user
            )
        except Exception as e:
            # In a real app, log this exception
            return Response(
                {"detail": f"Failed to start document processing: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        serializer = DocumentSerializer(document, context={'request': request})
        return Response(serializer.data, status=status.HTTP_202_ACCEPTED)


def _prepare_pages_data(document, primary_version):
    """
    Prepares a list of page data with absolute URLs for a given document version.
    Handles both image types and paginated document types.
    """
    pages_data = []
    if document.type == 'image':
        # For images, the preview is the original file itself.
        image_url = default_storage.url(primary_version.original_storage_key)
        absolute_url = urljoin(settings.SITE_DOMAIN, image_url)
        pages_data.append({
            'page_number': 1,
            'url': absolute_url,
            'metadata': {},
        })
    elif primary_version.has_pages:
        # For PDFs/Office docs, we have pre-generated page images.
        pages = primary_version.pages.order_by('page_number')
        for page in pages:
            page_url = default_storage.url(page.storage_key)
            absolute_url = urljoin(settings.SITE_DOMAIN, page_url)
            pages_data.append({
                "page_number": page.page_number,
                "url": absolute_url,
                "metadata": page.metadata,
            })
    return pages_data


class DocumentPreviewDataView(APIView):
    """
    Provides data for rendering an internal document preview.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, document_id, *args, **kwargs):
        # Authentication & Authorization is handled by DRF + this query
        try:
            document = Document.objects.get(
                id=document_id,
                organization=request.user.organization,
                created_by=request.user
            )
        except Document.DoesNotExist:
            return Response(
                {"detail": "Access denied or document not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Handle documents that are not ready for preview
        if document.status == 'processing':
            return Response(
                {"detail": "Document is still processing. Please wait and try again."},
                status=status.HTTP_400_BAD_REQUEST
            )
        elif document.status != 'ready':
             return Response(
                {"detail": "Document is not ready for preview."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Data Fetching
        primary_version = document.versions.filter(is_primary=True).first()
        if not primary_version:
            return Response(
                {"detail": "Document version not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Content Processing and Response Shaping
        pages_data = _prepare_pages_data(document, primary_version)

        response_data = {
            "id": document.id,
            "name": document.name,
            "type": document.type,
            "numPages": document.num_pages,
            "pages": pages_data,
        }

        return Response(response_data, status=status.HTTP_200_OK)


class FolderViewSet(viewsets.ModelViewSet):
    queryset = Folder.objects.all()
    serializer_class = FolderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def _get_root_folder(self):
        """Helper to get the organization's invisible root folder."""
        try:
            return Folder.objects.get(
                organization=self.request.user.organization,
                name='__root__',
                parent=None
            )
        except Folder.DoesNotExist:
            logger.error(f"Invisible root folder not found for organization {self.request.user.organization.id}")
            raise APIException("An unexpected error occurred: root folder missing.",
                               code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _get_folder_contents(self, folder, request):
        """Helper to fetch and serialize sub-folders and documents for a given folder."""
        sub_folders = folder.children.filter(created_by=request.user)
        documents = folder.documents.filter(created_by=request.user).prefetch_related(
            'versions', 'share_links', 'share_links__views'
        )

        sub_folders_serializer = self.get_serializer(sub_folders, many=True)
        documents_serializer = DocumentSerializer(documents, many=True, context={'request': request})

        return {
            'sub_folders': sub_folders_serializer.data,
            'documents': documents_serializer.data,
        }

    def list(self, request, *args, **kwargs):
        """
        Returns the contents of the user's root folder, including its
        subfolders and documents.
        """
        root_folder = self._get_root_folder()
        contents = self._get_folder_contents(root_folder, request)
        return Response({
            'current_folder': None,
            **contents,
        })

    def retrieve(self, request, *args, **kwargs):
        """
        Returns the contents of a specific folder, including its subfolders and documents.
        """
        instance = self.get_object()
        contents = self._get_folder_contents(instance, request)
        current_folder_serializer = self.get_serializer(instance)
        return Response({
            'current_folder': current_folder_serializer.data,
            **contents,
        })

    def get_queryset(self):
        """
        This queryset is used by get_object() to ensure users can only
        access folders they have created within their organization.
        """
        return self.queryset.filter(
            organization=self.request.user.organization,
            created_by=self.request.user
        )

    def perform_create(self, serializer):
        parent = serializer.validated_data.get('parent')
        if not parent:
            parent = self._get_root_folder()
        serializer.save(
            created_by=self.request.user,
            organization=self.request.user.organization,
            parent=parent
        )


class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.all()
    serializer_class = DocumentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        This view should return a list of documents for the currently
        authenticated user, optionally filtered by a parent folder.
        """
        organization = self.request.user.organization
        folder_id = self.request.query_params.get('folder')

        if folder_id:
            # Ensure the requested folder belongs to the user's org for security
            target_folder = get_object_or_404(Folder, id=folder_id, organization=organization)
        else:
            # Default to listing documents in the root folder
            target_folder = get_object_or_404(Folder, organization=organization, name='__root__', parent=None)

        return self.queryset.filter(
            organization=organization,
            created_by=self.request.user,
            folder=target_folder
        ).prefetch_related('versions', 'share_links', 'share_links__views')

    def destroy(self, request, *args, **kwargs):
        document = self.get_object()
        delete_document_and_files(document)
        return Response(status=status.HTTP_204_NO_CONTENT)


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
        return ShareLink.objects.filter(created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='preview')
    def create_preview_session(self, request, pk=None):
        """
        Creates a short-lived, single-use preview session for the share link owner.
        """
        share_link = self.get_object()  # This correctly uses the scoped get_queryset

        # Clean up any old, expired sessions for this link to prevent clutter
        share_link.preview_sessions.filter(expires_at__lt=timezone.now()).delete()

        session = share_link.preview_sessions.create(
            user=request.user,
            token=secrets.token_urlsafe(32),
            expires_at=timezone.now() + timedelta(minutes=5)
        )
        return Response({'previewToken': session.token}, status=status.HTTP_201_CREATED)


class ViewerViewSet(viewsets.ModelViewSet):
    queryset = Viewer.objects.all()
    serializer_class = ViewerSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Viewer.objects.filter(organization=self.request.user.organization)


class ViewViewSet(viewsets.ModelViewSet):
    queryset = View.objects.all()
    serializer_class = ViewSerializer

    def get_permissions(self):
        """
        Allow anonymous users to create view sessions, but restrict
        all other actions to authenticated users.
        """
        if self.action == 'create':
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        return View.objects.filter(share_link__document__organization=self.request.user.organization)

    def perform_create(self, serializer):
        ip_address = self.request.META.get('REMOTE_ADDR')
        user_agent = self.request.META.get('HTTP_USER_AGENT', '')[:255]

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
            country=location_data.get('country_name', ''),
            city=location_data.get('city', ''),
            latitude=location_data.get('latitude'),
            longitude=location_data.get('longitude')
        )


def is_viewer_authorized(request, link) -> bool:
    """
    Checks if the current session is authorized to view a protected link
    (e.g., password or email required).
    """
    # 1. Check if the link has any protection enabled.
    is_protected = link.password_hash or link.requires_email
    if not is_protected:
        return True  # Not protected, so implicitly authorized.

    # 2. If protected, check if the session has been granted authorization.
    authorized_links = request.session.get('authorized_share_links', {})
    # Check if the link's ID is in the authorized dictionary and its value is True
    return authorized_links.get(str(link.id)) is True


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
                            session.delete()  # Invalidate token after use
            except PreviewSession.DoesNotExist:
                # Token is invalid, proceed with normal access checks.
                pass

        try:
            link = ShareLink.objects.select_related('document').get(slug=slug, is_archived=False)
        except ShareLink.DoesNotExist:
            return Response({"message": "Link not found or has been archived."}, status=status.HTTP_404_NOT_FOUND)

        if access_token:
            try:
                with transaction.atomic():
                    verification = EmailVerificationToken.objects.select_for_update().get(token=access_token)
                    if not verification.is_expired() and verification.share_link == link:
                        # Authorize the session
                        authorized_links = request.session.get('authorized_share_links', {})
                        authorized_links[str(link.id)] = True
                        request.session['authorized_share_links'] = authorized_links
                        verification.delete()
            except EmailVerificationToken.DoesNotExist:
                pass  # Token is invalid, proceed with normal checks.

        # --- SERVER-SIDE ACCESS CONTROL ---
        if not is_preview:
            # 1. Check for expiration
            if link.expires_at and link.expires_at < timezone.now():
                return Response({"message": "This link has expired."}, status=status.HTTP_410_GONE)

            # 2. Check for protection if not authorized
            is_protected = link.password_hash or link.requires_email
            if is_protected and not is_viewer_authorized(request, link):
                if link.password_hash:
                    return Response(
                        {"message": "This link is password-protected. Please enter the password to continue.", "protectionType": "password"},
                        status=status.HTTP_401_UNAUTHORIZED
                    )
                # This will be caught if password is not set but email is required.
                return Response(
                    {"message": "This link requires an email address to view.", "protectionType": "email"},
                    status=status.HTTP_401_UNAUTHORIZED
                )

        # If all checks pass, proceed to fetch and return data.
        document = link.document
        primary_version = document.versions.filter(is_primary=True).first()

        if not primary_version or document.status != 'ready':
            return Response(
                {"message": "Document is not yet ready for viewing."},
                status=status.HTTP_400_BAD_REQUEST
            )

        pages_data = _prepare_pages_data(document, primary_version)

        response_data = {
            "id": document.id,
            "name": document.name,
            "type": document.type,
            "numPages": document.num_pages,
            "pages": pages_data,
            "linkSettings": {
                "id": link.id,
                "allowDownload": link.allow_download,
                "enableWatermark": link.enable_watermark,
            }
        }
        return Response(response_data, status=status.HTTP_200_OK)


class ShareLinkPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)


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
            link = ShareLink.objects.get(slug=slug, is_archived=False)
        except ShareLink.DoesNotExist:
            return Response({"message": "Link not found."}, status=status.HTTP_404_NOT_FOUND)

        if not link.password_hash:
            return Response(
                {"message": "This link is not password protected."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = ShareLinkPasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        password = serializer.validated_data['password']
        if check_password(password, link.password_hash):
            # Password is correct. Store authorization in the session.
            # Using a dictionary for authorized links to support multiple links in one session.
            authorized_links = request.session.get('authorized_share_links', {})
            authorized_links[str(link.id)] = True
            request.session['authorized_share_links'] = authorized_links
            return Response({"message": "Password verified successfully."}, status=status.HTTP_200_OK)
        else:
            return Response({"message": "Invalid password."}, status=status.HTTP_401_UNAUTHORIZED)


class ShareLinkRequestAccessView(APIView):
    """
    Handles a viewer's request to access a link that requires an email.
    """
    # No permission_classes, as this is a public endpoint.

    def post(self, request, slug, *args, **kwargs):
        try:
            link = ShareLink.objects.get(slug=slug, is_archived=False)
        except ShareLink.DoesNotExist:
            return Response({"message": "Link not found."}, status=status.HTTP_404_NOT_FOUND)

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
        viewer, _ = Viewer.objects.get_or_create(
            organization=link.document.organization,
            email=email
        )

        if not link.requires_email_verification:
            # Just authorize the session and grant access immediately.
            authorized_links = request.session.get('authorized_share_links', {})
            authorized_links[str(link.id)] = True
            request.session['authorized_share_links'] = authorized_links
            return Response({"message": "Access granted.", "verification_required": False}, status=status.HTTP_200_OK)
        else:
            # Create a verification token and send the magic link email.
            verification = EmailVerificationToken.objects.create(share_link=link, email=email)
            
            # Construct magic link URL
            access_url = urljoin(
                settings.SITE_DOMAIN,
                f"/view/{link.slug}?accessToken={verification.token}"
            )
            
            # Send email
            try:
                # In a real app, this would use an HTML template.
                email_body = (
                    f"Hello,\n\n"
                    f"Please click the link below to view the document '{link.document.name}'.\n\n"
                    f"{access_url}\n\n"
                    f"This link will expire in 15 minutes.\n\n"
                    f"Thank you."
                )
                send_mail(
                    subject=f"Verify your email to view '{link.document.name}'",
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
        view = validated_data['view']
        duration = validated_data['duration_seconds']

        try:
            with transaction.atomic():
                # 1. Create the PageView record
                serializer.save()

                # 2. Atomically update the parent View's total duration to prevent race conditions.
                view.duration_seconds = F('duration_seconds') + duration

                # 3. Update completion rate
                document = view.share_link.document
                update_fields = ['duration_seconds']
                if document and document.num_pages and document.num_pages > 0:
                    viewed_pages_count = view.page_views.values('page_number').distinct().count()
                    completion_rate = viewed_pages_count / document.num_pages
                    view.completion_rate = min(completion_rate, 1.0)
                    update_fields.append('completion_rate')

                view.save(update_fields=update_fields)

            return Response({"message": "View recorded"}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error recording page view: {e}")
            return Response({"error": "Server error"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
