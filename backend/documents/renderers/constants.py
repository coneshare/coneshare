OFFICE_MIMETYPES = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  # .docx
    'application/msword',  # .doc
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',  # .pptx
    'application/vnd.ms-powerpoint',  # .ppt
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  # .xlsx
    'application/vnd.ms-excel',  # .xls
]
OFFICE_EXTENSIONS = {'.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls'}

HEIC_MIMETYPES = [
    'image/heic',
    'image/heif',
    'image/heic-sequence',
    'image/heif-sequence',
]
HEIC_EXTENSIONS = {'.heic', '.heif'}

DIRECT_IMAGE_MIMETYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
]
DIRECT_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}

IMAGE_MIMETYPES = [
    *DIRECT_IMAGE_MIMETYPES,
    *HEIC_MIMETYPES,
]

VIDEO_MIMETYPES = [
    'video/mp4',
    'video/quicktime',  # .mov
    'video/x-msvideo',  # .avi
    'video/webm',
    'video/ogg',
    'video/mp2t',
    'video/3gpp',
]
VIDEO_EXTENSIONS = {'.mp4', '.mov', '.avi', '.webm', '.ogg', '.m4v', '.3gp'}

PDF_MIMETYPE = 'application/pdf'
PDF_EXTENSIONS = {'.pdf'}
