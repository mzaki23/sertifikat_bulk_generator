import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
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
  
  const canvasRef = useRef(null);
  const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
  const [customFonts, setCustomFonts] = useState([]);

  const [fields, setFields] = useState([
    { id: Date.now(), colName: '', x: 0, y: 0, size: 40, fontValue: StandardFonts.HelveticaBold, color: '#000000' }
  ]);
  const [activeFieldId, setActiveFieldId] = useState(fields[0].id);

  // --- LOGIC FUNCTIONS (Tetap sama persis) ---
  const handleTemplateUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setTemplateFile(file);
    const arrayBuffer = await file.arrayBuffer();
    
    try {
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.0 });
      setPdfDimensions({ width: viewport.width, height: viewport.height });

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: context, viewport: viewport }).promise;
      setFields(fields.map(f => ({ ...f, x: viewport.width / 2, y: viewport.height / 2 })));
    } catch (error) {
      console.error(error);
      alert("Gagal membaca preview PDF.");
    }
  };

  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;
    const pdfY = canvas.height - clickY;

    setFields(fields.map(field => 
      field.id === activeFieldId ? { ...field, x: Math.round(clickX), y: Math.round(pdfY) } : field
    ));
  };

  const handleCsvUpload = (e) => {
    const file = e.target.files[0];
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        setHeaders(results.meta.fields);
        setCsvData(results.data);
        if (results.meta.fields.length > 0) {
          setFields(fields.map(f => ({ ...f, colName: results.meta.fields[0] })));
        }
      },
    });
  };

  const handleFontUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    const newFonts = [];
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      newFonts.push({ label: file.name, value: file.name, bytes: arrayBuffer, isCustom: true });
    }
    setCustomFonts([...customFonts, ...newFonts]);
    if (newFonts.length > 0) updateField(activeFieldId, 'fontValue', newFonts[0].value);
  };

  const addField = () => {
    const newField = { 
      id: Date.now(), colName: headers[0] || '', 
      x: pdfDimensions.width / 2 || 100, y: pdfDimensions.height / 2 || 100, 
      size: 40, fontValue: StandardFonts.HelveticaBold, color: '#000000'
    };
    setFields([...fields, newField]);
    setActiveFieldId(newField.id);
  };

  const removeField = (id) => {
    if (fields.length === 1) return alert("Minimal harus ada 1 teks!");
    const newFields = fields.filter(f => f.id !== id);
    setFields(newFields);
    if (activeFieldId === id) setActiveFieldId(newFields[0].id);
  };

  const updateField = (id, key, value) => {
    setFields(fields.map(f => f.id === id ? { ...f, [key]: value } : f));
  };

  const exportConfig = () => {
    const configToSave = fields.map(f => ({
      colName: f.colName, x: f.x, y: f.y, size: f.size,
      fontValue: typeof f.fontValue === 'string' ? f.fontValue : 'HelveticaBold', color: f.color
    }));
    const blob = new Blob([JSON.stringify(configToSave, null, 2)], { type: 'application/json' });
    saveAs(blob, 'preset-sertifikat.json');
  };

  const importConfig = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const loadedData = JSON.parse(event.target.result);
        const restoredFields = loadedData.map((f, index) => ({
          id: Date.now() + index, colName: f.colName || '',
          x: f.x || 100, y: f.y || 100, size: f.size || 40,
          fontValue: f.fontValue || StandardFonts.HelveticaBold, color: f.color || '#000000'
        }));
        setFields(restoredFields);
        if (restoredFields.length > 0) setActiveFieldId(restoredFields[0].id);
        setStatus('Preset berhasil dimuat!');
        setTimeout(() => setStatus(''), 3000);
      } catch (error) { alert("File preset tidak valid!"); }
    };
    reader.readAsText(file);
    e.target.value = null; 
  };

  const generateCertificates = async () => {
    if (!templateFile || csvData.length === 0) return alert("Upload template & CSV dulu!");
    setStatus('Sedang Memproses...');
    const zip = new JSZip();
    const templateArrayBuffer = await templateFile.arrayBuffer();

    try {
      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];
        const primaryFileName = row[fields[0].colName] || `Sertifikat_${i+1}`; 
        const pdfDoc = await PDFDocument.load(templateArrayBuffer);
        pdfDoc.registerFontkit(fontkit);
        const firstPage = pdfDoc.getPages()[0];
        const embeddedFontsCache = {};

        for (const field of fields) {
          const textValue = row[field.colName];
          if (!textValue) continue;

          let currentFont;
          const isCustom = customFonts.find(f => f.value === field.fontValue);

          if (isCustom) {
            if (!embeddedFontsCache[field.fontValue]) embeddedFontsCache[field.fontValue] = await pdfDoc.embedFont(isCustom.bytes);
            currentFont = embeddedFontsCache[field.fontValue];
          } else {
            if (!embeddedFontsCache[field.fontValue]) embeddedFontsCache[field.fontValue] = await pdfDoc.embedFont(field.fontValue);
            currentFont = embeddedFontsCache[field.fontValue];
          }

          const textWidth = currentFont.widthOfTextAtSize(textValue, Number(field.size));
          const finalX = Number(field.x) - (textWidth / 2);
          const { r, g, b } = hexToRgbPdf(field.color);

          firstPage.drawText(textValue, {
            x: finalX, y: Number(field.y), size: Number(field.size),
            font: currentFont, color: rgb(r, g, b),
          });
        }
        const pdfBytes = await pdfDoc.save();
        zip.file(`${primaryFileName.replace(/[^a-z0-9]/gi, '_')}.pdf`, pdfBytes);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, 'sertifikat-batch.zip');
      setStatus('Selesai! File terunduh.');
      setTimeout(() => setStatus(''), 5000);
    } catch (error) {
      console.error(error);
      setStatus('Error: ' + error.message);
    }
  };

  // --- UI RENDERING ---
  return (
    // Hapus pembatasan lebar, gunakan w-full agar 100% full width
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 lg:p-8 font-sans text-slate-800 w-full overflow-x-hidden">
      
      {/* Header Aplikasi - Full Width */}
      <div className="w-full mb-6">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Bulk Certificate App</h1>
        <p className="text-slate-500 mt-1">Otomatisasi pembuatan sertifikat massal dengan mudah.</p>
      </div>

      {/* Grid Utama - Full Width */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 2xl:grid-cols-12 gap-6 items-start">
        
        {/* PANEL KIRI: Form & Config (Dibuat lebih proporsional untuk layar lebar) */}
        <div className="lg:col-span-4 2xl:col-span-3 bg-white p-5 lg:p-6 rounded-2xl shadow-sm border border-slate-200">
          
          {/* Section 1: Uploads */}
          <div className="space-y-4 mb-8 pb-6 border-b border-slate-100">
            <h2 className="font-bold text-lg text-slate-800 mb-2">1. Siapkan File</h2>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Upload Template (PDF)</label>
              <input type="file" accept="application/pdf" onChange={handleTemplateUpload} 
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-slate-200 rounded-lg"/>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Upload Data (CSV)</label>
              <input type="file" accept=".csv" onChange={handleCsvUpload} 
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer border border-slate-200 rounded-lg"/>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Upload Font (.ttf/.otf)</label>
              <input type="file" accept=".ttf,.otf" multiple onChange={handleFontUpload} 
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 cursor-pointer border border-slate-200 rounded-lg"/>
            </div>
          </div>

          {/* Section 2: Mapping Teks */}
          {headers.length > 0 && (
            <div className="mb-8">
              <div className="flex flex-col 2xl:flex-row justify-between 2xl:items-center mb-4 gap-3">
                <h2 className="font-bold text-lg text-slate-800">2. Pengaturan Teks</h2>
                
                <div className="flex flex-wrap gap-2">
                  <label className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-slate-50 cursor-pointer transition-colors shadow-sm text-center flex-1 2xl:flex-none">
                    Load
                    <input type="file" accept=".json" onChange={importConfig} className="hidden" />
                  </label>
                  <button onClick={exportConfig} className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-slate-900 transition-colors shadow-sm flex-1 2xl:flex-none">
                    Simpan
                  </button>
                  <button onClick={addField} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm flex items-center justify-center w-full 2xl:w-auto mt-1 2xl:mt-0">
                    + Teks
                  </button>
                </div>
              </div>

              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                {fields.map((field, index) => (
                  <div 
                    key={field.id} 
                    onClick={() => setActiveFieldId(field.id)}
                    className={`p-4 xl:p-5 rounded-xl border-2 transition-all duration-200 cursor-pointer relative overflow-hidden
                      ${activeFieldId === field.id 
                        ? 'border-blue-500 bg-blue-50/40 shadow-md ring-1 ring-blue-500' 
                        : 'border-slate-200 bg-white hover:border-blue-300 shadow-sm'}`}
                  >
                    {activeFieldId === field.id && <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>}

                    <div className="flex justify-between items-center mb-4 pl-2">
                      <span className="font-bold text-sm text-slate-800">
                        Teks #{index + 1} {activeFieldId === field.id && <span className="text-blue-600 text-xs ml-1 bg-blue-100 px-2 py-0.5 rounded-full">Aktif</span>}
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); removeField(field.id); }} className="text-rose-500 text-xs font-semibold hover:text-rose-700 bg-rose-50 px-2 py-1 rounded-md transition-colors">
                        Hapus
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-3 pl-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Kolom Data CSV</label>
                        <select className="w-full p-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none" 
                          value={field.colName} onChange={(e) => updateField(field.id, 'colName', e.target.value)}>
                          <option value="">-- Pilih Kolom --</option>
                          {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Pilih Font</label>
                        <select className="w-full p-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none" 
                          value={field.fontValue} onChange={(e) => updateField(field.id, 'fontValue', e.target.value)}>
                          <optgroup label="Standar">
                            {STANDARD_FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                          </optgroup>
                          {customFonts.length > 0 && (
                            <optgroup label="Custom Fonts">
                              {customFonts.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                            </optgroup>
                          )}
                        </select>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2 xl:gap-3 pl-2">
                      <div className="col-span-1">
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Warna</label>
                        <input type="color" value={field.color} onChange={(e) => updateField(field.id, 'color', e.target.value)} 
                          className="w-full h-[38px] p-0.5 border border-slate-300 rounded-lg cursor-pointer bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Ukuran</label>
                        <input type="number" value={field.size} onChange={(e) => updateField(field.id, 'size', e.target.value)} 
                          className="w-full p-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">X</label>
                        <input type="number" value={field.x} readOnly 
                          className="w-full p-2 border border-slate-200 rounded-lg bg-slate-100 text-sm text-slate-500 cursor-not-allowed font-mono px-1" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Y</label>
                        <input type="number" value={field.y} readOnly 
                          className="w-full p-2 border border-slate-200 rounded-lg bg-slate-100 text-sm text-slate-500 cursor-not-allowed font-mono px-1" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6">
            <button 
              onClick={generateCertificates} 
              disabled={status === 'Sedang Memproses...' || !templateFile || csvData.length === 0} 
              className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-slate-800 transition-all disabled:bg-slate-300 disabled:cursor-not-allowed shadow-lg flex justify-center items-center"
            >
              {status === 'Sedang Memproses...' ? 'Memproses...' : '🚀 Generate ZIP'}
            </button>
            {status && status !== 'Sedang Memproses...' && (
              <p className="mt-4 text-center text-sm font-semibold text-emerald-600 bg-emerald-50 py-2 rounded-lg border border-emerald-100">{status}</p>
            )}
          </div>
        </div>

        {/* PANEL KANAN: Live Preview (Lebih luas) */}
        <div className="lg:col-span-8 2xl:col-span-9 bg-white p-4 md:p-8 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center lg:sticky lg:top-8">
          
          <div className="w-full flex justify-between items-center mb-4">
            <h2 className="font-bold text-lg text-slate-800">Live Preview</h2>
            {templateFile && <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 shadow-sm animate-pulse">Klik area PDF untuk atur posisi</span>}
          </div>

          <div className="relative border border-slate-200 rounded-xl bg-slate-100 overflow-hidden w-full flex justify-center items-center shadow-inner" style={{ minHeight: '600px' }}>
            {!templateFile && (
              <div className="text-center p-6">
                <svg className="mx-auto h-16 w-16 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                <span className="text-slate-500 font-medium block text-lg">Area Kerja Kosong</span>
                <span className="text-slate-400 text-sm mt-1">Silakan upload Template PDF di panel sebelah kiri.</span>
              </div>
            )}
            
            <div className="relative" style={{ width: '100%', maxWidth: pdfDimensions.width ? '100%' : 'auto' }}>
              <canvas 
                ref={canvasRef} 
                onClick={handleCanvasClick} 
                className={`max-w-full h-auto cursor-crosshair shadow-md bg-white ${!templateFile ? 'hidden' : 'block mx-auto'}`} 
              />
              
              {templateFile && fields.map(field => {
                let previewFontFamily = 'sans-serif';
                if (typeof field.fontValue === 'string') {
                  if (field.fontValue.includes('Times')) previewFontFamily = 'serif';
                  if (field.fontValue.includes('Courier')) previewFontFamily = 'monospace';
                }

                return (
                  <div 
                    key={field.id}
                    className={`absolute pointer-events-none font-bold whitespace-nowrap px-1 transition-all duration-200
                      ${activeFieldId === field.id 
                        ? 'border-2 border-blue-500 shadow-sm bg-blue-50/20 z-10 scale-105' 
                        : 'border border-transparent opacity-75 z-0 hover:border-slate-300 hover:opacity-100'}
                    `}
                    style={{
                      left: `${(field.x / pdfDimensions.width) * 100}%`,
                      top: `${((pdfDimensions.height - field.y) / pdfDimensions.height) * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      fontSize: `${field.size * (canvasRef.current?.offsetWidth / pdfDimensions.width || 1)}px`,
                      fontFamily: previewFontFamily,
                      color: field.color
                    }}
                  >
                    [ {field.colName || 'Teks Kosong'} ]
                  </div>
                )
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;