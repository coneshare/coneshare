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
from django.db.models import F, Sum, Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from geoip2.errors import AddressNotFoundError
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, NotFound, PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import Document, Folder, ShareLink, ShareLinkPreset, ViewSession, Viewer, PreviewSession, EmailVerificationToken
from .serializers import (
    DocumentSerializer,
    EnsureFolderPathsSerializer,
    FolderSerializer,
    PageViewRecordSerializer,
    ShareLinkEmailSerializer,
    ShareLinkPresetSerializer,
    ShareLinkSerializer,
    ViewerSerializer,
    ViewSessionSerializer,
)
from .services import (
    _get_unique_folder_name,
    create_document_from_upload,
    create_new_document_version,
    delete_document_and_files,
)


logger = logging.getLogger(__name__)


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


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
        parent = Folder.objects.get_root_for_org(requesting_user.organization)
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


def _get_active_share_link(slug: str) -> ShareLink:
    """
    Retrieves an active ShareLink by its slug, or raises an appropriate
    DRF exception if it's not found or inactive.
    """
    try:
        # select_related is an optimization for views that access link.document
        link = ShareLink.objects.select_related('document').get(slug=slug)
    except ShareLink.DoesNotExist:
        raise NotFound(detail="Link not found.")

    if not link.is_active:
        # Treat inactive links as "not found" from a public perspective.
        raise NotFound(detail="This file is not available.")

    return link


class EnsureFolderPathsView(APIView):
    """
    A view to ensure multiple folder paths exist, creating them if necessary.
    This is designed to be called once before a batch of folder uploads.
    It's atomic, ensuring that if any path fails, the whole transaction is rolled back.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = EnsureFolderPathsSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        paths = serializer.validated_data['paths']
        parent_path = serializer.validated_data.get('parent_path')
        requesting_user = request.user
        organization = requesting_user.organization

        # Determine the root folder for the operation. This could be the org's
        # root or a specific subfolder defined by parent_path.
        # TODO: N+1 query problem!
        try:
            if parent_path:
                path = Path(parent_path)
                current_folder = Folder.objects.get_root_for_org(organization)
                for part in path.parts:
                    current_folder = Folder.objects.get(
                        organization=organization,
                        name=part,
                        parent=current_folder,
                        created_by=requesting_user
                    )
                root_folder = current_folder
            else:
                root_folder = Folder.objects.get_root_for_org(organization)
        except Folder.DoesNotExist:
            return Response(
                {"detail": f"Parent path '{parent_path}' not found or you do not have permission to access it."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                # 1. Determine unique names for all top-level folders relative to the root_folder.
                top_level_dirs = {Path(p).parts[0] for p in paths if Path(p).parts}
                path_mappings = {}
                for original_name in top_level_dirs:
                    unique_name = _get_unique_folder_name(
                        created_by=requesting_user,
                        parent_folder=root_folder,
                        original_name=original_name
                    )
                    path_mappings[original_name] = unique_name

                # 2. Reconstruct all required paths with potentially renamed top-level folders.
                all_required_paths = set()
                for path_str in paths:
                    p = Path(path_str)
                    if not p.parts:
                        continue

                    original_top_level = p.parts[0]
                    renamed_top_level = path_mappings.get(original_top_level, original_top_level)

                    new_path_parts = [renamed_top_level] + list(p.parts[1:])
                    new_p = Path(*new_path_parts)

                    all_required_paths.add(str(new_p))
                    for parent in new_p.parents:
                        if parent != Path('.'):
                            all_required_paths.add(str(parent))

                # 3. Sort paths to ensure parents are processed before children
                sorted_paths = sorted(list(all_required_paths), key=lambda p: p.count(os.sep))

                # Keep track of created/verified folders to avoid redundant lookups
                path_to_folder_map = {'': root_folder}

                for path_str in sorted_paths:
                    path = Path(path_str)
                    parent_path_str = str(path.parent) if path.parent != Path('.') else ''

                    parent_folder = path_to_folder_map.get(parent_path_str)
                    if not parent_folder:
                        # This should not happen due to sorting, but as a safeguard.
                        return Response(
                            {"detail": f"An error occurred: parent folder for '{path_str}' not found."},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        )

                    # Permission check on the parent
                    if parent_folder.created_by is not None and parent_folder.created_by != requesting_user:
                        raise PermissionDenied(
                            {"detail": f"You do not have permission to create items in '{parent_path_str}'."},
                            status=status.HTTP_403_FORBIDDEN
                        )

                    folder_name = path.name
                    folder, created = Folder.objects.get_or_create(
                        organization=organization,
                        parent=parent_folder,
                        name=folder_name,
                        defaults={'created_by': requesting_user}
                    )

                    # If the folder already existed, verify ownership
                    if not created and folder.created_by != requesting_user:
                        raise PermissionDenied(
                            detail=f"You do not have permission to access or create subfolders in '{path_str}'."
                        )

                    path_to_folder_map[path_str] = folder

            return Response(
                {
                    "detail": "Folder structure ensured successfully.",
                    "path_mappings": path_mappings,
                },
                status=status.HTTP_201_CREATED
            )
        except PermissionDenied:
            # Re-raise to let DRF's exception handler create the 403 response.
            # The transaction is automatically rolled back when an exception
            # is raised from within the `atomic` block.
            raise
        except Folder.DoesNotExist:
            logger.error(f"Invisible root folder not found for user {requesting_user.id}'s organization")
            return Response(
                {"detail": "An unexpected error occurred: root folder missing."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except Exception:
            logger.exception("Failed to ensure folder paths exist for paths: %s", paths)
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
            "num_pages": document.num_pages,
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
            return Folder.objects.get_root_for_org(self.request.user.organization)
        except Folder.DoesNotExist:
            logger.error(f"Invisible root folder not found for organization {self.request.user.organization.id}")
            raise APIException("An unexpected error occurred: root folder missing.",
                               code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _get_folder_contents(self, folder, request):
        """Helper to fetch and serialize sub-folders and documents for a given folder."""
        sub_folders = folder.children.filter(created_by=request.user)
        documents = folder.documents.filter(created_by=request.user).prefetch_related(
            'versions', 'share_links', 'share_links__view_sessions'
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
        if parent and parent.created_by != self.request.user:
            raise serializers.ValidationError(
                {'parent': "You can only create subfolders in your own folders."}
            )

        if not parent:
            parent = self._get_root_folder()
        serializer.save(
            created_by=self.request.user,
            organization=self.request.user.organization,
            parent=parent
        )

    def perform_update(self, serializer):
        parent = serializer.validated_data.get('parent')
        if parent and parent.created_by != self.request.user:
            raise serializers.ValidationError(
                {'parent': "You can only move folders to destinations you own."}
            )
        serializer.save()


class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.all()
    serializer_class = DocumentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        This queryset is used for all actions. It ensures that users can only
        access documents they have created within their organization.
        Filtering by folder is handled in the `list` action.
        """
        return self.queryset.filter(
            organization=self.request.user.organization,
            created_by=self.request.user
        ).prefetch_related('versions', 'share_links', 'share_links__view_sessions')

    def list(self, request, *args, **kwargs):
        """
        Returns a list of documents for the currently authenticated user,
        optionally filtered by a parent folder.
        """
        queryset = self.get_queryset()
        organization = self.request.user.organization
        folder_id = self.request.query_params.get('folder')

        if folder_id:
            # Ensure the requested folder belongs to the user's org for security
            target_folder = get_object_or_404(Folder, id=folder_id, organization=organization)
        else:
            # Default to listing documents in the root folder
            target_folder = get_object_or_404(Folder, organization=organization, name='__root__', parent=None)

        queryset = queryset.filter(folder=target_folder)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        document = self.get_object()
        delete_document_and_files(document)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'], url_path='view-sessions')
    def view_sessions(self, request, pk=None):
        document = self.get_object()
        view_queryset = ViewSession.objects.filter(
            share_link__document=document
        ).order_by('-viewed_at').select_related('share_link').prefetch_related('page_views')

        # Optimization: pre-fetch all page image URLs for this document
        primary_version = document.versions.filter(is_primary=True).first()
        pages_map = {}
        if primary_version:
            if document.type == 'image':
                image_url = default_storage.url(primary_version.original_storage_key)
                pages_map[1] = urljoin(settings.SITE_DOMAIN, image_url)
            elif primary_version.has_pages:
                for page in primary_version.pages.values('page_number', 'storage_key').order_by('page_number'):
                    page_url = default_storage.url(page['storage_key'])
                    pages_map[page['page_number']] = urljoin(settings.SITE_DOMAIN, page_url)

        serializer_context = self.get_serializer_context()
        serializer_context['pages_map'] = pages_map

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(view_queryset, request, view=self)
        if page is not None:
            serializer = ViewSessionSerializer(page, many=True, context=serializer_context)
            return paginator.get_paginated_response(serializer.data)

        serializer = ViewSessionSerializer(view_queryset, many=True, context=serializer_context)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        document = self.get_object()
        aggregates = ViewSession.objects.filter(
            share_link__document=document
        ).aggregate(
            total_views=Count('id'),
            total_duration_seconds=Sum('duration_seconds'),
        )

        total_views = aggregates['total_views']
        total_duration = aggregates['total_duration_seconds'] or 0
        avg_duration = total_duration / total_views if total_views > 0 else 0

        return Response({
            'total_views': total_views,
            'total_duration_seconds': total_duration,
            'avg_duration_seconds': avg_duration,
        })


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
            if link.password_hash and not auth_status.get('password_verified'):
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

        # If all checks pass, proceed to fetch and return data.
        document = link.document
        primary_version = document.versions.filter(is_primary=True).first()

        if not primary_version or document.status != 'ready':
            return Response(
                {"message": "Document is not yet ready for viewing."},
                status=status.HTTP_400_BAD_REQUEST
            )

        pages_data = _prepare_pages_data(document, primary_version)

        download_url = None
        if document.type == 'image' and pages_data:
            # For images, the download URL is the same as the single page's URL.
            download_url = pages_data[0]['url']
        elif primary_version and primary_version.original_storage_key:
            file_url = default_storage.url(primary_version.original_storage_key)
            download_url = urljoin(settings.SITE_DOMAIN, file_url)

        response_data = {
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
                "allow_download": link.allow_download,
                "enable_watermark": link.enable_watermark,
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
            link = _get_active_share_link(slug)
        except NotFound as e:
            return Response({"message": e.detail}, status=status.HTTP_404_NOT_FOUND)

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
            # Password is correct. Store granular authorization in the session.
            authorized_links = request.session.get('authorized_share_links', {})
            if str(link.id) not in authorized_links:
                authorized_links[str(link.id)] = {}
            authorized_links[str(link.id)]['password_verified'] = True
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
        viewer, _ = Viewer.objects.get_or_create(
            organization=link.document.organization,
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
