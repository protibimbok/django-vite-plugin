from typing import Any, Dict, List
from django.apps import apps
from django.core.management.base import BaseCommand, CommandParser
from django.conf import settings
import django
from ...config_helper import get_config
from ...utils import find_asset
import json

CONFIG = get_config()
CONFIG['BUILD_DIR'] = CONFIG['BUILD_DIR'].strip('/\\')

class Command(BaseCommand):
    help = 'Communicates with the django-vite-plugin'

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            '--find-static',
            help='List of the assets to find',
            nargs='*'
        )

        parser.add_argument(
            '--action',
            help='Specifies the action to be taken',
            default='find_static'
        )

    def handle(self, **options: Any) -> None:
        if options['action'] == 'config':
            CONFIG['INSTALLED_APPS'] = self.get_apps()
            self.stdout.write(
                json.dumps(CONFIG)
            )
        elif options['action'] == 'version':
            self.stdout.write(
                json.dumps(django.get_version()),
                ending=''
            )
        elif options['find_static'] is not None:
            founds = [find_asset(asset) for asset in options['find_static']]
            self.stdout.write(
                json.dumps(founds),
                ending=''
            )
    
    def get_apps(self) -> Dict[str, str]:
        INSTALLED_APPS = getattr(settings, 'INSTALLED_APPS', [])
        APPS = {}
        for app in INSTALLED_APPS:
            # Ignore dotted named apps
            if '.' in app or app == 'django_vite_plugin':
                continue
            APPS[app] = apps.get_app_config(app).path

        return APPS


