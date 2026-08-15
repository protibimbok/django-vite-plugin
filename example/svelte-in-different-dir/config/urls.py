from django.urls import include, path
from django.views.generic import TemplateView

urlpatterns = [
    # Serves the production build at BUILD_URL_PREFIX when DEV_MODE is off.
    path('', include('django_vite_plugin.urls')),
    path('', TemplateView.as_view(template_name='index.html')),
]
