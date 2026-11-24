import pytest
from django.utils import timezone
from rest_framework import status

from datarooms.models import (
    Dataroom,
    DataroomCollaborator,
    DataroomDocument,
    DataroomFolder,
    DataroomItemOrder,
)
from documents.models import Document, Folder
from documents.services import soft_delete_document, soft_delete_folder
from sharelinks.models import ShareLink, ShareLinkDataroomSetting

pytestmark = pytest.mark.django_db


def _create_personal_folder(user, organization, name, parent=None):
    if parent is None:
        parent = Folder.objects.get_root_for_org(organization)
    return Folder.objects.create(
        organization=organization,
        name=name,
        parent=parent,
        created_by=user,
        folder_type=Folder.FOLDER_TYPE_PERSONAL,
    )


def _create_doc(user, organization, name, folder=None, file_size=1024):
    if folder is None:
        folder = Folder.objects.get_root_for_org(organization)
    return Document.objects.create(
        name=name,
        type='pdf',
        organization=organization,
        created_by=user,
        folder=folder,
        file_size=file_size,
        status='ready',
    )


class TestFolderToDataroomSync:
    def test_add_content_sync_opt_in_default_false_and_true(self, api_client, dataroom, user, organization):
        source = _create_personal_folder(user, organization, "Deal Docs")
        sub = _create_personal_folder(user, organization, "Tax", parent=source)
        doc1 = _create_doc(user, organization, "Intro.pdf", folder=source)
        doc2 = _create_doc(user, organization, "Return.pdf", folder=sub)

        # Default (sync_folders omitted / False) performs a plain snapshot copy
        resp = api_client.post(
            f'/api/v1/datarooms/{dataroom.id}/add-content/',
            {'folder_ids': [str(source.id)]},
            format='json',
        )
        assert resp.status_code == status.HTTP_200_OK
        unsynced_root = DataroomFolder.objects.get(dataroom=dataroom, name="Deal Docs")
        assert unsynced_root.is_synced is False
        assert unsynced_root.source_folder is None
        assert unsynced_root.last_synced_at is None
        assert DataroomDocument.objects.filter(dataroom=dataroom, document=doc1, is_synced=False).exists()

        # With sync_folders=True, creates synced subtree with deduplicated folder name
        resp2 = api_client.post(
            f'/api/v1/datarooms/{dataroom.id}/add-content/',
            {'folder_ids': [str(source.id)], 'sync_folders': True},
            format='json',
        )
        assert resp2.status_code == status.HTTP_200_OK
        synced_root = DataroomFolder.objects.get(dataroom=dataroom, is_synced=True, source_folder=source)
        assert synced_root.name == "Deal Docs (2)"
        assert synced_root.last_synced_at is not None

        synced_sub = DataroomFolder.objects.get(dataroom=dataroom, parent=synced_root, source_folder=sub)
        assert synced_sub.is_synced is True
        assert DataroomDocument.objects.filter(folder=synced_root, document=doc1, is_synced=True).exists()
        assert DataroomDocument.objects.filter(folder=synced_sub, document=doc2, is_synced=True).exists()

    def test_folder_and_dataroom_folder_serializer_contracts_and_no_n_plus_1(
        self, api_client, dataroom, user, organization, django_assert_num_queries
    ):
        source = _create_personal_folder(user, organization, "Legal")
        doc = _create_doc(user, organization, "NDA.pdf", folder=source)

        # Create deep nested target path in Dataroom: /Top/Mid/Legal
        top = DataroomFolder.objects.create(dataroom=dataroom, name="Top", created_by=user)
        mid = DataroomFolder.objects.create(dataroom=dataroom, name="Mid", parent=top, created_by=user)

        resp = api_client.post(
            f'/api/v1/datarooms/{dataroom.id}/add-content/',
            {'folder_ids': [str(source.id)], 'destination_folder_id': str(mid.id), 'sync_folders': True},
            format='json',
        )
        assert resp.status_code == status.HTTP_200_OK
        synced_root = DataroomFolder.objects.get(dataroom=dataroom, parent=mid, source_folder=source)

        # Folder list / retrieve / search expose synced_datarooms with full nested path
        list_resp = api_client.get('/api/v1/folders/')
        assert list_resp.status_code == status.HTTP_200_OK
        legal_entry = next(f for f in list_resp.data['sub_folders'] if f['id'] == str(source.id))
        assert len(legal_entry['synced_datarooms']) == 1
        ref = legal_entry['synced_datarooms'][0]
        assert ref['dataroom_id'] == str(dataroom.id)
        assert ref['dataroom_name'] == dataroom.name
        assert ref['dataroom_folder_id'] == str(synced_root.id)
        assert ref['dataroom_folder_path'] == '/Top/Mid/Legal'
        assert ref['last_synced_at'] is not None

        retrieve_resp = api_client.get(f'/api/v1/folders/{source.id}/')
        assert retrieve_resp.status_code == status.HTTP_200_OK
        assert len(retrieve_resp.data['current_folder']['synced_datarooms']) == 1

        search_resp = api_client.get('/api/v1/folders/search/?search=Legal')
        assert search_resp.status_code == status.HTTP_200_OK
        assert len(search_resp.data) == 1
        assert search_resp.data[0]['synced_datarooms'][0]['dataroom_folder_path'] == '/Top/Mid/Legal'

        # DocumentSerializer embeds FolderSerializer without querying synced_datarooms
        doc_resp = api_client.get(f'/api/v1/documents/{doc.id}/')
        assert doc_resp.status_code == status.HTTP_200_OK
        assert doc_resp.data['folder']['synced_datarooms'] == []

        # DataroomFolderSerializer exposes sync metadata cleanly
        df_resp = api_client.get(f'/api/v1/dataroom-folders/{synced_root.id}/')
        assert df_resp.status_code == status.HTTP_200_OK
        assert df_resp.data['is_synced'] is True
        assert df_resp.data['source_folder'] == str(source.id)
        assert df_resp.data['source_folder_name'] == 'Legal'
        assert df_resp.data['source_folder_deleted'] is False
        assert df_resp.data['is_sync_root'] is True
        assert df_resp.data['last_synced_at'] is not None

        # Check batch path resolution remains O(1) regardless of linked Dataroom count or depth
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        with CaptureQueriesContext(connection) as ctx_before:
            api_client.get('/api/v1/folders/')

        room2 = Dataroom.objects.create(name="Room 2", organization=organization, created_by=user)
        deep_a = DataroomFolder.objects.create(dataroom=room2, name="A", created_by=user)
        deep_b = DataroomFolder.objects.create(dataroom=room2, name="B", parent=deep_a, created_by=user)
        deep_c = DataroomFolder.objects.create(dataroom=room2, name="C", parent=deep_b, created_by=user)
        api_client.post(
            f'/api/v1/datarooms/{room2.id}/add-content/',
            {'folder_ids': [str(source.id)], 'destination_folder_id': str(deep_c.id), 'sync_folders': True},
            format='json',
        )

        with CaptureQueriesContext(connection) as ctx_after:
            resp_after = api_client.get('/api/v1/folders/')
            assert resp_after.status_code == status.HTTP_200_OK
            legal_after = next(f for f in resp_after.data['sub_folders'] if f['id'] == str(source.id))
            assert len(legal_after['synced_datarooms']) == 2
            assert any(r['dataroom_folder_path'] == '/A/B/C/Legal' for r in legal_after['synced_datarooms'])

        assert len(ctx_after) == len(ctx_before)

        # DocumentSerializer does not query datarooms_dataroomfolder at all
        with CaptureQueriesContext(connection) as doc_queries:
            doc_resp2 = api_client.get(f'/api/v1/documents/{doc.id}/')
            assert doc_resp2.status_code == status.HTTP_200_OK
        assert not any('datarooms_dataroomfolder' in q['sql'] for q in doc_queries)

    def test_push_sync_across_datarooms_reconciles_adds_and_safe_deletes(
        self, api_client, dataroom, user, organization
    ):
        room2 = Dataroom.objects.create(name="Room Two", organization=organization, created_by=user)
        source = _create_personal_folder(user, organization, "Financials")
        stale_sub = _create_personal_folder(user, organization, "OldSub", parent=source)
        preserved_sub = _create_personal_folder(user, organization, "MixedSub", parent=source)
        doc_keep = _create_doc(user, organization, "Keep.pdf", folder=source)
        doc_trash = _create_doc(user, organization, "Remove.pdf", folder=source)
        doc_in_preserved_sub = _create_doc(user, organization, "SyncedInSub.pdf", folder=preserved_sub)

        for room in (dataroom, room2):
            resp = api_client.post(
                f'/api/v1/datarooms/{room.id}/add-content/',
                {'folder_ids': [str(source.id)], 'sync_folders': True},
                format='json',
            )
            assert resp.status_code == status.HTTP_200_OK

        synced_room1 = DataroomFolder.objects.get(dataroom=dataroom, source_folder=source)
        synced_room2 = DataroomFolder.objects.get(dataroom=room2, source_folder=source)

        # Add a direct upload file AND a manually added doc inside room1's synced folders
        direct_doc = Document.objects.create(
            name="DirectUpload.pdf",
            type='pdf',
            organization=organization,
            created_by=user,
            folder=None,
            status='ready',
        )
        DataroomDocument.objects.create(
            dataroom=dataroom,
            document=direct_doc,
            folder=synced_room1,
            name="DirectUpload.pdf",
            is_direct_upload=True,
            is_synced=False,
        )
        manual_doc = _create_doc(user, organization, "ManualLibDoc.pdf")
        DataroomDocument.objects.create(
            dataroom=dataroom,
            document=manual_doc,
            folder=synced_room1,
            name="ManualLibDoc.pdf",
            is_direct_upload=False,
            is_synced=False,
        )
        room1_preserved_sub = DataroomFolder.objects.get(dataroom=dataroom, source_folder=preserved_sub)
        DataroomDocument.objects.create(
            dataroom=dataroom,
            document=direct_doc,
            folder=room1_preserved_sub,
            name="SubDirect.pdf",
            is_direct_upload=True,
            is_synced=False,
        )

        # Mutate source folder in /documents: add new file + subfolder, trash doc_trash, trash subfolders
        new_sub = _create_personal_folder(user, organization, "Q4", parent=source)
        new_doc = _create_doc(user, organization, "Q4_Report.pdf", folder=new_sub)
        soft_delete_document(doc_trash, user)
        soft_delete_folder(stale_sub, user)
        soft_delete_folder(preserved_sub, user)

        # Push sync ONLY to room1 first
        sync_one = api_client.post(
            f'/api/v1/folders/{source.id}/sync-datarooms/',
            {'dataroom_folder_ids': [str(synced_room1.id)]},
            format='json',
        )
        assert sync_one.status_code == status.HTTP_200_OK
        assert sync_one.data['synced_count'] == 1
        assert sync_one.data['results'][0]['added_folders'] == 1
        assert sync_one.data['results'][0]['added_documents'] == 1
        assert sync_one.data['results'][0]['removed_folders'] == 1
        assert sync_one.data['results'][0]['removed_documents'] == 2  # doc_trash + doc_in_preserved_sub

        # Room1 reconciled cleanly while preserving direct_doc, manual_doc, and room1_preserved_sub shell
        assert DataroomDocument.objects.filter(folder=synced_room1, document=doc_keep).exists()
        assert not DataroomDocument.objects.filter(folder=synced_room1, document=doc_trash).exists()
        assert DataroomDocument.objects.filter(folder=synced_room1, document=direct_doc, is_direct_upload=True).exists()
        assert DataroomDocument.objects.filter(folder=synced_room1, document=manual_doc, is_synced=False).exists()
        assert not DataroomFolder.objects.filter(dataroom=dataroom, parent=synced_room1, name="OldSub").exists()
        room1_preserved_sub.refresh_from_db()
        assert room1_preserved_sub.is_synced is False
        assert room1_preserved_sub.source_folder is None
        assert DataroomDocument.objects.filter(folder=room1_preserved_sub, name="SubDirect.pdf", is_direct_upload=True).exists()
        assert not DataroomDocument.objects.filter(folder=room1_preserved_sub, document=doc_in_preserved_sub).exists()

        synced_new_sub = DataroomFolder.objects.get(dataroom=dataroom, parent=synced_room1, source_folder=new_sub)
        assert DataroomDocument.objects.filter(folder=synced_new_sub, document=new_doc, is_synced=True).exists()

        # Room2 was NOT pushed yet
        assert not DataroomFolder.objects.filter(dataroom=room2, parent=synced_room2, name="Q4").exists()

        # Push sync all linked rooms
        sync_all = api_client.post(f'/api/v1/folders/{source.id}/sync-datarooms/', {}, format='json')
        assert sync_all.status_code == status.HTTP_200_OK
        assert sync_all.data['synced_count'] == 2
        assert DataroomFolder.objects.filter(dataroom=room2, parent=synced_room2, source_folder=new_sub).exists()

    def test_collaborator_can_push_and_removed_collaborator_loses_access(
        self, api_client, dataroom, user, user2, organization
    ):
        DataroomCollaborator.objects.create(
            dataroom=dataroom,
            user=user2,
            invited_by=user,
            role=DataroomCollaborator.ROLE_COLLABORATOR,
        )
        collab_folder = _create_personal_folder(user2, organization, "Collab Materials")
        doc1 = _create_doc(user2, organization, "Deck1.pdf", folder=collab_folder)

        api_client.force_authenticate(user=user2)
        add_resp = api_client.post(
            f'/api/v1/datarooms/{dataroom.id}/add-content/',
            {'folder_ids': [str(collab_folder.id)], 'sync_folders': True},
            format='json',
        )
        assert add_resp.status_code == status.HTTP_200_OK
        synced_df = DataroomFolder.objects.get(dataroom=dataroom, source_folder=collab_folder)

        doc2 = _create_doc(user2, organization, "Deck2.pdf", folder=collab_folder)
        push_resp = api_client.post(f'/api/v1/folders/{collab_folder.id}/sync-datarooms/', {}, format='json')
        assert push_resp.status_code == status.HTTP_200_OK
        assert push_resp.data['synced_count'] == 1
        assert DataroomDocument.objects.filter(folder=synced_df, document=doc2).exists()

        # Remove user2 as collaborator
        DataroomCollaborator.objects.filter(dataroom=dataroom, user=user2).delete()

        # Removed collaborator sees no synced reference and cannot push
        folders_resp = api_client.get('/api/v1/folders/')
        assert folders_resp.status_code == status.HTTP_200_OK
        collab_entry = next(f for f in folders_resp.data['sub_folders'] if f['id'] == str(collab_folder.id))
        assert collab_entry['synced_datarooms'] == []

        doc3 = _create_doc(user2, organization, "Deck3.pdf", folder=collab_folder)
        blocked_push = api_client.post(
            f'/api/v1/folders/{collab_folder.id}/sync-datarooms/',
            {'dataroom_folder_ids': [str(synced_df.id)]},
            format='json',
        )
        assert blocked_push.status_code == status.HTTP_400_BAD_REQUEST
        assert not DataroomDocument.objects.filter(folder=synced_df, document=doc3).exists()

    def test_soft_deleted_source_folder_marked_deleted_and_blocked_from_push(
        self, api_client, dataroom, user, organization
    ):
        source = _create_personal_folder(user, organization, "Trashed Source")
        _create_doc(user, organization, "Doc.pdf", folder=source)

        resp = api_client.post(
            f'/api/v1/datarooms/{dataroom.id}/add-content/',
            {'folder_ids': [str(source.id)], 'sync_folders': True},
            format='json',
        )
        assert resp.status_code == status.HTTP_200_OK
        synced_df = DataroomFolder.objects.get(dataroom=dataroom, source_folder=source)

        soft_delete_folder(source, user)

        df_resp = api_client.get(f'/api/v1/dataroom-folders/{synced_df.id}/')
        assert df_resp.status_code == status.HTTP_200_OK
        assert df_resp.data['source_folder_deleted'] is True
        assert df_resp.data['source_folder_name'] == "Trashed Source"

        push_resp = api_client.post(f'/api/v1/folders/{source.id}/sync-datarooms/', {}, format='json')
        assert push_resp.status_code == status.HTTP_404_NOT_FOUND

    def test_quota_net_delta_and_rollback_on_exceeded(self, api_client, user, organization):
        room = Dataroom.objects.create(
            name="Capped Room",
            organization=organization,
            created_by=user,
            storage_quota_mb=10,
        )
        source = _create_personal_folder(user, organization, "Pitch")
        old_doc = _create_doc(user, organization, "V1.pdf", folder=source, file_size=8 * 1024 * 1024)

        resp = api_client.post(
            f'/api/v1/datarooms/{room.id}/add-content/',
            {'folder_ids': [str(source.id)], 'sync_folders': True},
            format='json',
        )
        assert resp.status_code == status.HTTP_200_OK
        synced_df = DataroomFolder.objects.get(dataroom=room, source_folder=source)

        # Replacing 8 MB doc with 11 MB doc exceeds 10 MB quota -> rollback both add and prune!
        soft_delete_document(old_doc, user)
        too_big_doc = _create_doc(user, organization, "V2_Huge.pdf", folder=source, file_size=11 * 1024 * 1024)

        fail_push = api_client.post(f'/api/v1/folders/{source.id}/sync-datarooms/', {}, format='json')
        assert fail_push.status_code == status.HTTP_400_BAD_REQUEST
        assert "storage limit" in fail_push.data['detail'].lower()
        assert DataroomDocument.objects.filter(folder=synced_df, document=old_doc).exists()
        assert not DataroomDocument.objects.filter(folder=synced_df, document=too_big_doc).exists()

        # Replacing 8 MB doc with 8 MB doc succeeds because old 8 MB doc is pruned in net delta
        soft_delete_document(too_big_doc, user)
        replacement_doc = _create_doc(user, organization, "V2_Ok.pdf", folder=source, file_size=8 * 1024 * 1024)

        ok_push = api_client.post(f'/api/v1/folders/{source.id}/sync-datarooms/', {}, format='json')
        assert ok_push.status_code == status.HTTP_200_OK
        assert not DataroomDocument.objects.filter(folder=synced_df, document=old_doc).exists()
        assert DataroomDocument.objects.filter(folder=synced_df, document=replacement_doc).exists()

    def test_hidden_folder_sharelink_settings_inherited_on_push(
        self, api_client, dataroom, user, organization
    ):
        source = _create_personal_folder(user, organization, "Confidential")
        initial_doc = _create_doc(user, organization, "Initial.pdf", folder=source)

        resp = api_client.post(
            f'/api/v1/datarooms/{dataroom.id}/add-content/',
            {'folder_ids': [str(source.id)], 'sync_folders': True},
            format='json',
        )
        assert resp.status_code == status.HTTP_200_OK
        synced_df = DataroomFolder.objects.get(dataroom=dataroom, source_folder=source)

        link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user,
            name="Restricted Link",
            allow_download=True,
            enable_watermark=False,
        )
        folder_setting, _ = ShareLinkDataroomSetting.objects.get_or_create(
            share_link=link,
            dataroom_folder=synced_df,
        )
        folder_setting.is_visible = False
        folder_setting.allow_download = False
        folder_setting.enable_watermark = True
        folder_setting.save()

        new_sub = _create_personal_folder(user, organization, "SecretSub", parent=source)
        new_doc = _create_doc(user, organization, "Secret.pdf", folder=new_sub)

        push_resp = api_client.post(f'/api/v1/folders/{source.id}/sync-datarooms/', {}, format='json')
        assert push_resp.status_code == status.HTTP_200_OK

        synced_sub = DataroomFolder.objects.get(dataroom=dataroom, source_folder=new_sub)
        synced_doc = DataroomDocument.objects.get(folder=synced_sub, document=new_doc)

        sub_setting = ShareLinkDataroomSetting.objects.get(share_link=link, dataroom_folder=synced_sub)
        doc_setting = ShareLinkDataroomSetting.objects.get(share_link=link, dataroom_document=synced_doc)
        assert sub_setting.is_visible is False
        assert sub_setting.allow_download is False
        assert sub_setting.enable_watermark is True
        assert doc_setting.is_visible is False
        assert doc_setting.allow_download is False
        assert doc_setting.enable_watermark is True

    def test_sync_root_recursive_unlink_and_child_unlink_rejected(
        self, api_client, dataroom, user, organization
    ):
        source = _create_personal_folder(user, organization, "RootSync")
        sub = _create_personal_folder(user, organization, "ChildSync", parent=source)
        doc1 = _create_doc(user, organization, "A.pdf", folder=source)
        doc2 = _create_doc(user, organization, "B.pdf", folder=sub)

        resp = api_client.post(
            f'/api/v1/datarooms/{dataroom.id}/add-content/',
            {'folder_ids': [str(source.id)], 'sync_folders': True},
            format='json',
        )
        assert resp.status_code == status.HTTP_200_OK
        root_df = DataroomFolder.objects.get(dataroom=dataroom, source_folder=source)
        child_df = DataroomFolder.objects.get(dataroom=dataroom, source_folder=sub)
        past = timezone.now() - timezone.timedelta(hours=1)
        DataroomFolder.objects.filter(id__in=[root_df.id, child_df.id]).update(updated_at=past)

        # Unlinking a synced child is rejected
        child_unlink = api_client.post(f'/api/v1/dataroom-folders/{child_df.id}/unlink/', {}, format='json')
        assert child_unlink.status_code == status.HTTP_400_BAD_REQUEST

        # Unlinking sync root detaches entire subtree and preserves all files
        root_unlink = api_client.post(f'/api/v1/dataroom-folders/{root_df.id}/unlink/', {}, format='json')
        assert root_unlink.status_code == status.HTTP_200_OK
        assert root_unlink.data['is_synced'] is False
        assert root_unlink.data['source_folder'] is None
        assert root_unlink.data['is_sync_root'] is False

        root_df.refresh_from_db()
        child_df.refresh_from_db()
        assert root_df.updated_at > past
        assert child_df.updated_at > past
        assert root_unlink.data['updated_at'] != past.isoformat()
        assert child_df.is_synced is False
        assert child_df.source_folder is None
        assert DataroomDocument.objects.filter(folder=root_df, document=doc1, is_synced=False).exists()
        assert DataroomDocument.objects.filter(folder=child_df, document=doc2, is_synced=False).exists()

        # Second unlink fails cleanly
        second_unlink = api_client.post(f'/api/v1/dataroom-folders/{root_df.id}/unlink/', {}, format='json')
        assert second_unlink.status_code == status.HTTP_400_BAD_REQUEST

        # Source folder and child no longer list this dataroom
        folders_resp = api_client.get('/api/v1/folders/')
        root_entry = next(f for f in folders_resp.data['sub_folders'] if f['id'] == str(source.id))
        assert root_entry['synced_datarooms'] == []

    def test_push_sync_appends_item_order_regardless_of_show_file_index(
        self, api_client, dataroom, user, organization
    ):
        dataroom.show_file_index = False
        dataroom.save(update_fields=['show_file_index'])
        source = _create_personal_folder(user, organization, "Ordered")
        doc1 = _create_doc(user, organization, "First.pdf", folder=source)

        api_client.post(
            f'/api/v1/datarooms/{dataroom.id}/add-content/',
            {'folder_ids': [str(source.id)], 'sync_folders': True},
            format='json',
        )
        synced_df = DataroomFolder.objects.get(dataroom=dataroom, source_folder=source)
        ddoc1 = DataroomDocument.objects.get(folder=synced_df, document=doc1)

        DataroomItemOrder.objects.create(
            dataroom=dataroom,
            parent_folder=synced_df,
            item_type=DataroomItemOrder.ITEM_TYPE_DOCUMENT,
            dataroom_document=ddoc1,
            position=0,
        )

        doc2 = _create_doc(user, organization, "Second.pdf", folder=source)
        sub2 = _create_personal_folder(user, organization, "SubTwo", parent=source)

        push_resp = api_client.post(f'/api/v1/folders/{source.id}/sync-datarooms/', {}, format='json')
        assert push_resp.status_code == status.HTTP_200_OK

        ddoc2 = DataroomDocument.objects.get(folder=synced_df, document=doc2)
        dsub2 = DataroomFolder.objects.get(dataroom=dataroom, parent=synced_df, source_folder=sub2)
        assert DataroomItemOrder.objects.filter(dataroom=dataroom, parent_folder=synced_df, dataroom_document=ddoc2, position=1).exists()
        assert DataroomItemOrder.objects.filter(dataroom=dataroom, parent_folder=synced_df, folder=dsub2, position=2).exists()

    def test_multi_target_same_room_quota_rollback_reports_accurate_counts(
        self, api_client, dataroom, user, organization
    ):
        from unittest.mock import patch
        from documents.services import QuotaExceededError

        source = _create_personal_folder(user, organization, "Shared")
        for _ in range(2):
            resp = api_client.post(
                f'/api/v1/datarooms/{dataroom.id}/add-content/',
                {'folder_ids': [str(source.id)], 'sync_folders': True},
                format='json',
            )
            assert resp.status_code == status.HTTP_200_OK

        call_count = 0

        def fail_on_second(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise QuotaExceededError("Quota exceeded on second target")
            return {'added_folders': 0, 'added_documents': 1, 'removed_folders': 0, 'removed_documents': 0}

        with patch('datarooms.services.reconcile_dataroom_folder_with_source', side_effect=fail_on_second):
            push_resp = api_client.post(f'/api/v1/folders/{source.id}/sync-datarooms/', {}, format='json')

        assert push_resp.status_code == status.HTTP_400_BAD_REQUEST
        assert push_resp.data['synced_count'] == 0
        assert push_resp.data['failed_count'] == 2
        assert len(push_resp.data['results']) == 2
        assert all(item['status'] == 'error' for item in push_resp.data['results'])
