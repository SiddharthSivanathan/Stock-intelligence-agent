import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Document {
  id: number;
  title: string;
  filename: string | null;
  source_type: string;
  source_url: string | null;
  symbol: string | null;
  chunk_count: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Citation {
  chunk_id: string;
  document_id: number;
  document_title: string;
  page: number | null;
  score: number;
  snippet: string;
}

export interface RAGAnswer {
  question: string;
  answer: string;
  citations: Citation[];
  provider: string;
  model: string;
}

export function useDocuments() {
  return useQuery({
    queryKey: ['rag-documents'],
    queryFn: async () => {
      const { data } = await api.get<Document[]>('/rag/documents');
      return data;
    },
    refetchInterval: (query) => {
      // Poll while any doc is still processing
      const data = query.state.data as Document[] | undefined;
      const anyPending = data?.some(
        (d) => d.status === 'pending' || d.status === 'processing'
      );
      return anyPending ? 2000 : false;
    },
  });
}

export function useIngestText() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { title: string; text: string; symbol?: string }) => {
      const { data } = await api.post<Document>('/rag/ingest/text', body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rag-documents'] }),
  });
}

export function useIngestFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { file: File; title?: string; symbol?: string }) => {
      const fd = new FormData();
      fd.append('file', params.file);
      if (params.title) fd.append('title', params.title);
      if (params.symbol) fd.append('symbol', params.symbol);
      const { data } = await api.post<Document>('/rag/ingest/file', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rag-documents'] }),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/rag/documents/${id}`);
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rag-documents'] }),
  });
}

export function useRagQuery() {
  return useMutation({
    mutationFn: async (body: { question: string; k?: number; symbol?: string }) => {
      const { data } = await api.post<RAGAnswer>('/rag/query', body);
      return data;
    },
  });
}
