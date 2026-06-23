from django.utils import timezone

def get_dataroom_storage_folder_name(name, dataroom):
    """
    Constructs the backing library folder name for a dataroom using
    its name, its creation time (YYMMDD_HHMMSS), and a unique 6-character suffix.
    """
    if not dataroom:
        return name

    created_at = getattr(dataroom, 'created_at', None)
    if not created_at:
        created_at = timezone.now()
    
    timestamp = created_at.strftime('%y%m%d_%H%M%S')
    
    # Use the last 6 characters of the ULID as a unique suffix
    ulid_str = str(getattr(dataroom, 'id', ''))
    suffix = ulid_str[-6:] if len(ulid_str) >= 6 else '000000'
    
    return f"{name} ({timestamp}_{suffix})"
