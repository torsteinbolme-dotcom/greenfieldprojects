// @vitest-environment node
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { writeFile, mkdir } from 'node:fs/promises';
import { projectMountain } from '@/exampleProject';
import { safeCalculate } from '@/lib/model';
import { presentationData, DEFAULT_PRESENTATION_OPTIONS, type PresentationType } from '@/lib/presentation-data';
import { buildPresentation } from '@/lib/presentation-pptx';

function fixture(a = projectMountain) {
  const { result } = safeCalculate(a);
  if (!result) throw Error('Fixture must calculate');
  return presentationData({ project: { name: a.name, location: 'Norway', benchmark_config: {} }, scenario: { name: 'Base', kind: 'base' }, assumptions: a, result, assets: [], records: [], version: 1 });
}
describe('presentation export', () => {
  it('reads the exact engine investment values, Year 3 and F&B rows without changing assumptions', () => {
    const before = JSON.stringify(projectMountain);
    const d = fixture();
    expect(d.y3).toEqual(d.result.rows[2]);
    expect(d.y3?.calendarYear).toBe(projectMountain.openingYear + 2);
    expect(d.split?.fb.revenue).toBe(d.result.rows[2]?.fbRevenue);
    expect(d.result.totalEquityInvested).toBe(d.result.equity + d.result.additionalEquity);
    expect(JSON.stringify(projectMountain)).toBe(before);
  });
  it('keeps scenario forecasts and exit selections isolated', () => {
    const base = fixture();
    const other = fixture({ ...projectMountain, name: 'Alternate', initialPassengers: 12345, exitYear: 5, performanceYear: 4 });
    expect(other.result.rows[0]?.passengers).toBe(12345);
    expect(other.exit?.year).toBe(5);
    expect(other.perf?.year).toBe(4);
    expect(other.y3?.year).toBe(3);
    expect(base.result.rows[0]?.passengers).toBe(projectMountain.initialPassengers);
  });
  it.each([['executive', 5], ['investment', 10], ['detailed', 14]] as const)('generates editable %s slides and chart data with no benchmark fabrication', async (type, count) => {
    const d = fixture();
    const bytes = await buildPresentation(d, { ...DEFAULT_PRESENTATION_OPTIONS, type }).write({ outputType: 'arraybuffer' });
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files).filter(x => /^ppt\/slides\/slide\d+\.xml$/.test(x));
    expect(slides).toHaveLength(count);
    expect(Object.keys(zip.files).filter(x => /^ppt\/charts\/chart\d+\.xml$/.test(x)).length).toBeGreaterThan(0);
    const xml = (await Promise.all(slides.map(x => zip.file(x)?.async('string')))).join('\n');
    expect(xml).toContain('Benchmark comparison unavailable');
    const chartFiles = Object.keys(zip.files).filter(x => /^ppt\/charts\/chart\d+\.xml$/.test(x));
    const charts = (await Promise.all(chartFiles.map(x => zip.file(x)?.async('string')))).join('');
    expect(charts).toContain(String((d.result.rows[0]?.revenue ?? 0) / 1e6));
    await mkdir('/tmp/presentation-qa', { recursive: true });
    await writeFile(`/tmp/presentation-qa/${type}.pptx`, new Uint8Array(bytes as ArrayBuffer));
  });
  it.each([['executive', 4], ['investment', 9], ['detailed', 13]] as [PresentationType, number][])('omits optional content for %s', async (type, count) => {
    const bytes = await buildPresentation(fixture(), { type, charts: false, benchmarks: false, notes: false }).write({ outputType: 'arraybuffer' });
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).filter(x => /^ppt\/slides\/slide\d+\.xml$/.test(x))).toHaveLength(count);
    expect(Object.keys(zip.files).filter(x => /^ppt\/charts\/chart\d+\.xml$/.test(x))).toHaveLength(0);
    const notes = (await Promise.all(Object.keys(zip.files).filter(x => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(x)).map(x => zip.file(x)?.async('string')))).join('');
    expect(notes).not.toContain('Source: active scenario');
  });
});