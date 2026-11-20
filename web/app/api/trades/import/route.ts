import { importOrderSummary, TradeInputError } from '@/lib/trades-service';
import { tradesRoute } from '@/lib/trades-http';
import { XLSX_MAX_BYTES } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';

// multipart form: file (broker .xlsx order summary), date (optional YYYY-MM-DD), save ("1" to write, otherwise preview only)
export function POST(request: Request) {
  return tradesRoute(request, 'import', async () => {
    if (Number(request.headers.get('content-length') ?? 0) > XLSX_MAX_BYTES * 2) throw new TradeInputError('The file is too large.');
    const form = await request.formData().catch((e: unknown) => { throw new TradeInputError('Upload the file as a form.', { cause: e }); });
    const file = form.get('file');
    if (!(file instanceof File)) throw new TradeInputError('Choose the broker order summary (.xlsx) file.');
    // Chunked uploads carry no content-length, so the real size is checked again here.
    if (file.size > XLSX_MAX_BYTES) throw new TradeInputError('The file is too large. Export one day or one month at a time.');
    // Phones may upload the file under a storage id, so they send the real file name separately.
    const named = form.get('fileName');
    const fileName = typeof named === 'string' && named.trim() ? named.trim().slice(0, 200) : file.name;
    if (!/\.xlsx$/i.test(fileName)) throw new TradeInputError('Only Excel .xlsx files can be imported for now.');
    const date = typeof form.get('date') === 'string' && form.get('date') ? String(form.get('date')) : null;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new TradeInputError('Date must look like 2026-11-19.');
    return importOrderSummary(new Uint8Array(await file.arrayBuffer()), fileName, date, form.get('save') === '1');
  });
}
