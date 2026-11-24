import { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
  type EstateTask,
  type VaultDocument,
} from '../types/estate';
import { formatBytes } from '../utils/taskHelpers';

interface DocumentVaultProps {
  documents: VaultDocument[];
  tasks: EstateTask[];
  canEdit: boolean;
  onUploadDocument: (
    file: File,
    category: DocumentCategory,
    taskId: string,
    notes: string
  ) => Promise<void>;
  onUpdateDocument: (
    docId: string,
    updates: { name: string; category: DocumentCategory; taskId: string; notes: string }
  ) => Promise<void>;
  onDeleteDocument: (docId: string) => Promise<void>;
  onFetchBlob: (doc: VaultDocument) => Promise<Blob>;
}

export function DocumentVault({
  documents,
  tasks,
  canEdit,
  onUploadDocument,
  onUpdateDocument,
  onDeleteDocument,
  onFetchBlob,
}: DocumentVaultProps) {
  const [categoryFilter, setCategoryFilter] = useState<'all' | DocumentCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Upload state
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('Legal & Probate');
  const [uploadTaskId, setUploadTaskId] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Preview state
  const [previewDoc, setPreviewDoc] = useState<VaultDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Edit metadata modal
  const [editingDoc, setEditingDoc] = useState<VaultDocument | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<DocumentCategory>('General');
  const [editTaskId, setEditTaskId] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [copiedHashId, setCopiedHashId] = useState<string | null>(null);

  const filteredDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return documents.filter((d) => {
      if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
      if (q) {
        const taskTitle = tasks.find((t) => t.id === d.taskId)?.title || '';
        const hay = `${d.name} ${d.category} ${d.notes} ${d.sha256} ${taskTitle}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [documents, categoryFilter, searchQuery, tasks]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      await onUploadDocument(file, uploadCategory, uploadTaskId, uploadNotes);
      setUploadNotes('');
      setUploadTaskId('');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to upload file.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handlePreview = async (docItem: VaultDocument) => {
    setPreviewDoc(docItem);
    setPreviewLoading(true);
    setPreviewUrl(null);
    setPreviewText(null);
    try {
      const blob = await onFetchBlob(docItem);
      if (
        docItem.mimeType.startsWith('text/') ||
        docItem.name.endsWith('.csv') ||
        docItem.name.endsWith('.txt') ||
        docItem.name.endsWith('.md') ||
        docItem.name.endsWith('.json')
      ) {
        const text = await blob.text();
        setPreviewText(text);
      } else {
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewDoc(null);
    setPreviewUrl(null);
    setPreviewText(null);
  };

  const handleDownload = async (docItem: VaultDocument) => {
    const blob = await onFetchBlob(docItem);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = docItem.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openEditModal = (docItem: VaultDocument) => {
    setEditingDoc(docItem);
    setEditName(docItem.name);
    setEditCategory(docItem.category);
    setEditTaskId(docItem.taskId);
    setEditNotes(docItem.notes);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc) return;
    setSavingEdit(true);
    try {
      await onUpdateDocument(editingDoc.id, {
        name: editName,
        category: editCategory,
        taskId: editTaskId,
        notes: editNotes,
      });
      setEditingDoc(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const renderDocIcon = (mime: string, name: string) => {
    if (mime.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-[#1B4332] shrink-0" />;
    if (mime.includes('spreadsheet') || mime.includes('csv') || name.endsWith('.xlsx') || name.endsWith('.csv')) {
      return <FileSpreadsheet className="w-4 h-4 text-[#1B4332] shrink-0" />;
    }
    return <FileText className="w-4 h-4 text-[#1B4332] shrink-0" />;
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Header & Upload Panel */}
      <section className="bg-white border border-[#E4DFD3] rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-[#1C2420]">
              Secure Document Vault
            </h1>
            <p className="text-sm text-[#56635C] mt-1">
              Store PDFs, deeds, policy declarations, spreadsheets, and text records with SHA-256 integrity fingerprints.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1B4332]">
            <ShieldCheck className="w-4 h-4" />
            <span className="font-mono tabular-nums">{documents.length}</span> archived files
          </div>
        </div>

        {canEdit && (
          <div className="p-4 bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#1C2420] mb-1">
                  Category Bucket
                </label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value as DocumentCategory)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E4DFD3] rounded-lg"
                >
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C2420] mb-1">
                  Link to Task (Optional)
                </label>
                <select
                  value={uploadTaskId}
                  onChange={(e) => setUploadTaskId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E4DFD3] rounded-lg"
                >
                  <option value="">Category-level (Unlinked)</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      [{t.category}] {t.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C2420] mb-1">
                  Custody / Vault Notes
                </label>
                <input
                  type="text"
                  maxLength={400}
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="e.g., Original stored in bank box #412"
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E4DFD3] rounded-lg"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <span className="text-xs text-[#56635C]">
                Accepted: PDF, PNG/JPG, CSV/XLSX, TXT/MD/JSON (max 8 MB per file)
              </span>
              <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] rounded-lg cursor-pointer whitespace-nowrap">
                <Upload className="w-3.5 h-3.5" />
                {uploading ? 'Encrypting & Uploading...' : 'Upload Document'}
                <input
                  type="file"
                  className="hidden"
                  disabled={uploading}
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.csv,.xlsx,.xls,.ods,.txt,.md,.json"
                  onChange={handleFileSelected}
                />
              </label>
            </div>

            {uploadError && (
              <div className="p-2.5 text-xs text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded">
                {uploadError}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap cursor-pointer ${
              categoryFilter === 'all'
                ? 'bg-[#1B4332] text-white border-[#1B4332]'
                : 'bg-white text-[#4F5B54] border-[#E4DFD3] hover:bg-[#F4EFE4]'
            }`}
          >
            All ({documents.length})
          </button>
          {DOCUMENT_CATEGORIES.map((cat) => {
            const count = documents.filter((d) => d.category === cat).length;
            if (count === 0) return null;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-[#1B4332] text-white border-[#1B4332]'
                    : 'bg-white text-[#4F5B54] border-[#E4DFD3] hover:bg-[#F4EFE4]'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-[#78827B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search filename, SHA-256, notes..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#E4DFD3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25"
          />
        </div>
      </div>

      {/* Document Inventory */}
      {filteredDocs.length === 0 ? (
        <div className="bg-white border border-[#E4DFD3] rounded-xl p-10 text-center space-y-2">
          <p className="font-display text-lg font-semibold text-[#1C2420]">
            No vault documents found
          </p>
          <p className="text-sm text-[#56635C]">
            Upload wills, trusts, property deeds, life insurance policies, or account statements above to verify and share them with your executor.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#E4DFD3] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E4DFD3] bg-[#FBF9F4] text-[11px] font-semibold text-[#56635C]">
                  <th className="py-3 px-4">Document</th>
                  <th className="py-3 px-4">Category &amp; Linked Task</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">SHA-256 Fingerprint</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFECE4] text-sm">
                {filteredDocs.map((docItem) => {
                  const linkedTask = tasks.find((t) => t.id === docItem.taskId);
                  return (
                    <tr key={docItem.id} className="hover:bg-[#FBF9F4]/70">
                      <td className="py-3.5 px-4">
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5">{renderDocIcon(docItem.mimeType, docItem.name)}</div>
                          <div className="min-w-0">
                            <div className="font-medium text-[#1C2420] truncate max-w-[260px]">
                              {docItem.name}
                            </div>
                            {docItem.notes && (
                              <div className="text-xs text-[#56635C] truncate max-w-[260px]">
                                {docItem.notes}
                              </div>
                            )}
                            <div className="text-[11px] text-[#78827B]">
                              Uploaded by {docItem.uploadedByName}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs">
                        <div className="font-medium text-[#1B4332]">{docItem.category}</div>
                        <div className="text-[#56635C] truncate max-w-[220px]">
                          {linkedTask ? linkedTask.title : 'Category-level record'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs text-[#4F5B54] tabular-nums whitespace-nowrap">
                        {formatBytes(docItem.sizeBytes)}
                      </td>

                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(docItem.sha256);
                            setCopiedHashId(docItem.id);
                            setTimeout(() => setCopiedHashId(null), 1500);
                          }}
                          title="Copy full SHA-256 checksum"
                          className="inline-flex items-center gap-1.5 font-mono text-xs text-[#56635C] hover:text-[#1C2420] cursor-pointer"
                        >
                          <span>{docItem.sha256.slice(0, 14)}…</span>
                          {copiedHashId === docItem.id ? (
                            <Check className="w-3 h-3 text-[#1B5E3A]" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handlePreview(docItem)}
                            title="Preview document"
                            className="p-1.5 text-[#4F5B54] hover:text-[#1C2420] hover:bg-[#EFE9DC] rounded cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownload(docItem)}
                            title="Download document"
                            className="p-1.5 text-[#4F5B54] hover:text-[#1C2420] hover:bg-[#EFE9DC] rounded cursor-pointer"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(docItem)}
                                title="Edit metadata"
                                className="p-1.5 text-[#4F5B54] hover:text-[#1C2420] hover:bg-[#EFE9DC] rounded cursor-pointer"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteDocument(docItem.id)}
                                title="Delete document"
                                className="p-1.5 text-[#78827B] hover:text-[#B42318] hover:bg-[#FEF3F2] rounded cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inline Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-[#1C2420]/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E4DFD3] rounded-xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E4DFD3] bg-[#FBF9F4] flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="font-semibold text-sm text-[#1C2420] truncate">{previewDoc.name}</div>
                <div className="text-[11px] font-mono text-[#56635C]">
                  SHA-256: {previewDoc.sha256}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownload(previewDoc)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#1B4332] rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={closePreview}
                  className="p-1.5 text-[#56635C] hover:text-[#1C2420] rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-[#F4EFE4] p-4 flex items-center justify-center">
              {previewLoading ? (
                <div className="text-sm text-[#56635C]">Reassembling verified file...</div>
              ) : previewText !== null ? (
                <pre className="w-full h-full bg-white border border-[#E4DFD3] rounded-lg p-4 text-xs font-mono text-[#1C2420] overflow-auto whitespace-pre-wrap">
                  {previewText}
                </pre>
              ) : previewUrl && previewDoc.mimeType.startsWith('image/') ? (
                <img
                  src={previewUrl}
                  alt={previewDoc.name}
                  className="max-w-full max-h-full object-contain rounded border border-[#E4DFD3] bg-white"
                />
              ) : previewUrl && previewDoc.mimeType === 'application/pdf' ? (
                <iframe
                  src={previewUrl}
                  title={previewDoc.name}
                  className="w-full h-full rounded border border-[#E4DFD3] bg-white"
                />
              ) : (
                <div className="bg-white border border-[#E4DFD3] rounded-xl p-8 text-center max-w-md space-y-3">
                  <FileSpreadsheet className="w-8 h-8 text-[#1B4332] mx-auto" />
                  <p className="text-sm font-medium text-[#1C2420]">
                    Inline preview is not available for {previewDoc.mimeType || 'this file format'}.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleDownload(previewDoc)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1B4332] rounded-lg cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download File
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Metadata Modal */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 bg-[#1C2420]/40 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E4DFD3] rounded-xl max-w-lg w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E4DFD3] bg-[#FBF9F4] flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[#1C2420]">
                Edit Document Metadata
              </h3>
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                className="p-1 text-[#56635C] hover:text-[#1C2420] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#1C2420] mb-1">File Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1C2420] mb-1">Category</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as DocumentCategory)}
                  className="w-full px-3 py-2 text-sm bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg"
                >
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1C2420] mb-1">Linked Task</label>
                <select
                  value={editTaskId}
                  onChange={(e) => setEditTaskId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg"
                >
                  <option value="">Category-level (Unlinked)</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>[{t.category}] {t.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1C2420] mb-1">Notes</label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  className="px-4 py-2 text-xs font-medium text-[#4F5B54] border border-[#E4DFD3] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 text-xs font-medium text-white bg-[#1B4332] rounded-lg cursor-pointer"
                >
                  {savingEdit ? 'Saving...' : 'Save Metadata'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
