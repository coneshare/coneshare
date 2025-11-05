import pytest
from pytest_bdd import parsers, scenario, given, when, then
from rest_framework import status

from documents.models import Document, ShareLink
from datarooms.models import Dataroom, DataroomDocument, DataroomFolder, ShareLinkDataroomSetting

pytest_plugins = "bdd.step_definitions.common_steps"


# Scenarios
@pytest.mark.django_db
@scenario('../features/datarooms_sharing_permissions.feature', 'Owner sets granular permissions for a dataroom share link')
def test_owner_sets_permissions():
    pass


@pytest.mark.django_db
@scenario('../features/datarooms_sharing_permissions.feature', 'Viewer sees only visible content in a dataroom share link')
def test_viewer_sees_visible_content():
    pass


@pytest.mark.django_db
@scenario('../features/datarooms_sharing_permissions.feature', 'An item inside an invisible folder is not visible')
def test_item_in_invisible_folder():
    pass


@pytest.mark.django_db
@scenario('../features/datarooms_sharing_permissions.feature', 'Viewer respects the allow_download setting for an individual item')
def test_viewer_respects_download_setting():
    pass


@pytest.mark.django_db
@scenario('../features/datarooms_sharing_permissions.feature', 'A downloadable folder does not allow downloading a restricted item inside it')
def test_downloadable_folder_with_restricted_item():
    pass


# Fixtures and Given steps
@given(parsers.parse('I have a dataroom named "{dataroom_name}"'), target_fixture="dataroom_context")
def dataroom(user_context, dataroom_name):
    """Creates a dataroom for the authenticated user."""
    dr = Dataroom.objects.create(
        name=dataroom_name,
        created_by=user_context['user'],
        organization=user_context['user'].organization
    )
    return {'dataroom': dr, 'user_context': user_context}


@given(parsers.parse('the dataroom contains a document named "{doc_name}"'))
def dataroom_contains_document(dataroom_context, doc_name):
    """Adds a document to the dataroom."""
    user = dataroom_context['user_context']['user']
    doc = Document.objects.create(
        name=doc_name,
        created_by=user,
        organization=user.organization,
        status='ready'
    )
    DataroomDocument.objects.create(
        dataroom=dataroom_context['dataroom'],
        document=doc
    )


@given("a dataroom share link exists", target_fixture="link_context")
def dataroom_share_link(user_context):
    """Fixture to create a dataroom with documents and a share link."""
    user = user_context['user']
    dr = Dataroom.objects.create(name="Test Dataroom", created_by=user, organization=user.organization)
    
    doc1 = Document.objects.create(name="Financials.pdf", created_by=user, organization=user.organization, status='ready')
    doc2 = Document.objects.create(name="Strategy.docx", created_by=user, organization=user.organization, status='ready')
    
    DataroomDocument.objects.create(dataroom=dr, document=doc1)
    DataroomDocument.objects.create(dataroom=dr, document=doc2)
    
    link = ShareLink.objects.create(dataroom=dr, created_by=user)
    return {'link': link, 'dataroom': dr}


def _update_setting(link, item_name, setting_updates):
    """Helper to modify a setting for an item in a dataroom link."""
    try:
        ddoc = DataroomDocument.objects.get(dataroom=link.dataroom, document__name=item_name)
        setting = ShareLinkDataroomSetting.objects.get(share_link=link, dataroom_document=ddoc)
    except DataroomDocument.DoesNotExist:
        dfolder = DataroomFolder.objects.get(dataroom=link.dataroom, name=item_name)
        setting = ShareLinkDataroomSetting.objects.get(share_link=link, dataroom_folder=dfolder)

    for key, value in setting_updates.items():
        setattr(setting, key, value)
    setting.save()


@given(parsers.parse('its settings make "{item_name}" not visible'))
def setting_not_visible(link_context, item_name):
    _update_setting(link_context['link'], item_name, {'is_visible': False})


@given(parsers.parse('its settings make "{item_name}" visible'))
def setting_visible(link_context, item_name):
    _update_setting(link_context['link'], item_name, {'is_visible': True})


@given(parsers.parse('the dataroom has a folder "{folder_name}" containing a document "{doc_name}"'))
def dataroom_has_folder_with_doc(link_context, folder_name, doc_name):
    dataroom = link_context['dataroom']
    user = dataroom.created_by
    folder = DataroomFolder.objects.create(dataroom=dataroom, name=folder_name)
    doc = Document.objects.create(name=doc_name, created_by=user, organization=user.organization, status='ready')
    DataroomDocument.objects.create(dataroom=dataroom, document=doc, folder=folder)
    # The post_save signal on DataroomFolder/DataroomDocument will have created the setting.


@given(parsers.parse('the link\'s settings make the folder "{folder_name}" not visible'))
def folder_setting_not_visible(link_context, folder_name):
    _update_setting(link_context['link'], folder_name, {'is_visible': False})


@given(parsers.parse('the link\'s settings make the document "{doc_name}" visible'))
def doc_setting_visible(link_context, doc_name):
    _update_setting(link_context['link'], doc_name, {'is_visible': True})


@given(parsers.parse('its settings make "{doc_name}" visible but not downloadable'))
def setting_not_downloadable(link_context, doc_name):
    _update_setting(link_context['link'], doc_name, {'is_visible': True, 'allow_download': False})


@given(parsers.parse('the link\'s settings make the folder "{folder_name}" downloadable'))
def folder_downloadable(link_context, folder_name):
    _update_setting(link_context['link'], folder_name, {'allow_download': True})


@given(parsers.parse('the link\'s settings make the document "{doc_name}" not downloadable'))
def doc_not_downloadable(link_context, doc_name):
    _update_setting(link_context['link'], doc_name, {'allow_download': False})


# When steps
@when(parsers.parse('I create a share link for the dataroom "{dataroom_name}"'))
def create_share_link(dataroom_context, dataroom_name):
    api_client = dataroom_context['user_context']['api_client']
    dataroom = dataroom_context['dataroom']
    assert dataroom.name == dataroom_name

    response = api_client.post('/api/v1/share-links/', {
        'dataroom': str(dataroom.id),
        'name': 'Dataroom Test Link'
    })
    assert response.status_code == status.HTTP_201_CREATED, response.data
    dataroom_context['link'] = ShareLink.objects.get(id=response.data['id'])


def _update_link_setting_via_api(api_client, link, doc_name, payload):
    ddoc = DataroomDocument.objects.get(dataroom=link.dataroom, document__name=doc_name)
    setting = ShareLinkDataroomSetting.objects.get(share_link=link, dataroom_document=ddoc)
    update_data = [{'id': str(setting.id), **payload}]
    url = f'/api/v1/share-links/{link.id}/dataroom-settings/'
    response = api_client.patch(url, update_data, format='json')
    assert response.status_code == status.HTTP_200_OK


@when(parsers.parse('I update the link\'s settings to make "{doc_name}" not visible'))
def update_setting_not_visible(dataroom_context, doc_name):
    api_client = dataroom_context['user_context']['api_client']
    link = dataroom_context['link']
    _update_link_setting_via_api(api_client, link, doc_name, {'is_visible': False})


@when(parsers.parse('I update the link\'s settings to make "{doc_name}" not downloadable'))
def update_setting_not_downloadable(dataroom_context, doc_name):
    api_client = dataroom_context['user_context']['api_client']
    link = dataroom_context['link']
    _update_link_setting_via_api(api_client, link, doc_name, {'allow_download': False})


@when("a viewer accesses the public data for the dataroom share link", target_fixture="public_response_context")
def access_public_dataroom_data(public_client, link_context):
    link = link_context['link']
    url = f'/api/v1/links/{link.slug}/view-data/'
    response = public_client.get(url)
    assert response.status_code == status.HTTP_200_OK
    return {'response': response}


# Then steps
@then(parsers.parse('the share link settings for "{doc_name}" should have "{setting_key}" as {setting_value_str}'))
def check_share_link_setting(dataroom_context, doc_name, setting_key, setting_value_str):
    setting_value = setting_value_str.lower() == 'true'
    link = dataroom_context['link']
    ddoc = DataroomDocument.objects.get(dataroom=link.dataroom, document__name=doc_name)
    setting = ShareLinkDataroomSetting.objects.get(share_link=link, dataroom_document=ddoc)
    
    assert getattr(setting, setting_key) == setting_value


@then(parsers.parse('the response should contain the document "{doc_name}"'))
def response_contains_document(public_response_context, doc_name):
    data = public_response_context['response'].json()
    assert any(doc['document_name'] == doc_name for doc in data['documents'])


@then(parsers.parse('the response should not contain the document "{doc_name}"'))
def response_does_not_contain_document(public_response_context, doc_name):
    data = public_response_context['response'].json()
    assert not any(doc['document_name'] == doc_name for doc in data['documents'])


@then(parsers.parse('the response should not contain the folder "{folder_name}"'))
def response_does_not_contain_folder(public_response_context, folder_name):
    data = public_response_context['response'].json()
    assert not any(folder['name'] == folder_name for folder in data['folders'])


def _get_item_from_response(response_data, item_name, item_type):
    key, name_key = ('documents', 'document_name') if item_type == 'document' else ('folders', 'name')
    for item in response_data.get(key, []):
        if item.get(name_key) == item_name:
            return item
    return None


@then(parsers.parse('the data for "{item_name}" should have "{setting_key}" as {setting_value_str}'))
def check_data_property(public_response_context, item_name, setting_key, setting_value_str):
    setting_value = setting_value_str.lower() == 'true'
    data = public_response_context['response'].json()
    item = _get_item_from_response(data, item_name, 'document')
    assert item is not None, f"Document '{item_name}' not found in response"
    assert item.get(setting_key) == setting_value


@then(parsers.parse('the data for the folder "{folder_name}" should have "{setting_key}" as {setting_value_str}'))
def check_folder_data_property(public_response_context, folder_name, setting_key, setting_value_str):
    setting_value = setting_value_str.lower() == 'true'
    data = public_response_context['response'].json()
    item = _get_item_from_response(data, folder_name, 'folder')
    assert item is not None, f"Folder '{folder_name}' not found in response"
    assert item.get(setting_key) == setting_value


@then(parsers.parse('the data for the document "{doc_name}" should have "{setting_key}" as {setting_value_str}'))
def check_doc_data_property(public_response_context, doc_name, setting_key, setting_value_str):
    setting_value = setting_value_str.lower() == 'true'
    data = public_response_context['response'].json()
    item = _get_item_from_response(data, doc_name, 'document')
    assert item is not None, f"Document '{doc_name}' not found in response"
    assert item.get(setting_key) == setting_value
