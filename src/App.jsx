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
  // STATE BARU: Untuk fitur pencarian di tabel CSV
  const [searchTerm, setSearchTerm] = useState('');
  
  const [csvUrl, setCsvUrl] = useState('');
  const [isFetchingCsv, setIsFetchingCsv] = useState(false);
  
  const canvasRef = useRef(null);
  const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
  const [customFonts, setCustomFonts] = useState([]);

  const [fields, setFields] = useState([
    { id: Date.now(), colName: '', x: 0, y: 0, size: 40, fontValue: StandardFonts.HelveticaBold, color: '#000000' }
  ]);
  const [activeFieldId, setActiveFieldId] = useState(fields[0].id);
  // STATE BARU: Untuk fitur Preview 1 Sample PDF
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  // --- LOGIC FUNGSI UTAMA ---

  const handleClearAll = () => {
    if (window.confirm("Yakin ingin menghapus semua file dan pengaturan?")) {
      setTemplateFile(null);
      setCsvData([]);
      setHeaders([]);
      setStatus('');
      setCsvUrl(''); 
      setPdfDimensions({ width: 0, height: 0 });
      setCustomFonts([]);
      
      const resetField = { id: Date.now(), colName: '', x: 0, y: 0, size: 40, fontValue: StandardFonts.HelveticaBold, color: '#000000' };
      setFields([resetField]);
      setActiveFieldId(resetField.id);
      
      document.querySelectorAll('input[type="file"]').forEach(input => input.value = '');
    }
  };

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

  const handleFetchCsv = () => {
    if (!csvUrl) return;
    setIsFetchingCsv(true);
    
    Papa.parse(csvUrl, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setHeaders(results.meta.fields);
        setCsvData(results.data);
        if (results.meta.fields.length > 0) {
          setFields(fields.map(f => ({ ...f, colName: results.meta.fields[0] })));
        }
        setIsFetchingCsv(false);
        setStatus(`Live CSV berhasil dimuat! (${results.data.length} baris)`);
        setTimeout(() => setStatus(''), 4000);
      },
      error: (err) => {
        console.error(err);
        alert("Gagal mengambil data. Pastikan URL valid dan merupakan format CSV.");
        setIsFetchingCsv(false);
      }
    });
  };

  // Logic Tabel CSV
  const handleCellChange = (rowIndex, column, value) => {
    const newData = [...csvData];
    newData[rowIndex] = { ...newData[rowIndex], [column]: value };
    setCsvData(newData);
  };

  const handleAddRow = () => {
    if (headers.length === 0) return;
    const newRow = {};
    headers.forEach(header => {
      newRow[header] = ''; 
    });
    setCsvData([...csvData, newRow]);
    
    setTimeout(() => {
      const tableContainer = document.getElementById('csv-table-container');
      if (tableContainer) tableContainer.scrollTop = tableContainer.scrollHeight;
    }, 100);
  };

  const handleDeleteRow = (indexToRemove) => {
    // Tambahkan pengecekan jumlah baris di sini
    if (csvData.length <= 1) {
      alert("Tidak bisa dihapus! Minimal harus ada 1 baris data peserta.");
      return; // Hentikan fungsi agar baris terakhir tidak terhapus
    }
    
    setCsvData(prevData => prevData.filter((_, index) => index !== indexToRemove));
  };

  const handleExportCsv = () => {
    if (csvData.length === 0) return;
    const csvString = Papa.unparse(csvData);
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, 'Data_Peserta_Updated.csv');
    
    setStatus('✅ CSV Berhasil disimpan!');
    setTimeout(() => setStatus(''), 3000);
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

  // Logic Manajemen Fields (Teks)
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

  // --- FITUR BARU: Generate hanya 1 baris pertama untuk Preview ---
  const handlePreviewSingle = async () => {
    if (!templateFile || csvData.length === 0) return alert("Upload template & CSV dulu!");
    setStatus('Membuat Preview...');
    
    try {
      // Cari baris pertama yang datanya tidak kosong
      const firstValidRow = csvData.find(row => row[fields[0]?.colName] && row[fields[0]?.colName].trim() !== '');
      if (!firstValidRow) throw new Error("Tidak ada data peserta yang valid untuk di-preview.");

      const templateArrayBuffer = await templateFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(templateArrayBuffer);
      pdfDoc.registerFontkit(fontkit);
      const firstPage = pdfDoc.getPages()[0];
      const embeddedFontsCache = {};

      for (const field of fields) {
        const textValue = firstValidRow[field.colName];
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
      
      // Simpan PDF sebagai file sementara di memory browser (Blob)
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      // Buka pop-up modal dan tampilkan PDF-nya
      setPreviewPdfUrl(url);
      setIsPreviewModalOpen(true);
      setStatus('');
    } catch (error) {
      console.error(error);
      setStatus('Error: ' + error.message);
    }
  };

  // Logic Generate PDF Utama
  const generateCertificates = async () => {
    if (!templateFile || csvData.length === 0) return alert("Upload template & CSV dulu!");
    setStatus('Sedang Memproses...');
    const zip = new JSZip();
    const templateArrayBuffer = await templateFile.arrayBuffer();

    try {
      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];
        
        // Lewati baris yang kosong (misal akibat klik 'Tambah Baris' tapi belum diisi)
        if (!row[fields[0]?.colName] || row[fields[0]?.colName].trim() === '') continue;

        const primaryFileName = row[fields[0]?.colName] || `Sertifikat_${i+1}`; 
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

  // --- LOGIKA PENCARIAN (FIND) ---
  // Kita sisipkan _originalIndex agar saat diedit/dihapus, data yang diubah tetap data aslinya
  const filteredCsvData = csvData
    .map((row, index) => ({ ...row, _originalIndex: index }))
    .filter(row => {
      if (!searchTerm) return true;
      // Cek apakah ada nilai di kolom manapun yang cocok dengan kata kunci
      return headers.some(h => 
        String(row[h] || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    });

  // --- UI RENDERING ---
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 lg:p-8 font-sans text-slate-800 w-full overflow-x-hidden">
      
      {/* Header Aplikasi */}
      <div className="w-full mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Bulk Certificate App</h1>
          <p className="text-slate-500 mt-1">Otomatisasi pembuatan sertifikat massal dengan mudah.</p>
        </div>
        
        <button 
          onClick={handleClearAll} 
          className="bg-rose-100 text-rose-600 px-4 py-2 rounded-lg font-bold hover:bg-rose-200 hover:text-rose-700 transition-colors flex items-center shadow-sm"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          Bersihkan Semua
        </button>
      </div>

      <div className="w-full grid grid-cols-1 lg:grid-cols-12 2xl:grid-cols-12 gap-6 items-start">
        
        {/* PANEL KIRI: Upload & Config */}
        <div className="lg:col-span-4 2xl:col-span-3 bg-white p-5 lg:p-6 rounded-2xl shadow-sm border border-slate-200">
          
          <div className="space-y-4 mb-8 pb-6 border-b border-slate-100">
            <h2 className="font-bold text-lg text-slate-800 mb-2">1. Siapkan File</h2>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Upload Template (PDF)</label>
              <input type="file" accept="application/pdf" onChange={handleTemplateUpload} 
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-slate-200 rounded-lg"/>
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Sumber Data Peserta (CSV)</label>
              <input type="file" accept=".csv" onChange={handleCsvUpload} 
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer border border-slate-200 rounded-lg mb-2"/>
              
              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-bold uppercase">Atau URL Live</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <div className="flex gap-2">
                <input 
                  type="url" 
                  placeholder="Link Google Sheets CSV..." 
                  value={csvUrl}
                  onChange={(e) => setCsvUrl(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500 outline-none" 
                />
                <button 
                  onClick={handleFetchCsv}
                  disabled={isFetchingCsv || !csvUrl}
                  className="bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:bg-slate-300 whitespace-nowrap transition-colors"
                >
                  {isFetchingCsv ? 'Menarik...' : 'Ambil Live'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1 mt-4">Upload Font (.ttf/.otf)</label>
              <input type="file" accept=".ttf,.otf" multiple onChange={handleFontUpload} 
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 cursor-pointer border border-slate-200 rounded-lg"/>
            </div>
          </div>

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

              <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
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

          <div className="mt-6 flex flex-col xl:flex-row gap-3">
            <button 
              onClick={handlePreviewSingle} 
              disabled={status === 'Sedang Memproses...' || status === 'Membuat Preview...' || !templateFile || csvData.length === 0} 
              className="w-full xl:w-2/5 bg-blue-100 text-blue-700 py-4 rounded-xl font-bold text-lg hover:bg-blue-200 transition-all disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-sm flex justify-center items-center"
            >
              👁️ Preview 1 Sample
            </button>
            <button 
              onClick={generateCertificates} 
              disabled={status === 'Sedang Memproses...' || status === 'Membuat Preview...' || !templateFile || csvData.length === 0} 
              className="w-full xl:w-3/5 bg-slate-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-slate-800 transition-all disabled:bg-slate-300 disabled:cursor-not-allowed shadow-lg flex justify-center items-center"
            >
              {status === 'Sedang Memproses...' ? 'Memproses...' : '🚀 Generate ZIP'}
            </button>
          </div>
          {status && status !== 'Sedang Memproses...' && status !== 'Membuat Preview...' && (
            <p className="mt-4 text-center text-sm font-semibold text-emerald-600 bg-emerald-50 py-2 rounded-lg border border-emerald-100">{status}</p>
          )}
        </div>

        {/* PANEL KANAN: Live Preview */}
        <div className="lg:col-span-8 2xl:col-span-9 bg-white p-4 md:p-8 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center lg:sticky lg:top-8">
          
          <div className="w-full flex justify-between items-center mb-4">
            <h2 className="font-bold text-lg text-slate-800">Live Preview</h2>
            {templateFile && <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 shadow-sm animate-pulse">Klik area PDF untuk atur posisi</span>}
          </div>

          <div className="relative border border-slate-200 rounded-xl bg-slate-100 overflow-hidden w-full flex justify-center items-center shadow-inner" style={{ minHeight: '550px' }}>
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

      {/* --- PANEL BAWAH: Tabel CSV Editor --- */}
      {csvData.length > 0 && (
        <div className="w-full mt-6 bg-white p-5 lg:p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
            <h2 className="font-bold text-lg text-slate-800">Tabel Editor Data CSV ({csvData.length} baris)</h2>
            
            <div className="flex flex-col md:flex-row flex-wrap gap-3 w-full md:w-auto items-center">
              
              {/* --- FITUR BARU: Input Search (Find) --- */}
              <div className="relative w-full md:w-64">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
                <input 
                  type="text" 
                  placeholder="Cari data peserta..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all shadow-sm"
                />
              </div>

              <div className="flex gap-2 w-full md:w-auto">
                <button 
                  onClick={handleAddRow}
                  className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-200 transition-colors flex items-center shadow-sm flex-1 md:flex-none justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                  Tambah Baris
                </button>

                <button 
                  onClick={handleExportCsv}
                  className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-200 transition-colors flex items-center shadow-sm flex-1 md:flex-none justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                  Simpan CSV
                </button>
              </div>
            </div>
          </div>
          
          <div id="csv-table-container" className="overflow-x-auto max-h-[400px] custom-scrollbar border border-slate-200 rounded-lg scroll-smooth">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 text-center font-bold text-slate-700 whitespace-nowrap w-12 border-r border-slate-200">No.</th>
                  {headers.map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left font-bold text-slate-700 whitespace-nowrap">{h}</th>
                  ))}
                  <th className="px-4 py-3 text-center font-bold text-slate-700 whitespace-nowrap w-16">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {/* --- UPDATE: Gunakan filteredCsvData, bukan csvData --- */}
                {filteredCsvData.length > 0 ? (
                  filteredCsvData.map((row, rowIndex) => (
                    // Gunakan originalIndex sebagai patokan nomor dan handle action
                    <tr key={row._originalIndex} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-2 text-slate-400 font-mono border-r border-slate-100 text-center">
                        {row._originalIndex + 1}
                      </td>
                      
                      {headers.map((h, colIndex) => (
                        <td key={colIndex} className="p-0 border-r border-slate-100 relative min-w-[150px]">
                          <input 
                            type="text" 
                            value={row[h] || ''} 
                            // Pastikan mengirim row._originalIndex, bukan rowIndex urutan pencarian
                            onChange={(e) => handleCellChange(row._originalIndex, h, e.target.value)}
                            className="w-full h-full px-4 py-3 bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-700 transition-all"
                            placeholder="Kosong..."
                          />
                        </td>
                      ))}

                      <td className="px-2 py-2 text-center align-middle border-l border-slate-100">
                        <button 
                          type="button"
                          // Pastikan menghapus berdasarkan original index
                          onClick={() => handleDeleteRow(row._originalIndex)}
                          disabled={csvData.length <= 1}
                          className={`p-2 rounded-lg transition-all ${
                            csvData.length <= 1 
                              ? 'text-slate-200 cursor-not-allowed'
                              : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer'
                          }`}
                          title={csvData.length <= 1 ? "Minimal 1 baris data" : "Hapus baris ini"}
                        >
                          <svg className="w-5 h-5 mx-auto pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={headers.length + 2} className="px-4 py-8 text-center text-slate-500">
                      Pencarian <b>"{searchTerm}"</b> tidak ditemukan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs font-semibold text-slate-500 mt-4 flex items-center">
            <svg className="w-4 h-4 mr-1 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            Klik pada teks di dalam tabel untuk mengedit, tambah baris, hapus baris, atau gunakan fitur Cari untuk menemukan data.
          </p>
        </div>
      )}

{/* --- MODAL PREVIEW PDF ASLI --- */}
      {isPreviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Header Modal */}
            <div className="flex justify-between items-center p-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800 flex items-center">
                <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                Preview Hasil Akhir PDF (Baris Pertama)
              </h3>
              <button 
                onClick={() => {
                  setIsPreviewModalOpen(false);
                  URL.revokeObjectURL(previewPdfUrl); // Bersihkan cache browser
                  setPreviewPdfUrl(null);
                }}
                className="bg-rose-100 text-rose-600 hover:bg-rose-200 px-4 py-2 rounded-lg transition-colors font-bold text-sm"
              >
                Tutup Preview
              </button>
            </div>

            {/* Area Penampil PDF */}
            <div className="flex-grow w-full bg-slate-200 p-2 md:p-6 overflow-hidden">
              {previewPdfUrl ? (
                <iframe 
                  src={`${previewPdfUrl}#toolbar=0&navpanes=0`} 
                  className="w-full h-full rounded-xl border border-slate-300 shadow-sm bg-white"
                  title="PDF Preview"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500 font-semibold">Memuat PDF...</div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

export default App;