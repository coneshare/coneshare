from rest_framework import serializers
from .models import Dataroom


class DataroomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dataroom
        fields = ['id', 'name', 'organization', 'created_at', 'updated_at', 'created_by']
        read_only_fields = ['id', 'organization', 'created_at', 'updated_at', 'created_by']
