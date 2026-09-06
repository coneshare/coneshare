# Generated manually for dataroom vault storage refactor
from django.db import migrations, models


def backfill_folder_types(apps, schema_editor):
    Folder = apps.get_model('documents', 'Folder')
    # Org roots: created_by=None, parent=None
    Folder.objects.filter(created_by__isnull=True, parent__isnull=True).update(folder_type='root')
    # Vault folders: created_by=None, parent IS NOT NULL
    Folder.objects.filter(created_by__isnull=True, parent__isnull=False).update(folder_type='vault')
    # Everything else is personal
    Folder.objects.filter(folder_type__isnull=True).update(folder_type='personal')


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0007_alter_document_unique_together_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='folder',
            name='folder_type',
            field=models.CharField(
                choices=[('root', 'Org Root'), ('personal', 'Personal'), ('vault', 'System Vault')],
                db_index=True,
                default='personal',
                max_length=20,
            ),
        ),
        migrations.RunPython(backfill_folder_types, reverse_code=migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='folder',
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(folder_type='root', parent__isnull=True, created_by__isnull=True) |
                    models.Q(folder_type='personal', created_by__isnull=False) |
                    models.Q(folder_type='vault', parent__isnull=False, created_by__isnull=True)
                ),
                name='folder_type_structural_invariant',
            ),
        ),
    ]
