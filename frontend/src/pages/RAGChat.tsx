import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Send, Trash2, Upload } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDeleteDocument,
  useDocuments,
  useIngestFile,
  useIngestText,
  useRagQuery,
  type Citation,
  type RAGAnswer,
} from '@/hooks/api/useRag';
import { toast } from '@/stores/toast';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<string, 'bullish' | 'neutral' | 'warning' | 'bearish'> = {
  ready: 'bullish',
  processing: 'warning',
  pending: 'neutral',
  failed: 'bearish',
};

export default function RAGChat() {
  const { data: documents = [], isLoading: docsLoading } = useDocuments();
  const ingestFile = useIngestFile();
  const ingestText = useIngestText();
  const deleteDoc = useDeleteDocument();
  const rag = useRagQuery();

  const [question, setQuestion] = useState('');
  const [symbol, setSymbol] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [textBody, setTextBody] = useState('');
  const [answer, setAnswer] = useState<RAGAnswer | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await ingestFile.mutateAsync({
        file,
        symbol: symbol.trim() || undefined,
      });
      toast('success', `Uploaded ${file.name}`, 'Background processing started.');
    } catch {
      toast('error', `Upload failed`);
    } finally {
      e.target.value = '';
    }
  }

  async function onIngestText(e: React.FormEvent) {
    e.preventDefault();
    if (!textTitle.trim() || textBody.trim().length < 10) return;
    try {
      await ingestText.mutateAsync({
        title: textTitle.trim(),
        text: textBody,
        symbol: symbol.trim() || undefined,
      });
      toast('success', `Ingested "${textTitle}"`);
      setTextTitle('');
      setTextBody('');
    } catch {
      toast('error', 'Ingest failed');
    }
  }

  async function onAsk(e: React.FormEvent) {
    e.preventDefault();
    if (question.trim().length < 3) return;
    try {
      const res = await rag.mutateAsync({
        question,
        k: 5,
        symbol: symbol.trim() || undefined,
      });
      setAnswer(res);
    } catch {
      toast('error', 'Query failed');
    }
  }

  async function onDelete(id: number, title: string) {
    if (!confirm(`Delete "${title}"?`)) return;
    try {
      await deleteDoc.mutateAsync(id);
      toast('success', `Deleted "${title}"`);
    } catch {
      toast('error', 'Delete failed');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">RAG Chat</h1>
        <p className="text-sm text-muted mt-1">
          Upload financial filings, ask questions, get cited answers.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted" />
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Input
                placeholder="Tag with symbol (optional)"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="uppercase"
                maxLength={20}
              />
              <p className="text-xs text-muted mt-1">
                Used by the Fundamentals Agent to filter retrieval.
              </p>
            </div>

            <label className="block mb-2">
              <span className="sr-only">Upload file</span>
              <div className="cursor-pointer border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-accent/40 transition-colors">
                <Upload className="h-5 w-5 mx-auto text-muted" />
                <span className="text-xs text-muted block mt-1">
                  Click to upload PDF / HTML / text
                </span>
              </div>
              <input
                type="file"
                onChange={onFileChange}
                accept=".pdf,.html,.htm,.txt"
                className="hidden"
                disabled={ingestFile.isPending}
              />
            </label>

            <div className="mt-6 space-y-2 max-h-[400px] overflow-y-auto -mx-2 px-2">
              {docsLoading ? (
                <Skeleton className="h-24" />
              ) : documents.length === 0 ? (
                <p className="text-sm text-muted">No documents uploaded yet.</p>
              ) : (
                documents.map((d) => (
                  <div
                    key={d.id}
                    className="text-sm border border-border rounded-md p-2 bg-panel-2/40 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate" title={d.title}>
                          {d.title}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted">
                          <Badge variant={STATUS_VARIANT[d.status] ?? 'neutral'}>
                            {d.status}
                          </Badge>
                          <span>{d.chunk_count} chunks</span>
                          {d.symbol && (
                            <span className="font-mono">{d.symbol}</span>
                          )}
                        </div>
                        {d.error && (
                          <div className="text-xs text-danger mt-1 truncate">
                            {d.error}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(d.id, d.title)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={`Delete ${d.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Ask a question</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={onAsk} className="space-y-3">
                <Textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. What was Apple's iPhone revenue last quarter?"
                  rows={3}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted">
                    {symbol ? (
                      <>
                        Filtering to symbol{' '}
                        <span className="font-mono text-text">{symbol}</span>
                      </>
                    ) : (
                      'Searches across all your documents'
                    )}
                  </p>
                  <Button
                    type="submit"
                    disabled={rag.isPending || question.trim().length < 3}
                  >
                    <Send className="h-4 w-4" />
                    {rag.isPending ? 'Thinking…' : 'Ask'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {answer && <AnswerView answer={answer} />}

          <Card>
            <CardHeader>
              <CardTitle>Paste text directly</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={onIngestText} className="space-y-3">
                <Input
                  placeholder="Title"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  maxLength={500}
                />
                <Textarea
                  placeholder="Paste a press release, earnings transcript, etc."
                  value={textBody}
                  onChange={(e) => setTextBody(e.target.value)}
                  rows={5}
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={
                      ingestText.isPending ||
                      !textTitle.trim() ||
                      textBody.trim().length < 10
                    }
                  >
                    Ingest text
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AnswerView({ answer }: { answer: RAGAnswer }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card className="glass">
        <CardHeader>
          <CardTitle>Answer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm whitespace-pre-line leading-relaxed">{answer.answer}</p>
          <div className="text-xs text-muted">
            {answer.provider} · {answer.model}
          </div>

          {answer.citations.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-border">
              <div className="text-xs uppercase tracking-wider text-muted">
                Citations
              </div>
              {answer.citations.map((c, i) => (
                <CitationRow key={c.chunk_id} index={i + 1} citation={c} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function CitationRow({ index, citation }: { index: number; citation: Citation }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-md bg-panel-2/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left p-3 flex items-start gap-3 text-sm"
      >
        <span className="font-mono text-accent shrink-0">[{index}]</span>
        <span className="flex-1">
          <span className="font-medium">{citation.document_title}</span>
          {citation.page && (
            <span className="text-muted ml-2">· page {citation.page}</span>
          )}
        </span>
        <span className="text-xs text-muted font-mono">
          {(citation.score * 100).toFixed(1)}%
        </span>
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all',
          open ? 'max-h-96' : 'max-h-0'
        )}
      >
        <p className="px-3 pb-3 text-xs text-muted leading-relaxed">
          {citation.snippet}
        </p>
      </div>
    </div>
  );
}
