from django.urls import include, path

urlpatterns = [
    # Serves the production build at BUILD_URL_PREFIX when DEV_MODE is off.
    path('', include('django_vite_plugin.urls')),
    path('', include('ui.urls')),
]
