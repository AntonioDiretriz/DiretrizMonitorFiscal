import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WorkBook } from 'xlsx';
import { readWorkbook, getSheetNames, autoDetectSheet } from '@/lib/excel-parser';
import { supabase } from '@/integrations/supabase/client';
import { Building2 } from 'lucide-react';

interface EmpresaOpt {
  id: string;
  razao_social: string;
  cnpj: string;
}

interface UploadSectionProps {
  onProcess: (xmlFiles: File[], workbook: WorkBook | null, selectedSheets: string[], empresaId: string) => void;
  isProcessing: boolean;
  progressLabel?: string;
}

export function UploadSection({ onProcess, isProcessing, progressLabel }: UploadSectionProps) {
  const [xmlFiles, setXmlFiles] = useState<File[]>([]);
  const [workbook, setWorkbook] = useState<WorkBook | null>(null);
  const [excelFileName, setExcelFileName] = useState('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOpt[]>([]);
  const [empresaId, setEmpresaId] = useState<string>('');
  const [readingExcel, setReadingExcel] = useState(false);
  const [excelError, setExcelError] = useState('');
  const xmlInputRef = useRef<HTMLInputElement>(null);
  const xmlFolderInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase
      .from('empresas')
      .select('id, razao_social, cnpj')
      .eq('ativa', true)
      .order('razao_social', { ascending: true })
      .then(({ data }) => {
        if (data) setEmpresas(data as EmpresaOpt[]);
      });
  }, []);

  const handleXmlDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith('.xml'));
    setXmlFiles((prev) => [...prev, ...files]);
  }, []);

  const handleXmlSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.name.toLowerCase().endsWith('.xml'));
    if (files.length > 0) setXmlFiles((prev) => [...prev, ...files]);
  }, []);

  const handleExcelSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFileName(file.name);
    setExcelError('');
    setReadingExcel(true);
    setWorkbook(null);
    setSheetNames([]);
    setSelectedSheets([]);
    try {
      const buffer = await file.arrayBuffer();
      // dá um tick para a interface pintar o estado "Lendo planilha…"
      await new Promise((r) => setTimeout(r, 0));
      const wb = readWorkbook(buffer);
      const names = getSheetNames(wb);
      const auto = autoDetectSheet(wb);
      setWorkbook(wb);
      setSheetNames(names);
      setSelectedSheets(auto ? [auto] : names.length > 0 ? [names[0]] : []);
    } catch (err) {
      setExcelError(err instanceof Error ? err.message : 'Não foi possível ler esta planilha.');
    } finally {
      setReadingExcel(false);
    }
  }, []);

  const toggleSheet = (name: string) => {
    setSelectedSheets((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    );
  };

  const canProcess = !!empresaId && !readingExcel && (!workbook || selectedSheets.length > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground">Confronto NF-e</h1>
        <p className="mt-2 text-muted-foreground">
          Confronte XMLs de NF-e com o Registro de Entrada ICMS
        </p>
      </div>

      {/* Empresa selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            Empresa <span className="text-destructive">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={empresaId} onValueChange={setEmpresaId}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder={empresas.length === 0 ? 'Nenhuma empresa cadastrada' : 'Selecione a empresa…'} />
            </SelectTrigger>
            <SelectContent>
              {empresas.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.razao_social} <span className="text-xs text-muted-foreground">· {e.cnpj}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">
            Os XMLs ficam armazenados por empresa. NFs de meses anteriores são reutilizadas automaticamente.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* XML Upload Card */}
        <Card
          className="border-2 border-dashed transition-colors hover:border-primary/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleXmlDrop}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                XML
              </span>
              XMLs das NF-e <span className="text-xs font-normal text-muted-foreground">(opcional se já houver base)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="text-center text-sm text-muted-foreground">
                Arraste arquivos .xml aqui ou
              </div>
              <input
                ref={xmlInputRef}
                type="file"
                accept=".xml"
                multiple
                className="hidden"
                onChange={handleXmlSelect}
              />
              <input
                ref={xmlFolderInputRef}
                type="file"
                className="hidden"
                onChange={handleXmlSelect}
                {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => xmlFolderInputRef.current?.click()}
                  className="border-primary/30 text-primary hover:bg-primary/5"
                >
                  Selecionar Pasta
                </Button>
                <Button
                  variant="outline"
                  onClick={() => xmlInputRef.current?.click()}
                  className="border-primary/30 text-primary hover:bg-primary/5"
                >
                  Selecionar Arquivos
                </Button>
              </div>
              {xmlFiles.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {xmlFiles.length}
                  </span>
                  <span className="text-sm font-medium">
                    {xmlFiles.length === 1 ? 'arquivo carregado' : 'arquivos carregados'}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setXmlFiles([])}
                    className="h-6 px-2 text-xs text-muted-foreground"
                  >
                    Limpar
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Excel Upload Card */}
        <Card className="border-2 border-dashed transition-colors hover:border-foreground/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/10 text-sm font-bold text-foreground">
                XLS
              </span>
              Planilha de Registro de Entrada <span className="text-xs font-normal text-muted-foreground">(opcional se já houver base)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="text-center text-sm text-muted-foreground">
                Arquivo .xlsx ou .xlsb
              </div>
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xlsb,.xls"
                className="hidden"
                onChange={handleExcelSelect}
              />
              <Button
                variant="outline"
                disabled={readingExcel}
                onClick={() => excelInputRef.current?.click()}
                className="border-foreground/30 text-foreground hover:bg-foreground/5"
              >
                {readingExcel ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
                    Lendo planilha…
                  </span>
                ) : (
                  'Selecionar Planilha'
                )}
              </Button>
              {excelFileName && (
                <div className="text-center">
                  <p className="text-sm font-medium">{excelFileName}</p>
                  {readingExcel ? (
                    <p className="text-xs text-muted-foreground">Lendo abas da planilha…</p>
                  ) : excelError ? (
                    <p className="text-xs text-destructive">{excelError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{sheetNames.length} aba(s) encontrada(s)</p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sheet Selector */}
      {sheetNames.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Selecione as abas para processar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {sheetNames.map((name) => (
                <button
                  key={name}
                  onClick={() => toggleSheet(name)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    selectedSheets.includes(name)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-foreground hover:bg-muted'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Process Button */}
      <div className="flex flex-col items-center gap-2">
        <Button
          size="lg"
          disabled={!canProcess || isProcessing}
          onClick={() => empresaId && onProcess(xmlFiles, workbook, selectedSheets, empresaId)}
          className="bg-primary px-8 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isProcessing ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              Processando...
            </span>
          ) : (
            'Processar Confronto'
          )}
        </Button>
        {isProcessing && progressLabel && (
          <p className="text-xs text-muted-foreground">{progressLabel}</p>
        )}
      </div>
    </div>
  );
}
