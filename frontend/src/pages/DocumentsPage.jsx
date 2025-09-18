import { DocumentsList } from "../components/documents/DocumentsList";

// Mock data to simulate fetching from an API
const mockFolders = [
  { id: 'folder-1', name: 'Project Alpha', _count: { documents: 3 }, path: '/folder-1' },
  { id: 'folder-2', name: 'Marketing Materials', _count: { documents: 5 }, path: '/folder-2' },
];

const mockDocuments = [
  { id: 'doc-1', name: 'Q1 Report.pdf', links: [], _count: { links: 2, views: 15 } },
  { id: 'doc-2', name: 'Competitor Analysis.docx', links: [], _count: { links: 1, views: 7 } },
  { id: 'doc-3', name: 'Onboarding Presentation.pptx', links: [], _count: { links: 5, views: 42 } },
];

function DocumentsPage() {
  return (
    <div>
      <div id="documents-header-count"></div>
      <DocumentsList
        folders={mockFolders}
        documents={mockDocuments}
        loading={false}
        foldersLoading={false}
      />
    </div>
  );
}

export default DocumentsPage;
