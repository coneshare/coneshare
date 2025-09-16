from pytest_bdd import given
from rest_framework import status


@given("I am an authenticated user", target_fixture="user_context")
def user_context(user, api_client):
    """The user and api_client fixtures handle authentication."""
    return {"user": user, "api_client": api_client}


@given("my document list is empty")
def document_list_is_empty(user_context):
    api_client = user_context["api_client"]
    response = api_client.get('/api/v1/documents/')
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 0
