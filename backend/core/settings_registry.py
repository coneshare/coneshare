import json


DEFAULT_SETTINGS = {
    'MAX_PREVIEW_FILE_SIZE_MB': {'description': 'Max file size in MB for preview generation. Files larger than this will be marked as download-only.', 'type': 'int'},
    'MAX_PREVIEW_PAGES': {'description': 'Maximum number of pages for document preview. Documents with more pages will be available for download only.', 'type': 'int'},
    'FILE_SIZE_QUOTA_MB': {'description': 'Per-user file size quota in MB. 0 means unlimited.', 'type': 'int'},
    'MAX_FILES_PER_UPLOAD': {'description': 'Maximum number of files allowed in a single upload operation.', 'type': 'int'},
    'ENABLED_CLOUD_PROVIDERS': {'description': 'JSON list of enabled cloud providers (e.g., ["dropbox"]).', 'type': 'json'},
    'CLOUD_IMPORT_FOLDER_MAPPING': {'description': 'JSON mapping of provider IDs to default folder names.', 'type': 'json'},
    'CLOUD_IMPORT_MAX_SIZE_MB': {'description': 'Max file size in MB for cloud imports.', 'type': 'int'},
    'DROPBOX_APP_KEY': {'description': 'API Key for Dropbox integration.', 'type': 'string'},
    'DROPBOX_APP_SECRET': {'description': 'API Secret for Dropbox integration.', 'type': 'string'},
    'GOOGLE_DRIVE_CLIENT_ID': {'description': 'Client ID for Google Drive integration.', 'type': 'string'},
    'GOOGLE_DRIVE_CLIENT_SECRET': {'description': 'Client Secret for Google Drive integration.', 'type': 'string'},
    'NEXT_CLOUD_HOST': {'description': 'Host URL for Nextcloud (e.g., https://cloud.example.com).', 'type': 'string'},
    'NEXT_CLOUD_CLIENT_ID': {'description': 'Client ID for Nextcloud integration.', 'type': 'string'},
    'NEXT_CLOUD_CLIENT_SECRET': {'description': 'Client Secret for Nextcloud integration.', 'type': 'string'},
    'ENABLE_PUBLIC_SIGNUP': {'description': 'Enable public signup with email verification.', 'type': 'bool'},
}

VALID_BOOL_TRUE_VALUES = {'true', '1', 'yes', 'on', 't'}
VALID_BOOL_FALSE_VALUES = {'false', '0', 'no', 'off', 'f'}


def infer_setting_type(default_value):
    if isinstance(default_value, bool):
        return 'bool'
    if isinstance(default_value, int):
        return 'int'
    if isinstance(default_value, (dict, list)):
        return 'json'
    return 'string'


def coerce_to_typed_value(setting_type: str, value):
    if setting_type == 'bool':
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in VALID_BOOL_TRUE_VALUES:
                return True
            if normalized in VALID_BOOL_FALSE_VALUES:
                return False
        raise ValueError('Expected a boolean value.')

    if setting_type == 'int':
        if isinstance(value, bool):
            raise ValueError('Expected an integer value.')
        return int(value)

    if setting_type == 'json':
        if isinstance(value, str):
            return json.loads(value)
        if isinstance(value, (list, dict)):
            return value
        raise ValueError('Expected a JSON object or array.')

    return str(value) if value is not None else ''


def serialize_typed_to_db_value(setting_type: str, value):
    if setting_type == 'bool':
        return 'true' if value else 'false'
    if setting_type == 'int':
        return str(value)
    if setting_type == 'json':
        return json.dumps(value)
    return value


def deserialize_db_value(setting_type: str, raw_value, default_value):
    if raw_value is None:
        return default_value
    if setting_type == 'bool':
        normalized = str(raw_value).strip().lower()
        if normalized in VALID_BOOL_TRUE_VALUES:
            return True
        if normalized in VALID_BOOL_FALSE_VALUES:
            return False
        return default_value
    if setting_type == 'int':
        try:
            return int(raw_value)
        except (TypeError, ValueError):
            return default_value
    if setting_type == 'json':
        try:
            return json.loads(raw_value)
        except (TypeError, ValueError):
            return default_value
    return str(raw_value)
