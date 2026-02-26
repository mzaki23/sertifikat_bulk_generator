import React, { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const STANDARD_FONTS = [
  { label: 'Helvetica', value: StandardFonts.Helvetica },
  { label: 'Helvetica Bold', value: StandardFonts.HelveticaBold },
  { label: 'Times Roman', value: StandardFonts.TimesRoman },
  { label: 'Times Roman Bold', value: StandardFonts.TimesRomanBold },
  { label: 'Courier', value: StandardFonts.Courier },
];

const hexToRgbPdf = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 0, g: 0, b: 0 };
};

function App() {
  const [templateFile, setTemplateFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [status, setStatus] = useState('');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [csvUrl, setCsvUrl] = useState('');
  const [isFetchingCsv, setIsFetchingCsv] = useState(false);
  
  // FITUR BARU: Opsi Format Export (pdf, png, jpeg)
  const [exportFormat, setExportFormat] = useState('pdf');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  
  const canvasRef = useRef(null);
  const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
  const [customFonts, setCustomFonts] = useState([]);

  const [fields, setFields] = useState([
    { id: Date.now(), colName: '', x: 0, y: 0, size: 40, fontValue: StandardFonts.HelveticaBold, color: '#000000', scaleX: 1, scaleY: 1, rotate: 0, lockRatio: true }
  ]);
  const [activeFieldId, setActiveFieldId] = useState(fields[0].id);

  const [interaction, setInteraction] = useState({ mode: null, startX: 0, startY: 0, centerX: 0, centerY: 0, initialField: null });

  // Event Listener Mouse untuk Transform di Canvas
  useEffect(() => {
    const onMouseMove = (e) => {
      if (!interaction.mode || !interaction.initialField) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleXRatio = canvas.width / rect.width;
      const scaleYRatio = canvas.height / rect.height;

      setFields(prevFields => prevFields.map(f => {
        if (f.id === interaction.initialField.id) {
          if (interaction.mode === 'move') {
            const dx = (e.clientX - interaction.startX) * scaleXRatio;
            const dy = (e.clientY - interaction.startY) * scaleYRatio;
            return { ...f, x: Math.round(interaction.initialField.x + dx), y: Math.round(interaction.initialField.y - dy) };
          }
          if (interaction.mode === 'resize') {
            const dx = e.clientX - interaction.startX;
            const dy = e.clientY - interaction.startY;
            let newScaleX = Math.max(0.1, interaction.initialField.scaleX + (dx / 100));
            let newScaleY = Math.max(0.1, interaction.initialField.scaleY + (dy / 100));
            if (f.lockRatio) newScaleY = newScaleX;
            return { ...f, scaleX: Number(newScaleX.toFixed(2)), scaleY: Number(newScaleY.toFixed(2)) };
          }
          if (interaction.mode === 'rotate') {
            const angleRad = Math.atan2(e.clientY - interaction.centerY, e.clientX - interaction.centerX);
            let angleDeg = angleRad * (180 / Math.PI);
            angleDeg = (angleDeg + 90) % 360;
            return { ...f, rotate: Math.round(angleDeg) };
          }
        }
        return f;
      }));
    };

    const onMouseUp = () => setInteraction({ mode: null, startX: 0, startY: 0, centerX: 0, centerY: 0, initialField: null });

    if (interaction.mode) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    } else {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [interaction]);

  const onMouseDownMove = (e, field) => { e.stopPropagation(); e.preventDefault(); setActiveFieldId(field.id); setInteraction({ mode: 'move', startX: e.clientX, startY: e.clientY, initialField: { ...field } }); };
  const onMouseDownResize = (e, field) => { e.stopPropagation(); e.preventDefault(); setActiveFieldId(field.id); setInteraction({ mode: 'resize', startX: e.clientX, startY: e.clientY, initialField: { ...field } }); };
  const onMouseDownRotate = (e, field) => {
    e.stopPropagation(); e.preventDefault(); setActiveFieldId(field.id);
    const el = document.getElementById(`field-overlay-${field.id}`);
    if (el) {
      const rect = el.getBoundingClientRect();
      setInteraction({ mode: 'rotate', centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2, initialField: { ...field } });
    }
  };

  const handleTemplateUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setTemplateFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          setPdfDimensions({ width: img.width, height: img.height });
          const canvas = canvasRef.current;
          const context = canvas.getContext('2d');
          canvas.width = img.width; canvas.height = img.height;
          context.drawImage(img, 0, 0);
          setFields(fields.map(f => ({ ...f, x: img.width / 2, y: img.height / 2 })));
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    } else {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.0 });
        setPdfDimensions({ width: viewport.width, height: viewport.height });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        setFields(fields.map(f => ({ ...f, x: viewport.width / 2, y: viewport.height / 2 })));
      } catch (error) { alert("Gagal membaca preview PDF."); }
    }
  };

  const handleCanvasClick = (e) => {
    if (interaction.mode) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const pdfY = canvas.height - ((e.clientY - rect.top) * scaleY);
    setFields(fields.map(field => field.id === activeFieldId ? { ...field, x: Math.round((e.clientX - rect.left) * scaleX), y: Math.round(pdfY) } : field));
  };

  const handleCsvUpload = (e) => { Papa.parse(e.target.files[0], { header: true, skipEmptyLines: true, complete: (res) => { setHeaders(res.meta.fields); setCsvData(res.data); if (res.meta.fields.length > 0) setFields(fields.map(f => ({ ...f, colName: res.meta.fields[0] }))); }}); };
  const handleFetchCsv = () => { if (!csvUrl) return; setIsFetchingCsv(true); Papa.parse(csvUrl, { download: true, header: true, skipEmptyLines: true, complete: (res) => { setHeaders(res.meta.fields); setCsvData(res.data); setIsFetchingCsv(false); setStatus('Data Live Berhasil dimuat!'); setTimeout(() => setStatus(''), 3000); }, error: () => { alert("Gagal fetch CSV."); setIsFetchingCsv(false); }}); };
  const handleFontUpload = async (e) => { const files = Array.from(e.target.files); if (files.length === 0) return; const newFonts = []; for (const file of files) { newFonts.push({ label: file.name, value: file.name, bytes: await file.arrayBuffer(), isCustom: true }); } setCustomFonts([...customFonts, ...newFonts]); if (newFonts.length > 0) updateField(activeFieldId, 'fontValue', newFonts[0].value); };

  const handleCellChange = (idx, col, val) => { const newData = [...csvData]; newData[idx] = { ...newData[idx], [col]: val }; setCsvData(newData); };
  const handleAddRow = () => { if (headers.length === 0) return; const nr = {}; headers.forEach(h => nr[h] = ''); setCsvData([...csvData, nr]); setTimeout(() => { const tc = document.getElementById('csv-table-container'); if(tc) tc.scrollTop = tc.scrollHeight; }, 100); };
  const handleDeleteRow = (idx) => { if (csvData.length <= 1) return alert("Minimal 1 baris!"); setCsvData(prev => prev.filter((_, i) => i !== idx)); };
  const handleExportCsv = () => { if (csvData.length === 0) return; saveAs(new Blob([Papa.unparse(csvData)], { type: 'text/csv;charset=utf-8;' }), 'Data_Peserta_Updated.csv'); setStatus('✅ CSV Berhasil disimpan!'); setTimeout(() => setStatus(''), 3000); };
  const filteredCsvData = csvData.map((row, index) => ({ ...row, _originalIndex: index })).filter(row => !searchTerm || headers.some(h => String(row[h] || '').toLowerCase().includes(searchTerm.toLowerCase())));

  const addField = () => {
    const nf = { id: Date.now(), colName: headers[0] || '', x: pdfDimensions.width / 2 || 100, y: pdfDimensions.height / 2 || 100, size: 40, fontValue: StandardFonts.HelveticaBold, color: '#000000', scaleX: 1, scaleY: 1, rotate: 0, lockRatio: true };
    setFields([...fields, nf]); setActiveFieldId(nf.id);
  };
  
  const removeField = (id) => { if (fields.length === 1) return alert("Minimal 1 teks!"); const nf = fields.filter(f => f.id !== id); setFields(nf); if (activeFieldId === id) setActiveFieldId(nf[0].id); };
  
  const updateField = (id, key, value) => {
    setFields(fields.map(f => {
      if (f.id === id) {
        const finalValue = ['scaleX', 'scaleY', 'rotate', 'size', 'x', 'y'].includes(key) ? Number(value) : value;
        const newField = { ...f, [key]: key === 'lockRatio' ? value : finalValue };
        if (newField.lockRatio) {
          if (key === 'scaleX') newField.scaleY = finalValue;
          if (key === 'scaleY') newField.scaleX = finalValue;
        }
        return newField;
      }
      return f;
    }));
  };

  const exportConfig = () => saveAs(new Blob([JSON.stringify(fields, null, 2)], { type: 'application/json' }), 'preset-sertifikat.json');
  const importConfig = (e) => { const reader = new FileReader(); reader.onload = (ev) => { try { const loaded = JSON.parse(ev.target.result).map((f, i) => ({ ...f, id: Date.now() + i, scaleX: f.scaleX ?? 1, scaleY: f.scaleY ?? 1, rotate: f.rotate ?? 0, lockRatio: f.lockRatio ?? true })); setFields(loaded); if (loaded.length > 0) setActiveFieldId(loaded[0].id); setStatus('Preset dimuat!'); setTimeout(() => setStatus(''), 3000); } catch (err) { alert("Preset tidak valid!"); } }; if(e.target.files[0]) reader.readAsText(e.target.files[0]); e.target.value = null; };

  const preparePdfDoc = async () => {
    const isImg = templateFile.type.startsWith('image/'); let pdfDoc, firstPage;
    if (isImg) {
      pdfDoc = await PDFDocument.create(); const imgBytes = await templateFile.arrayBuffer();
      const embeddedImg = templateFile.type === 'image/png' ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes);
      firstPage = pdfDoc.addPage([embeddedImg.width, embeddedImg.height]);
      firstPage.drawImage(embeddedImg, { x: 0, y: 0, width: embeddedImg.width, height: embeddedImg.height });
    } else {
      pdfDoc = await PDFDocument.load(await templateFile.arrayBuffer()); firstPage = pdfDoc.getPages()[0];
    }
    pdfDoc.registerFontkit(fontkit); return { pdfDoc, firstPage };
  };

  const drawFieldsOnPage = async (pdfDoc, page, row, embeddedFontsCache) => {
    for (const field of fields) {
      const val = row[field.colName]; if (!val) continue;
      const isCst = customFonts.find(f => f.value === field.fontValue);
      if (!embeddedFontsCache[field.fontValue]) embeddedFontsCache[field.fontValue] = isCst ? await pdfDoc.embedFont(isCst.bytes) : await pdfDoc.embedFont(field.fontValue);
      const font = embeddedFontsCache[field.fontValue];
      const tw = font.widthOfTextAtSize(val, Number(field.size));
      const finalX = Number(field.x) - ((tw * Number(field.scaleX || 1)) / 2);
      const { r, g, b } = hexToRgbPdf(field.color);
      page.drawText(val, { x: finalX, y: Number(field.y), size: Number(field.size), font, color: rgb(r, g, b), rotate: degrees(Number(field.rotate || 0)), xScale: Number(field.scaleX || 1), yScale: Number(field.scaleY || 1) });
    }
  };

  // FITUR BARU: Konversi file PDF dari PDF-Lib ke JPG/PNG via PDF.js rendering
  const pdfToImageBlob = async (pdfBytes, format) => {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    
    // Scale 2.0 untuk kualitas resolusi tinggi (High-Res)
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Tambahkan background putih agar JPG tidak menjadi hitam jika template transparan
    if (format === 'jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    await page.render({ canvasContext: context, viewport: viewport }).promise;

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, `image/${format}`, 1.0); // 1.0 adalah kualitas tertinggi
    });
  };

  const handlePreviewSingle = async () => {
    if (!templateFile || csvData.length === 0) return alert("Siapkan template dan CSV!"); 
    setStatus('Membuat Preview...');
    try {
      const row = csvData.find(r => r[fields[0]?.colName] && r[fields[0]?.colName].trim() !== ''); if(!row) throw new Error("CSV kosong.");
      const { pdfDoc, firstPage } = await preparePdfDoc(); 
      await drawFieldsOnPage(pdfDoc, firstPage, row, {});
      
      const pdfBytes = await pdfDoc.save();
      
      if (exportFormat === 'pdf') {
        setPreviewUrl(URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }))); 
      } else {
        const imgBlob = await pdfToImageBlob(pdfBytes, exportFormat);
        setPreviewUrl(URL.createObjectURL(imgBlob)); 
      }
      
      setIsPreviewModalOpen(true); 
      setStatus('');
    } catch (e) { setStatus('Error preview.'); }
  };

  const generateCertificates = async () => {
    if (!templateFile || csvData.length === 0) return alert("Siapkan file!"); 
    setStatus('Sedang Memproses (Mungkin memakan waktu untuk format Gambar)...'); 
    const zip = new JSZip();
    try {
      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i]; if (!row[fields[0]?.colName] || row[fields[0]?.colName].trim() === '') continue;
        const { pdfDoc, firstPage } = await preparePdfDoc(); 
        await drawFieldsOnPage(pdfDoc, firstPage, row, {});
        
        const pdfBytes = await pdfDoc.save();
        const baseFileName = row[fields[0].colName].replace(/[^a-z0-9]/gi, '_');
        
        if (exportFormat === 'pdf') {
          zip.file(`${baseFileName}.pdf`, pdfBytes);
        } else {
          // Proses rendering ke PNG/JPG
          const imgBlob = await pdfToImageBlob(pdfBytes, exportFormat);
          const ext = exportFormat === 'jpeg' ? 'jpg' : 'png';
          zip.file(`${baseFileName}.${ext}`, imgBlob);
        }
      }
      saveAs(await zip.generateAsync({ type: 'blob' }), 'Sertifikat_Batch.zip'); 
      setStatus('Selesai!'); 
      setTimeout(() => setStatus(''), 5000);
    } catch (e) { console.error(e); setStatus('Error generate.'); }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* KOLOM KIRI */}
        <div className="lg:col-span-5 bg-white p-6 rounded-lg shadow-sm">
          <h1 className="text-4xl font-extrabold text-[#1a202c] mb-6">Bulk Certificate App</h1>

          <div className="space-y-4 mb-6">
            <div><label className="block text-sm font-semibold mb-1">1. Upload Template (PDF/PNG/JPG)</label><input type="file" accept=".pdf,image/png,image/jpeg,image/jpg" onChange={handleTemplateUpload} className="w-full text-sm file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 border border-slate-200 rounded p-1"/></div>
            <div><label className="block text-sm font-semibold mb-1">2. Upload Data (CSV)</label><input type="file" accept=".csv" onChange={handleCsvUpload} className="w-full text-sm file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-green-50 file:text-green-700 border border-slate-200 rounded p-1 mb-2"/>
              <div className="flex gap-2 items-center"><input type="url" placeholder="URL Google Sheets CSV..." value={csvUrl} onChange={(e) => setCsvUrl(e.target.value)} className="w-full p-2 border border-slate-300 rounded text-sm outline-none" /><button onClick={handleFetchCsv} disabled={isFetchingCsv} className="bg-[#0f9d58] text-white px-4 py-2 rounded text-sm font-bold shadow-sm">{isFetchingCsv ? '...' : 'Live'}</button></div>
            </div>
            <div><label className="block text-sm font-semibold mb-1">3. Upload Font (.ttf/.otf)</label><input type="file" accept=".ttf,.otf" multiple onChange={handleFontUpload} className="w-full text-sm file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-purple-50 file:text-purple-700 border border-slate-200 rounded p-1"/></div>
          </div>

          {headers.length > 0 && (
            <div className="mb-6">
              <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
                <h2 className="font-bold text-sm">Pengaturan<br/>Teks</h2>
                <div className="flex gap-2">
                  <label className="bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 rounded text-xs font-bold cursor-pointer text-center">Load<br/>Preset<input type="file" accept=".json" onChange={importConfig} className="hidden" /></label>
                  <button onClick={exportConfig} className="bg-[#1a202c] text-[#0f9d58] px-3 py-2 rounded text-xs font-bold text-center">Simpan<br/>Preset</button>
                  <button onClick={addField} className="bg-[#1a202c] text-[#4285f4] px-4 py-2 rounded text-xs font-bold text-center">+ Tambah<br/>Teks</button>
                </div>
              </div>

              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} onClick={() => setActiveFieldId(field.id)} className={`p-4 rounded border-2 transition-all cursor-pointer ${activeFieldId === field.id ? 'border-blue-500 bg-blue-50/10' : 'border-slate-200 bg-white'}`}>
                    <div className="flex justify-between items-center mb-3"><span className="font-bold text-sm">Teks #{index + 1} {activeFieldId === field.id && '(Aktif)'}</span><button onClick={(e) => { e.stopPropagation(); removeField(field.id); }} className="bg-[#1a202c] text-rose-500 text-xs font-bold px-3 py-1.5 rounded">Hapus</button></div>
                    
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div><label className="block text-[11px] text-slate-500 mb-1">Kolom Data</label><select value={field.colName} onChange={(e) => updateField(field.id, 'colName', e.target.value)} className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded text-sm outline-none"><option value="">-- Pilih --</option>{headers.map(h => <option key={h} value={h}>{h}</option>)}</select></div>
                      <div><label className="block text-[11px] text-slate-500 mb-1">Pilih Font</label><select value={field.fontValue} onChange={(e) => updateField(field.id, 'fontValue', e.target.value)} className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded text-sm outline-none"><optgroup label="Standar">{STANDARD_FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</optgroup>{customFonts.length > 0 && <optgroup label="Custom">{customFonts.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</optgroup>}</select></div>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      <div><label className="block text-[11px] text-slate-500 mb-1">Warna</label><input type="color" value={field.color} onChange={(e) => updateField(field.id, 'color', e.target.value)} className="w-full h-8 cursor-pointer rounded border border-slate-200" /></div>
                      <div><label className="block text-[11px] text-slate-500 mb-1">Ukuran</label><input type="number" value={field.size} onChange={(e) => updateField(field.id, 'size', e.target.value)} className="w-full p-1.5 border border-slate-200 bg-slate-50 rounded text-sm outline-none" /></div>
                      <div><label className="block text-[11px] text-slate-500 mb-1">X</label><input type="number" value={field.x} readOnly className="w-full p-1.5 border border-slate-200 bg-slate-200 rounded text-sm" /></div>
                      <div><label className="block text-[11px] text-slate-500 mb-1">Y</label><input type="number" value={field.y} readOnly className="w-full p-1.5 border border-slate-200 bg-slate-200 rounded text-sm" /></div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div><label className="block text-[11px] text-slate-500 mb-1">Scale X</label><input type="number" step="0.1" value={field.scaleX ?? 1} onChange={(e) => updateField(field.id, 'scaleX', e.target.value)} className="w-full p-1.5 border border-slate-200 bg-slate-50 rounded text-sm outline-none text-center" /></div>
                      <div><label className="block text-[11px] text-slate-500 mb-1">Scale Y</label><input type="number" step="0.1" value={field.scaleY ?? 1} onChange={(e) => updateField(field.id, 'scaleY', e.target.value)} className="w-full p-1.5 border border-slate-200 bg-slate-50 rounded text-sm outline-none text-center" /></div>
                      <div><label className="block text-[11px] text-slate-500 mb-1">Rotate (°)</label><input type="number" value={field.rotate ?? 0} onChange={(e) => updateField(field.id, 'rotate', e.target.value)} className="w-full p-1.5 border border-slate-200 bg-slate-50 rounded text-sm outline-none text-center" /></div>
                    </div>

                    <div className="flex items-center mt-3">
                      <input type="checkbox" id={`lockRatio-${field.id}`} checked={field.lockRatio ?? true} onChange={(e) => updateField(field.id, 'lockRatio', e.target.checked)} className="mr-2 cursor-pointer w-3.5 h-3.5 accent-blue-600"/>
                      <label htmlFor={`lockRatio-${field.id}`} className="text-xs font-bold text-slate-600 cursor-pointer select-none">Lock Aspect Ratio</label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* OPSI EXPORT BARU */}
          <div className="flex flex-col gap-2 mb-2">
            <div className="flex items-center justify-between border border-slate-200 p-2 rounded bg-slate-50 mb-1">
              <span className="text-sm font-bold text-slate-700 pl-2">Ekspor Sebagai:</span>
              <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} className="p-1.5 rounded border border-slate-300 text-sm bg-white font-bold outline-none cursor-pointer">
                <option value="pdf">📄 File PDF</option>
                <option value="jpeg">🖼️ Gambar JPG</option>
                <option value="png">🖼️ Gambar PNG</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button onClick={handlePreviewSingle} disabled={!templateFile || csvData.length === 0} className="w-1/3 bg-slate-100 border border-slate-300 text-slate-800 py-3 rounded font-bold text-sm hover:bg-slate-200">Preview</button>
              <button onClick={generateCertificates} disabled={status.includes('Memproses') || !templateFile || csvData.length === 0} className="w-2/3 bg-[#1a202c] text-white py-3 rounded font-bold text-sm hover:bg-black">Generate & Download ZIP</button>
            </div>
          </div>
          {status && <p className="text-center text-sm font-bold text-emerald-600 mt-2">{status}</p>}
        </div>

        {/* KOLOM KANAN (Preview Canvas) */}
        <div className="lg:col-span-7 bg-white p-6 rounded-lg shadow-sm flex flex-col items-center select-none">
          <h2 className="font-bold text-sm text-slate-800 mb-4">Live Preview</h2>
          
          <div className="w-full border border-dashed border-slate-300 bg-slate-50 flex justify-center items-center min-h-[400px] p-2 overflow-auto relative">
             {!templateFile && <span className="text-slate-400 text-sm">Upload template untuk melihat preview</span>}
             
             {templateFile && (
               <div className="relative shadow-md bg-white">
                 <canvas ref={canvasRef} onClick={handleCanvasClick} className="max-w-full h-auto" />
                 
                 {fields.map(field => {
                   let previewFontFamily = 'sans-serif';
                   if (typeof field.fontValue === 'string') {
                     if (field.fontValue.includes('Times')) previewFontFamily = 'serif';
                     if (field.fontValue.includes('Courier')) previewFontFamily = 'monospace';
                   }

                   return (
                     <div key={field.id} id={`field-overlay-${field.id}`} onMouseDown={(e) => onMouseDownMove(e, field)}
                       className={`absolute whitespace-nowrap px-1 group ${activeFieldId === field.id ? 'ring-2 ring-blue-500 z-20 cursor-move bg-blue-50/10' : 'border border-transparent opacity-75 z-10 hover:border-slate-300 cursor-pointer'}`}
                       style={{ 
                         left: `${(field.x / pdfDimensions.width) * 100}%`, top: `${((pdfDimensions.height - field.y) / pdfDimensions.height) * 100}%`, 
                         transform: `translate(-50%, -50%) rotate(${field.rotate || 0}deg) scale(${field.scaleX || 1}, ${field.scaleY || 1})`, transformOrigin: 'center center', 
                         fontSize: `${field.size * (canvasRef.current?.offsetWidth / pdfDimensions.width || 1)}px`, 
                         fontFamily: previewFontFamily, color: field.color 
                       }}>
                       
                       {activeFieldId === field.id && (
                         <><div onMouseDown={(e) => onMouseDownRotate(e, field)} className="absolute -top-8 left-1/2 -translate-x-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-white cursor-pointer shadow-md" title="Tarik untuk memutar" /><div className="absolute -top-4 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-blue-500" /></>
                       )}

                       <span className="font-bold pointer-events-none">[{field.colName || 'nama'}]</span>

                       {activeFieldId === field.id && (
                         <div onMouseDown={(e) => onMouseDownResize(e, field)} className="absolute -bottom-2 -right-2 w-4 h-4 bg-blue-500 rounded-full border-2 border-white cursor-nwse-resize shadow-md" title="Tarik untuk merubah skala" />
                       )}
                     </div>
                   )
                 })}
               </div>
             )}
          </div>
        </div>
      </div>

      {/* KOLOM BAWAH (CSV Tabel) */}
      {csvData.length > 0 && (
        <div className="max-w-7xl mx-auto mt-6 bg-white p-6 rounded-lg shadow-sm">
          <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
            <h2 className="font-bold text-lg">CSV Editor <span className="text-sm font-normal text-slate-500">({csvData.length} baris)</span></h2>
            <div className="flex gap-2 w-full md:w-auto">
              <input type="text" placeholder="Cari..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="p-2 border border-slate-300 rounded text-sm w-full md:w-48 outline-none" />
              <button onClick={handleAddRow} className="bg-blue-50 text-blue-600 px-3 py-2 rounded text-sm font-bold border border-blue-200">+ Baris</button>
              <button onClick={handleExportCsv} className="bg-emerald-50 text-emerald-600 px-3 py-2 rounded text-sm font-bold border border-emerald-200">Simpan CSV</button>
            </div>
          </div>
          
          <div id="csv-table-container" className="overflow-x-auto max-h-[300px] border border-slate-200 rounded">
            <table className="min-w-full text-sm divide-y divide-slate-200">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr><th className="px-3 py-2 text-center border-r">No</th>{headers.map(h => <th key={h} className="px-3 py-2 text-left border-r whitespace-nowrap">{h}</th>)}<th className="px-3 py-2 text-center">Aksi</th></tr>
              </thead>
              <tbody className="bg-white divide-y">
                {filteredCsvData.map(row => (
                  <tr key={row._originalIndex} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-center text-slate-400 border-r">{row._originalIndex + 1}</td>
                    {headers.map(h => (<td key={h} className="p-0 border-r min-w-[120px]"><input type="text" value={row[h] || ''} onChange={(e) => handleCellChange(row._originalIndex, h, e.target.value)} className="w-full p-2 bg-transparent outline-none focus:bg-white" /></td>))}
                    <td className="px-2 py-1 text-center"><button onClick={() => handleDeleteRow(row._originalIndex)} disabled={csvData.length <= 1} className="text-rose-500 font-bold text-xs p-1">Hapus</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL PREVIEW SESUAI FORMAT */}
      {isPreviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl h-[85vh] flex flex-col">
            <div className="flex justify-between p-3 border-b">
              <h3 className="font-bold uppercase">Preview {exportFormat}</h3>
              <button onClick={() => { setIsPreviewModalOpen(false); setPreviewUrl(null); }} className="text-rose-600 font-bold text-sm">Tutup</button>
            </div>
            <div className="flex-grow bg-slate-200 p-2 flex justify-center items-center overflow-auto">
              {previewUrl && exportFormat === 'pdf' ? (
                <iframe src={`${previewUrl}#toolbar=0`} className="w-full h-full bg-white rounded shadow-lg" title="Preview PDF" />
              ) : previewUrl ? (
                <img src={previewUrl} alt="Preview Ekspor Gambar" className="max-w-full max-h-full bg-white rounded shadow-lg object-contain" />
              ) : (
                <span className="text-slate-500 font-bold">Memuat Preview...</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;