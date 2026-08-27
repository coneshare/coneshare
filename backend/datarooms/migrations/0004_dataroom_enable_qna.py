from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('datarooms', '0003_dataroom_brand_accent_color_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='dataroom',
            name='enable_qna',
            field=models.BooleanField(default=True),
        ),
    ]
