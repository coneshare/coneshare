# Generated manually for dataroom vault storage refactor
import django.db.models.deletion
from django.db import migrations, models


def backfill_vault_folder(apps, schema_editor):
    Dataroom = apps.get_model('datarooms', 'Dataroom')
    Folder = apps.get_model('documents', 'Folder')

    vault_root = Folder.objects.filter(name='__datarooms__', folder_type='vault').first()
    if not vault_root:
        return

    for dataroom in Dataroom.objects.filter(storage_version=2).select_related('organization'):
        vault_folder = Folder.objects.filter(
            organization=dataroom.organization,
            parent__name='__datarooms__',
            name=str(dataroom.id),
            folder_type='vault'
        ).first()
        if vault_folder:
            dataroom.vault_folder = vault_folder
            dataroom.save(update_fields=['vault_folder'])


class Migration(migrations.Migration):

    dependencies = [
        ('datarooms', '0005_dataroom_storage_quota_mb_dataroom_storage_version_and_more'),
        ('documents', '0008_folder_folder_type_and_invariant'),
    ]

    operations = [
        migrations.AddField(
            model_name='dataroom',
            name='vault_folder',
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='owned_dataroom',
                to='documents.folder',
            ),
        ),
        migrations.RunPython(backfill_vault_folder, reverse_code=migrations.RunPython.noop),
    ]
