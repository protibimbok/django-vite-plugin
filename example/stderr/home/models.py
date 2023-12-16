from django.db import models

# Create your models here.
class TestModel(models.Model):
    name = models.TextField()

class TestModel2(models.Model):
    categories= models.ManyToManyField(TestModel, blank=True, null=True)
