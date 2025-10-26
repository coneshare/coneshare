from rest_framework import permissions, viewsets

from .models import Dataroom
from .serializers import DataroomSerializer


class DataroomViewSet(viewsets.ModelViewSet):
    queryset = Dataroom.objects.all()
    serializer_class = DataroomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        This queryset ensures that users can only access datarooms
        within their organization.
        """
        return self.queryset.filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        """
        Automatically assign the organization and creator from the request user.
        """
        serializer.save(
            organization=self.request.user.organization,
            created_by=self.request.user
        )
