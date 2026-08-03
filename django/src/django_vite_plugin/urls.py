import warnings
from urllib.parse import urlsplit
from django.conf import settings
from django.conf.urls.static import static
from .config_helper import get_config
from .constants import BASE_DIR

CONFIG = get_config()

urlpatterns = []

if not CONFIG['DEV_MODE']:
    build_url_prefix = CONFIG['BUILD_URL_PREFIX']

    # Only the path of BUILD_URL_PREFIX is routable. It may name another host -
    # a CDN - but the built files still live locally in BUILD_DIR, and a CDN
    # that pulls from this origin needs them served from that path anyway.
    prefix = urlsplit(build_url_prefix).path.strip('/')

    if not settings.DEBUG:
        warnings.warn(
            'django_vite_plugin.urls is not serving anything because DEBUG is '
            'False - Django does not serve static files in production. Set '
            'DEBUG=True to test a production build locally, or serve '
            f'{build_url_prefix!r} with your web server.',
            stacklevel=2,
        )
    elif not prefix:
        warnings.warn(
            'django_vite_plugin.urls is not serving anything because '
            f'BUILD_URL_PREFIX ({build_url_prefix!r}) has no path to route. '
            'Give it a path, such as "/static/", to serve the build locally.',
            stacklevel=2,
        )
    else:
        urlpatterns = static(
            prefix,
            document_root=BASE_DIR / CONFIG['BUILD_DIR'],
        )
