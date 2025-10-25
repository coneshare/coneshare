from .base import CloudProviderError
from .dropbox import DropboxProvider
from .google_drive import GoogleDriveProvider
from .nextcloud import NextcloudProvider

PROVIDER_REGISTRY = {
    'dropbox': DropboxProvider,
    'google_drive': GoogleDriveProvider,
    'nextcloud': NextcloudProvider,
}


def get_cloud_provider(provider_name, connection=None):
    """Factory function to get a cloud provider instance."""
    provider_class = PROVIDER_REGISTRY.get(provider_name)
    if not provider_class:
        raise ValueError(f"Unsupported cloud provider: {provider_name}")
    return provider_class(connection=connection)
