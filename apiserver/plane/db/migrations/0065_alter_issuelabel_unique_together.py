# Generated by Django 4.2.11 on 2024-05-06 12:16

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0064_auto_20240409_1134'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='issuelabel',
            unique_together={('issue', 'label')},
        ),
    ]