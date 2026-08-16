from django.utils import timezone
from datarooms.models import DataroomItemOrder


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


def build_ordered_dataroom_items(scope_rows, folders_data, documents_data):
    """
    Constructs a unified list of dataroom items with assigned `position` values.
    If scope_rows exist, items are arranged according to DataroomItemOrder,
    with any un-ordered remaining items appended sequentially at the end.
    If no scope_rows exist, items default to folders first, then created_at.
    """
    folder_map = {str(item["id"]): item for item in folders_data}
    doc_map = {str(item["id"]): item for item in documents_data}

    if scope_rows:
        ordered_items = []
        used_keys = set()
        for row in scope_rows:
            if row.item_type == DataroomItemOrder.ITEM_TYPE_FOLDER and row.folder_id and str(row.folder_id) in folder_map:
                key = ('folder', str(row.folder_id))
                ordered_items.append({"type": "folder", **folder_map[str(row.folder_id)], "position": row.position})
                used_keys.add(key)
            elif row.item_type == DataroomItemOrder.ITEM_TYPE_DOCUMENT and row.dataroom_document_id and str(row.dataroom_document_id) in doc_map:
                key = ('document', str(row.dataroom_document_id))
                ordered_items.append({"type": "document", **doc_map[str(row.dataroom_document_id)], "position": row.position})
                used_keys.add(key)

        remaining_folders = [{'type': 'folder', **item} for item in folders_data if ('folder', str(item['id'])) not in used_keys]
        remaining_docs = [{'type': 'document', **item} for item in documents_data if ('document', str(item['id'])) not in used_keys]
        remaining_items = remaining_folders + remaining_docs
        remaining_items.sort(key=lambda i: (i['type'] != 'folder', i.get('created_at', ''), str(i.get('id', ''))))
        next_position = max((i.get('position', 0) for i in ordered_items), default=-1) + 1
        for idx, item in enumerate(remaining_items):
            ordered_items.append({**item, 'position': next_position + idx})
        return ordered_items

    merged = (
        [{'type': 'folder', **item} for item in folders_data] +
        [{'type': 'document', **item} for item in documents_data]
    )
    merged.sort(key=lambda i: (i['type'] != 'folder', i.get('created_at', ''), str(i.get('id', ''))))
    for idx, item in enumerate(merged):
        item['position'] = idx
    return merged

