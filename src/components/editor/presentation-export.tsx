import { useState } from 'react';
import { Presentation, Download, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { COVER_BUCKET } from '@/lib/covers';
import { DEFAULT_PRESENTATION_OPTIONS, presentationData, type PresentationInput, type PresentationOptions, type PresentationType } from '@/lib/presentation-data';

async function pngData(file: Blob): Promise<string> {
  const image = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const ratio = Math.max(1600 / image.width, 476 / image.height);
  canvas.width = 1600; canvas.height = 476;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('Cannot prepare the cover image.');
  ctx.drawImage(image, (1600 - image.width * ratio) / 2, (476 - image.height * ratio) / 2, image.width * ratio, image.height * ratio); image.close();
  return canvas.toDataURL('image/png');
}
export function PresentationExport({ input, coverPath }: { input: PresentationInput; coverPath: string | null }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PresentationOptions>({ ...DEFAULT_PRESENTATION_OPTIONS });
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<{ blob: Blob; name: string } | null>(null);
  const invalidate = () => setReady(null);
  const generate = async () => {
    setBusy(true); setReady(null);
    try {
      let data: string | undefined;
      if (image) data = await pngData(image);
      else if (coverPath) {
        const { data: photo, error } = await supabase.storage.from(COVER_BUCKET).download(coverPath);
        if (!error && photo) data = await pngData(photo);
        else toast.warning('The project photo is unavailable; the title will use text only.');
      }
      const { buildPresentation } = await import('@/lib/presentation-pptx');
      const { presentationBytes } = await import('@/lib/presentation-file');
      const snapshot = presentationData(structuredClone(input));
      const pptx = buildPresentation(snapshot, options, data);
      const bytes = await presentationBytes(pptx);
      const output = new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      const clean = (s: string) => s.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 70) || 'Project';
      setReady({ blob: output, name: `${clean(input.project.name)}-${clean(input.scenario.name)}-${options.type}.pptx` });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not generate the presentation.'); }
    finally { setBusy(false); }
  };
  const download = () => {
    if (!ready) return;
    const file = new File([ready.blob], ready.name, { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
      void navigator.share({ files: [file], title: ready.name }).catch(error => { if (error.name !== 'AbortError') toast.error('Could not share this file.'); });
      return;
    }
    const url = URL.createObjectURL(ready.blob);
    const a = document.createElement('a'); a.href = url; a.download = ready.name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  return <>
    <Button variant="outline" onClick={() => { setOpen(true); setReady(null); }}><Presentation className="size-4" />Generate Presentation</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Generate Presentation</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{input.project.name} · {input.scenario.name}</p>
        <div className="space-y-2"><Label>Presentation type</Label><Select disabled={busy} value={options.type} onValueChange={v => { setOptions(o => ({ ...o, type: v as PresentationType })); invalidate(); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="executive">Executive Summary · 4–5 slides</SelectItem>
          <SelectItem value="investment">Investment Case · 8–10 slides</SelectItem>
          <SelectItem value="detailed">Detailed Financial Review · 12–15 slides</SelectItem>
        </SelectContent></Select></div>
        <div className="space-y-3">{([['charts', 'Financial charts'], ['benchmarks', 'Benchmark comparisons'], ['notes', 'Presenter notes']] as const).map(([key, label]) => <Label key={key} className="flex items-center gap-3"><Checkbox disabled={busy} checked={options[key]} onCheckedChange={v => { setOptions(o => ({ ...o, [key]: v === true })); invalidate(); }} />{label}</Label>)}</div>
        <div className="space-y-2"><Label htmlFor="presentation-image">Cover image (optional)</Label><Input id="presentation-image" type="file" accept="image/*" disabled={busy} onChange={e => { const file = e.target.files?.[0] ?? null; if (file && file.size > 20 * 1024 * 1024) { toast.error('Choose an image smaller than 20 MB.'); return; } setImage(file); invalidate(); }} /></div>
        <div className="flex justify-end gap-2"><Button disabled={busy} onClick={() => void generate()}>{busy && <LoaderCircle className="size-4 animate-spin" />}{busy ? 'Preparing…' : ready ? 'Regenerate' : 'Generate'}</Button>{ready && <Button onClick={download}><Download className="size-4" />Download .pptx</Button>}</div>
      </DialogContent>
    </Dialog>
  </>;
}