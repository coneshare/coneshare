import re
from datetime import date

from rest_framework import serializers

from documents.models import Folder
from .models import FileRequest, UploadedFile


CUSTOM_FIELD_TYPES = {'text', 'textarea', 'select', 'date', 'number', 'checkbox'}
CUSTOM_FIELD_ID_RE = re.compile(r'^[a-zA-Z][a-zA-Z0-9_]{0,63}$')
MAX_CUSTOM_FIELDS = 20
MAX_CUSTOM_FIELD_LABEL_LENGTH = 80
MAX_CUSTOM_FIELD_PLACEHOLDER_LENGTH = 120
MAX_CUSTOM_FIELD_OPTION_LENGTH = 80
MAX_CUSTOM_FIELD_OPTIONS = 50
MAX_TEXT_VALUE_LENGTH = 1000
MAX_TEXTAREA_VALUE_LENGTH = 5000


def validate_custom_field_schema(custom_fields):
    if custom_fields in (None, ''):
        return []
    if not isinstance(custom_fields, list):
        raise serializers.ValidationError('Custom fields must be a list.')
    if len(custom_fields) > MAX_CUSTOM_FIELDS:
        raise serializers.ValidationError(f'At most {MAX_CUSTOM_FIELDS} custom fields are supported.')

    seen_ids = set()
    normalized_fields = []
    for index, field in enumerate(custom_fields):
        if not isinstance(field, dict):
            raise serializers.ValidationError(f'Custom field #{index + 1} must be an object.')

        field_id = str(field.get('id') or '').strip()
        label = str(field.get('label') or '').strip()
        field_type = str(field.get('type') or '').strip()
        placeholder = str(field.get('placeholder') or '').strip()
        required = bool(field.get('required', False))

        if not field_id:
            raise serializers.ValidationError(f'Custom field #{index + 1} requires an id.')
        if not CUSTOM_FIELD_ID_RE.match(field_id):
            raise serializers.ValidationError(
                f'Custom field "{field_id}" has an invalid id. Use letters, numbers, and underscores; start with a letter.'
            )
        if field_id in seen_ids:
            raise serializers.ValidationError(f'Custom field id "{field_id}" is duplicated.')
        seen_ids.add(field_id)

        if not label:
            raise serializers.ValidationError(f'Custom field "{field_id}" requires a label.')
        if len(label) > MAX_CUSTOM_FIELD_LABEL_LENGTH:
            raise serializers.ValidationError(f'Custom field "{field_id}" label is too long.')
        if field_type not in CUSTOM_FIELD_TYPES:
            raise serializers.ValidationError(
                f'Custom field "{field_id}" has unsupported type "{field_type}".'
            )
        if len(placeholder) > MAX_CUSTOM_FIELD_PLACEHOLDER_LENGTH:
            raise serializers.ValidationError(f'Custom field "{field_id}" placeholder is too long.')

        normalized = {
            'id': field_id,
            'label': label,
            'type': field_type,
            'required': required,
        }
        if placeholder:
            normalized['placeholder'] = placeholder

        if field_type == 'select':
            options = field.get('options')
            if not isinstance(options, list):
                raise serializers.ValidationError(f'Custom field "{field_id}" requires an options list.')
            normalized_options = []
            for option in options:
                option_text = str(option or '').strip()
                if option_text and option_text not in normalized_options:
                    if len(option_text) > MAX_CUSTOM_FIELD_OPTION_LENGTH:
                        raise serializers.ValidationError(f'Custom field "{field_id}" has an option that is too long.')
                    normalized_options.append(option_text)
            if not normalized_options:
                raise serializers.ValidationError(f'Custom field "{field_id}" requires at least one option.')
            if len(normalized_options) > MAX_CUSTOM_FIELD_OPTIONS:
                raise serializers.ValidationError(
                    f'Custom field "{field_id}" supports at most {MAX_CUSTOM_FIELD_OPTIONS} options.'
                )
            normalized['options'] = normalized_options

        normalized_fields.append(normalized)

    return normalized_fields


def validate_custom_field_values(custom_fields, values):
    schema = validate_custom_field_schema(custom_fields)
    values = values or {}
    if not isinstance(values, dict):
        raise serializers.ValidationError({'custom_field_values': 'Custom field values must be an object.'})

    field_by_id = {field['id']: field for field in schema}
    unknown_ids = sorted(set(values.keys()) - set(field_by_id.keys()))
    if unknown_ids:
        raise serializers.ValidationError({
            'custom_field_values': f'Unknown custom field ids: {", ".join(unknown_ids)}.'
        })

    errors = {}
    normalized_values = {}
    for field in schema:
        field_id = field['id']
        label = field['label']
        field_type = field['type']
        is_present = field_id in values
        raw_value = values.get(field_id)

        # Required checkboxes represent explicit consent/confirmation, so False is incomplete.
        if field.get('required') and field_type == 'checkbox' and raw_value is not True:
            errors[field_id] = f'{label} must be checked.'
            continue

        if field.get('required') and (
            not is_present or raw_value is None or (isinstance(raw_value, str) and not raw_value.strip())
        ):
            errors[field_id] = f'{label} is required.'
            continue

        if not is_present or raw_value in (None, ''):
            continue

        if field_type in {'text', 'textarea'}:
            value = str(raw_value).strip()
            max_length = MAX_TEXTAREA_VALUE_LENGTH if field_type == 'textarea' else MAX_TEXT_VALUE_LENGTH
            if len(value) > max_length:
                errors[field_id] = f'{label} must be {max_length} characters or fewer.'
            else:
                normalized_values[field_id] = value
            continue

        if field_type == 'select':
            value = str(raw_value).strip()
            if value not in field.get('options', []):
                errors[field_id] = f'{label} must be one of: {", ".join(field.get("options", []))}.'
            else:
                normalized_values[field_id] = value
            continue

        if field_type == 'date':
            value = str(raw_value).strip()
            try:
                normalized_values[field_id] = date.fromisoformat(value).isoformat()
            except ValueError:
                errors[field_id] = f'{label} must be a valid date.'
            continue

        if field_type == 'number':
            if isinstance(raw_value, bool):
                errors[field_id] = f'{label} must be a valid number.'
                continue
            try:
                number = float(raw_value)
            except (TypeError, ValueError):
                errors[field_id] = f'{label} must be a valid number.'
            else:
                normalized_values[field_id] = int(number) if number.is_integer() else number
            continue

        if field_type == 'checkbox':
            # Optional checkboxes may be omitted, but submitted values must stay boolean.
            if isinstance(raw_value, bool):
                normalized_values[field_id] = raw_value
            else:
                errors[field_id] = f'{label} must be true or false.'

    if errors:
        raise serializers.ValidationError({'custom_field_values': errors})
    return normalized_values


def build_custom_field_snapshot(custom_fields, values):
    schema = validate_custom_field_schema(custom_fields)
    field_by_id = {field['id']: field for field in schema}
    snapshot = {}

    for field_id, value in values.items():
        field = field_by_id.get(field_id)
        if not field:
            continue
        snapshot[field_id] = {
            'label': field['label'],
            'type': field['type'],
            'value': value,
        }

    return snapshot


class UploadedFileSerializer(serializers.ModelSerializer):
    document_name = serializers.CharField(source='document.name', read_only=True)
    document_id = serializers.CharField(source='document.id', read_only=True)
    folder_name = serializers.CharField(source='document.folder.name', read_only=True)
    folder_id = serializers.CharField(source='document.folder.id', read_only=True)

    class Meta:
        model = UploadedFile
        fields = [
            'id', 'document_id', 'document_name', 'folder_id', 'folder_name',
            'uploader_name', 'uploader_email', 'submitted_fields', 'created_at'
        ]


class FileRequestSerializer(serializers.ModelSerializer):
    folder_name = serializers.CharField(source='folder.name', read_only=True)
    uploaded_files_count = serializers.IntegerField(read_only=True)
    folder = serializers.PrimaryKeyRelatedField(
        queryset=Folder.objects.all(),
    )

    class Meta:
        model = FileRequest
        fields = [
            'id', 'name', 'folder', 'folder_name', 'slug', 'is_active',
            'expires_at', 'max_file_size', 'allowed_file_types', 'uploaded_files_count',
            'custom_fields', 'created_at', 'updated_at', 'message'
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at', 'uploaded_files_count']

    def validate_folder(self, value):
        """
        Check that the folder belongs to the user making the request.
        The invisible __root__ folder (created_by=None) is allowed.
        """
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("Request context is missing.")

        if value.organization != request.user.organization:
            raise serializers.ValidationError("You can only select folders within your own organization.")

        if value.created_by is not None and value.created_by != request.user:
            raise serializers.ValidationError("You can only create file requests for your own folders.")
        return value

    def validate_custom_fields(self, value):
        return validate_custom_field_schema(value)


class FileRequestDetailSerializer(FileRequestSerializer):
    uploaded_files = UploadedFileSerializer(many=True, read_only=True)

    class Meta(FileRequestSerializer.Meta):
        fields = list(FileRequestSerializer.Meta.fields) + ['uploaded_files']


class PublicFileRequestSerializer(serializers.ModelSerializer):
    """
    Serializer for exposing public-facing details of a file request.
    """
    owner_name = serializers.CharField(source='created_by.name', read_only=True)

    class Meta:
        model = FileRequest
        fields = [
            'name', 'owner_name', 'max_file_size', 'allowed_file_types', 'custom_fields', 'message'
        ]


class FileRequestUploadFinalizeSerializer(serializers.Serializer):
    """
    Serializer for finalizing an upload made via a file request.
    """
    storage_key = serializers.CharField()
    unique_name = serializers.CharField()
    file_size = serializers.IntegerField()
    content_type = serializers.CharField(allow_blank=True)
    uploader_name = serializers.CharField(required=True, allow_blank=False, max_length=255)
    uploader_email = serializers.EmailField(required=True, allow_blank=False)
    custom_field_values = serializers.JSONField(required=False, default=dict)
