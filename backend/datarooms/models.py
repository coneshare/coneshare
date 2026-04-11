from django.db import models

from core.models import BaseModel, Organization, User


class Dataroom(BaseModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='datarooms')
    name = models.CharField(max_length=255)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='datarooms_created')

    def __str__(self):
        return self.name


class DataroomFolder(BaseModel):
    dataroom = models.ForeignKey(Dataroom, on_delete=models.CASCADE, related_name='folders')
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    name = models.CharField(max_length=255)
    is_starred = models.BooleanField(default=False)

    def __str__(self):
        return self.name


class DataroomDocument(BaseModel):
    dataroom = models.ForeignKey(Dataroom, on_delete=models.CASCADE, related_name='documents')
    document = models.ForeignKey('documents.Document', on_delete=models.CASCADE)
    folder = models.ForeignKey(DataroomFolder, on_delete=models.CASCADE, null=True, blank=True)
    name = models.CharField(max_length=255, blank=True)
    is_starred = models.BooleanField(default=False)

    class Meta:
        unique_together = ('dataroom', 'document', 'folder')



# # Add models for future Audit Log and Q&A features
# class AuditLog(BaseModel):
#     organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='audit_logs')
#     user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs')
#     action = models.CharField(max_length=100)
#     details = models.JSONField(blank=True, null=True)
#     related_document = models.ForeignKey('documents.Document', on_delete=models.SET_NULL, null=True, blank=True)
#     related_dataroom = models.ForeignKey(Dataroom, on_delete=models.SET_NULL, null=True, blank=True)

#     def __str__(self):
#         return f'{self.action} by {self.user} at {self.created_at}'


# class QnAThread(BaseModel):
#     dataroom = models.ForeignKey(Dataroom, on_delete=models.CASCADE, related_name='qna_threads')
#     document = models.ForeignKey('documents.Document', on_delete=models.CASCADE, related_name='qna_threads')
#     subject = models.TextField()
#     status = models.CharField(max_length=20, choices=[('open', 'Open'), ('closed', 'Closed')], default='open')
#     created_by_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
#     created_by_viewer = models.ForeignKey('documents.Viewer', on_delete=models.SET_NULL, null=True, blank=True)


# class QnAMessage(BaseModel):
#     thread = models.ForeignKey(QnAThread, on_delete=models.CASCADE, related_name='messages')
#     message = models.TextField()
#     sent_by_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
#     sent_by_viewer = models.ForeignKey('documents.Viewer', on_delete=models.SET_NULL, null=True, blank=True)
