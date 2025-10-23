class CloudProviderError(Exception):
    """Custom exception for cloud provider errors."""
    pass


class BaseCloudProvider:
    """Abstract base class for cloud provider integrations."""
    def __init__(self, connection=None):
        self.connection = connection

    def get_authorization_url(self):
        """Returns the URL to redirect the user for OAuth2 authorization."""
        raise NotImplementedError

    def handle_callback(self, request):
        """Handles the OAuth2 callback, exchanges code for tokens, and saves them."""
        raise NotImplementedError

    def list_files(self, path='/'):
        """Lists files and folders from the cloud provider."""
        raise NotImplementedError

    def download_file(self, file_id):
        """Downloads a file and returns its metadata and a file-like object."""
        raise NotImplementedError

    def get_user_info(self):
        """Gets user info from the provider, like email."""
        raise NotImplementedError
