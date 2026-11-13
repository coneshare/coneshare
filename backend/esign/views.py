from __future__ import annotations

from django.core import signing
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.utils import get_client_ip
from core.models import APIKey
from datarooms.models import Dataroom, DataroomDocument
from documents.models import Document, DocumentVersion

from .models import SignatureAuditTrail, SignatureField, SignatureRequest, Signer, SignerPageView
from .serializers import (
    SignatureFieldSerializer,
    SignatureRequestCreateSerializer,
    SignatureRequestSerializer,
    SignerDeclineSerializer,
    SignerPageViewInputSerializer,
    SignerPageViewSummarySerializer,
    SignerSerializer,
    SignerSubmitSerializer,
    SignerTokenExchangeSerializer,
    VoidRequestSerializer,
)
from .services import (
    create_signature_request,
    decline_signature_request,
    download_storage_bytes,
    send_signature_request,
    submit_signer_fields,
    void_signature_request,
)
from .tasks import build_signer_signing_url
from .vault import build_rfc6266_attachment_header, build_rfc6266_content_disposition

SIGNER_COOKIE_PREFIX = 'esign_signer_'
SIGNER_COOKIE_SALT = 'esign.signer.session'
SIGNER_COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days


def _signer_cookie_name(request_id: str) -> str:
    return f"{SIGNER_COOKIE_PREFIX}{request_id}"


def _issue_signer_cookie(response: Response, request_id: str, signer_id: str) -> None:
    signer = signing.TimestampSigner(salt=SIGNER_COOKIE_SALT)
    token = signer.sign(f"{request_id}:{signer_id}")
    response.set_cookie(
        key=_signer_cookie_name(request_id),
        value=token,
        max_age=SIGNER_COOKIE_MAX_AGE,
        httponly=True,
        samesite='Lax',
    )


def _resolve_signer_from_request(request, request_id: str) -> Signer:
    raw_cookie = request.COOKIES.get(_signer_cookie_name(request_id))
    if not raw_cookie:
        raise PermissionDenied("Signer session cookie is missing or expired.")

    signer_util = signing.TimestampSigner(salt=SIGNER_COOKIE_SALT)
    try:
        unsigned = signer_util.unsign(raw_cookie, max_age=SIGNER_COOKIE_MAX_AGE)
    except signing.BadSignature:
        raise PermissionDenied("Invalid or expired signer session.")

    if ':' not in unsigned:
        raise PermissionDenied("Malformed signer session.")
    cookie_req_id, cookie_signer_id = unsigned.split(':', 1)
    if cookie_req_id != str(request_id):
        raise PermissionDenied("Signer session does not match this signature request.")

    signer_obj = Signer.objects.select_related('request', 'request__document', 'request__document_version').filter(
        id=cookie_signer_id,
        request_id=request_id,
    ).first()
    if not signer_obj:
        raise PermissionDenied("Signer not found for this request.")
    return signer_obj


@extend_schema(tags=['esign'])
class SignatureRequestViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    Authenticated owner & API management surface for native SignatureRequests.
    Inherits global DEFAULT_PERMISSION_CLASSES (IsAuthenticated + APIKeyTierPermission).
    """
    serializer_class = SignatureRequestSerializer

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return SignatureRequest.objects.none()
        qs = SignatureRequest.objects.filter(
            organization=user.organization
        ).select_related('document', 'document_version', 'dataroom', 'created_by').prefetch_related(
            'signers', 'fields', 'fields__signer', 'audit_events', 'audit_events__signer'
        )
        if getattr(user, 'role', '') != 'admin':
            qs = qs.filter(created_by=user)

        dataroom_id = self.request.query_params.get('dataroom_id')
        if dataroom_id:
            qs = qs.filter(dataroom_id=dataroom_id)
        document_id = self.request.query_params.get('document_id')
        if document_id:
            qs = qs.filter(document_id=document_id)
        return qs

    @extend_schema(request=SignatureRequestCreateSerializer, responses={201: SignatureRequestSerializer})
    def create(self, request, *args, **kwargs):
        serializer = SignatureRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        document = get_object_or_404(
            Document,
            id=data['document'],
            organization=request.user.organization,
            deleted_at__isnull=True,
        )
        dataroom = None
        if data.get('dataroom'):
            dataroom = get_object_or_404(Dataroom, id=data['dataroom'], organization=request.user.organization)
            is_room_member = (
                getattr(request.user, 'role', '') == 'admin'
                or dataroom.created_by_id == request.user.id
                or dataroom.collaborators.filter(user=request.user).exists()
            )
            if not is_room_member:
                raise PermissionDenied("You do not have permission to access this dataroom.")

        is_org_admin = getattr(request.user, 'role', '') == 'admin'
        if not is_org_admin and document.created_by_id != request.user.id:
            in_member_room = bool(
                dataroom and DataroomDocument.objects.filter(dataroom=dataroom, document=document).exists()
            )
            if not in_member_room:
                raise PermissionDenied("You do not have permission to send signatures for this document.")

        version_id = data.get('document_version')
        if version_id:
            doc_version = get_object_or_404(DocumentVersion, id=version_id, document=document)
        else:
            doc_version = document.versions.filter(is_primary=True).first()
            if not doc_version:
                raise ValidationError({'document_version': 'No primary version found for this document.'})

        sig_req, created = create_signature_request(
            owner=request.user,
            document=document,
            document_version=doc_version,
            title=data.get('title') or document.name,
            signers_data=data['signers'],
            fields_data=data['fields'],
            dataroom=dataroom,
            message=data.get('message', ''),
            signing_mode=data.get('signing_mode', SignatureRequest.MODE_DIRECT),
            signing_order=data.get('signing_order', SignatureRequest.ORDER_PARALLEL),
            seal_method=data.get('seal_method', 'visual_hash'),
            idempotency_key=data.get('idempotency_key', ''),
            expires_at=data.get('expires_at'),
        )
        sig_req = self.get_queryset().get(pk=sig_req.pk)
        out = SignatureRequestSerializer(sig_req, context=self.get_serializer_context())
        return Response(out.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def perform_destroy(self, instance: SignatureRequest):
        if instance.status not in (SignatureRequest.STATUS_DRAFT, SignatureRequest.STATUS_VOIDED):
            raise ValidationError(
                {'detail': 'Only draft or voided signature requests can be deleted.'},
                code='invalid_state',
            )
        instance.delete()

    @action(detail=True, methods=['post'], url_path='send')
    def send(self, request, pk=None):
        """
        Human-only dispatch boundary: APIKey/Agent clients can draft signature requests
        but require human JWT confirmation to send invitations externally.
        """
        if isinstance(request.auth, APIKey):
            return Response(
                {'detail': 'External signature dispatch requires human JWT confirmation.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        instance = self.get_object()
        updated = send_signature_request(
            str(instance.id),
            request.user,
            ip_address=get_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        updated = self.get_queryset().get(pk=updated.pk)
        return Response(SignatureRequestSerializer(updated, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['post'], url_path='void')
    def void(self, request, pk=None):
        instance = self.get_object()
        serializer = VoidRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = void_signature_request(
            str(instance.id),
            request.user,
            reason=serializer.validated_data.get('reason', ''),
            ip_address=get_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        updated = self.get_queryset().get(pk=updated.pk)
        return Response(SignatureRequestSerializer(updated, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['get'], url_path='signing-links')
    def signing_links(self, request, pk=None):
        """Returns direct #token signing URLs strictly to human owners/admins (never to API keys)."""
        if isinstance(request.auth, APIKey):
            return Response(
                {'detail': 'API keys are not permitted to read signer access tokens.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        instance = self.get_object()
        links = [
            {
                'signer_id': str(s.id),
                'email': s.email,
                'name': s.name,
                'status': s.status,
                'order_index': s.order_index,
                'signing_url': build_signer_signing_url(str(instance.id), s.access_token),
            }
            for s in instance.signers.order_by('order_index', 'created_at')
        ]
        return Response({'results': links})

    @action(detail=True, methods=['get'], url_path='page-views')
    def page_views(self, request, pk=None):
        instance = self.get_object()
        views_qs = SignerPageView.objects.filter(request=instance).select_related('signer').order_by('created_at')
        return Response({'results': SignerPageViewSummarySerializer(views_qs, many=True).data})

    @action(detail=True, methods=['get'], url_path='download')
    def download(self, request, pk=None):
        instance = self.get_object()
        if not instance.completed_file_storage_key:
            return Response(
                {'detail': 'Executed PDF is not available until signing is completed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pdf_bytes = download_storage_bytes(instance.completed_file_storage_key)
        doc_stem = instance.document.name.rsplit('.', 1)[0]
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = build_rfc6266_attachment_header(f"{doc_stem}_signed.pdf")
        return response


@extend_schema(tags=['esign-public'])
class SignerExchangeTokenView(APIView):
    """
    Exchanges a `#token=...` signer secret sent exclusively via POST JSON body
    for an HttpOnly, SameSite=Lax signer cookie.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(request=SignerTokenExchangeSerializer, responses={200: dict, 403: dict, 404: dict})
    def post(self, request, request_id: str, *args, **kwargs):
        serializer = SignerTokenExchangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data['token']

        signer_obj = Signer.objects.select_related('request', 'request__document').filter(
            request_id=request_id,
            access_token=token,
        ).first()
        if not signer_obj:
            return Response({'detail': 'Invalid signing token.'}, status=status.HTTP_403_FORBIDDEN)

        sig_req = signer_obj.request
        if sig_req.status == SignatureRequest.STATUS_VOIDED:
            return Response({'detail': 'This signature request has been voided.'}, status=status.HTTP_410_GONE)
        if sig_req.expires_at and sig_req.expires_at < timezone.now():
            return Response({'detail': 'This signature request has expired.'}, status=status.HTTP_410_GONE)

        ip_address = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', '')[:255]
        if signer_obj.status in (Signer.STATUS_PENDING, Signer.STATUS_NOTIFIED):
            signer_obj.status = Signer.STATUS_VIEWED
            signer_obj.save(update_fields=['status', 'updated_at'])
            SignatureAuditTrail.objects.create(
                request=sig_req,
                signer=signer_obj,
                event_type=SignatureAuditTrail.EVENT_VIEWED,
                ip_address=ip_address,
                user_agent=user_agent,
                details={'signer_email': signer_obj.email},
            )

        resp = Response({
            'message': 'Signer session initialized.',
            'request_id': str(sig_req.id),
            'signer_id': str(signer_obj.id),
        })
        _issue_signer_cookie(resp, str(sig_req.id), str(signer_obj.id))
        return resp


def _build_public_signer_session_payload(signer_obj: Signer) -> dict:
    sig_req = signer_obj.request
    signer_fields = SignatureField.objects.filter(request=sig_req, signer=signer_obj).order_by('page_number', 'y', 'x')
    return {
        'request': {
            'id': str(sig_req.id),
            'title': sig_req.title,
            'message': sig_req.message,
            'status': sig_req.status,
            'signing_order': sig_req.signing_order,
            'current_order_index': sig_req.current_order_index,
            'document_name': sig_req.document.name,
            'completed_at': sig_req.completed_at,
            'completed_file_sha256': sig_req.completed_file_sha256,
            'has_completed_pdf': bool(sig_req.completed_file_storage_key),
        },
        'signer': SignerSerializer(signer_obj).data,
        'fields': SignatureFieldSerializer(signer_fields, many=True).data,
        'pdf_url': f"/api/v1/esign/sign/{sig_req.id}/pdf/",
        'download_url': f"/api/v1/esign/sign/{sig_req.id}/download/" if sig_req.completed_file_storage_key else None,
    }


def _check_signer_request_availability(
    sig_req: SignatureRequest,
    *,
    reject_voided: bool = False,
    require_active_status: bool = False,
) -> Response | None:
    """Enforces consistent expiration and lifecycle state checks for cookie-authenticated signer views."""
    if reject_voided and sig_req.status == SignatureRequest.STATUS_VOIDED:
        return Response({'detail': 'This signature request has been voided.'}, status=status.HTTP_410_GONE)
    if sig_req.expires_at and sig_req.expires_at < timezone.now():
        return Response({'detail': 'This signature request has expired.'}, status=status.HTTP_410_GONE)
    if require_active_status and sig_req.status not in (
        SignatureRequest.STATUS_SENT,
        SignatureRequest.STATUS_IN_PROGRESS,
    ):
        return Response(
            {'detail': f"Cannot perform this action in '{sig_req.status}' status."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


@extend_schema(tags=['esign-public'], responses=OpenApiTypes.OBJECT)
class SignerSessionDetailView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request, request_id: str, *args, **kwargs):
        signer_obj = _resolve_signer_from_request(request, request_id)
        err_resp = _check_signer_request_availability(signer_obj.request)
        if err_resp is not None:
            return err_resp
        return Response(_build_public_signer_session_payload(signer_obj))


@extend_schema(tags=['esign-public'], responses={(200, 'application/pdf'): OpenApiTypes.BINARY})
class SignerDocumentPdfView(APIView):
    """Streams the pinned source (or completed) PDF bytes to an authenticated signer cookie session."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request, request_id: str, *args, **kwargs):
        signer_obj = _resolve_signer_from_request(request, request_id)
        sig_req = signer_obj.request
        err_resp = _check_signer_request_availability(sig_req, reject_voided=True)
        if err_resp is not None:
            return err_resp

        storage_key = sig_req.completed_file_storage_key or (
            sig_req.document_version.original_storage_key or sig_req.document_version.storage_key
        )
        if not storage_key:
            return Response({'detail': 'Source PDF is unavailable.'}, status=status.HTTP_404_NOT_FOUND)

        pdf_bytes = download_storage_bytes(storage_key)
        doc_name = sig_req.document.name if sig_req.document else 'document.pdf'
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = build_rfc6266_content_disposition(
            doc_name, fallback='document.pdf', disposition='inline'
        )
        return response


@extend_schema(tags=['esign-public'])
class SignerSubmitView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(request=SignerSubmitSerializer, responses={200: dict})
    def post(self, request, request_id: str, *args, **kwargs):
        signer_obj = _resolve_signer_from_request(request, request_id)
        serializer = SignerSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        updated_req = submit_signer_fields(
            signer_obj,
            serializer.validated_data['fields'],
            ip_address=get_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        signer_obj.refresh_from_db()
        signer_obj.request = updated_req
        return Response(_build_public_signer_session_payload(signer_obj))


@extend_schema(tags=['esign-public'])
class SignerDeclineView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(request=SignerDeclineSerializer, responses={200: dict})
    def post(self, request, request_id: str, *args, **kwargs):
        signer_obj = _resolve_signer_from_request(request, request_id)
        serializer = SignerDeclineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated_req = decline_signature_request(
            signer_obj,
            reason=serializer.validated_data.get('reason', ''),
            ip_address=get_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        signer_obj.refresh_from_db()
        signer_obj.request = updated_req
        return Response(_build_public_signer_session_payload(signer_obj))


@extend_schema(tags=['esign-public'])
class SignerPageViewRecordView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(request=SignerPageViewInputSerializer, responses={201: dict})
    def post(self, request, request_id: str, *args, **kwargs):
        signer_obj = _resolve_signer_from_request(request, request_id)
        err_resp = _check_signer_request_availability(
            signer_obj.request, reject_voided=True, require_active_status=True
        )
        if err_resp is not None:
            return err_resp
        serializer = SignerPageViewInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        pv = SignerPageView.objects.create(
            request=signer_obj.request,
            signer=signer_obj,
            page_number=serializer.validated_data['page_number'],
            duration_seconds=serializer.validated_data['duration_seconds'],
        )
        return Response({'id': str(pv.id)}, status=status.HTTP_201_CREATED)


@extend_schema(tags=['esign-public'], responses={(200, 'application/pdf'): OpenApiTypes.BINARY})
class SignerExecutedDownloadView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request, request_id: str, *args, **kwargs):
        signer_obj = _resolve_signer_from_request(request, request_id)
        sig_req = signer_obj.request
        if not sig_req.completed_file_storage_key:
            return Response({'detail': 'Executed PDF is not yet ready.'}, status=status.HTTP_400_BAD_REQUEST)

        pdf_bytes = download_storage_bytes(sig_req.completed_file_storage_key)
        doc_stem = sig_req.document.name.rsplit('.', 1)[0]
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = build_rfc6266_attachment_header(f"{doc_stem}_signed.pdf")
        return response
