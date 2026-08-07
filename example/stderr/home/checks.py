"""
The whole point of this example.

Django runs system checks before every management command and prints any
warnings to stderr — including for the `manage.py django_vite_plugin` calls
the Vite plugin makes to read its configuration. This check guarantees
there is always such a warning, proving the plugin still parses the JSON
it needs from stdout.
"""

from django.core import checks


@checks.register()
def intentional_warning(app_configs, **kwargs):
    return [
        checks.Warning(
            'This warning is intentional. The stderr example emits it on '
            'every management command to verify that django-vite-plugin '
            'tolerates noise on stderr. Do not fix it.',
            id='stderr_example.W001',
        )
    ]
