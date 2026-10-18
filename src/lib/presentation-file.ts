import JSZip from 'jszip';
import type PptxGenJS from 'pptxgenjs';

/** Repair PptxGenJS 4 OOXML ordering and dangling master declarations. */
export async function presentationBytes(pptx: PptxGenJS): Promise<Uint8Array> {
  const bytes = await pptx.write({ outputType: 'arraybuffer', compression: true });
  const zip = await JSZip.loadAsync(bytes);
  for (const name of Object.keys(zip.files).filter(x => /^ppt\/charts\/chart\d+\.xml$/.test(x))) {
    const entry = zip.file(name);
    if (!entry) continue;
    let xml = await entry.async('string');
    xml = xml.replace(/<c:lineChart>/g, '<c:lineChart><c:grouping val="standard"/>');
    zip.file(name, xml);
  }
  const types = zip.file('[Content_Types].xml');
  if (types) {
    const xml = (await types.async('string')).replace(/<Override\b[^>]*PartName="([^"]+)"[^>]*\/>/g, (whole, name: string) => zip.file(name.replace(/^\//, '')) ? whole : '');
    zip.file('[Content_Types].xml', xml);
  }
  const presentation = zip.file('ppt/presentation.xml');
  if (presentation) {
    let xml = await presentation.async('string');
    const order = ['sldMasterIdLst', 'notesMasterIdLst', 'handoutMasterIdLst', 'sldIdLst', 'sldSz', 'notesSz'];
    const blocks: string[] = [];
    for (const tag of order) {
      const re = new RegExp(`<p:${tag}\\b[^>]*(?:/>|>[\\s\\S]*?</p:${tag}>)`);
      const found = xml.match(re)?.[0];
      if (found) { blocks.push(found); xml = xml.replace(found, ''); }
    }
    xml = xml.replace(/(<p:presentation\b[^>]*>)/, `$1${blocks.join('')}`);
    zip.file('ppt/presentation.xml', xml);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}