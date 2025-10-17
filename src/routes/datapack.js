import express from 'express';
import Busboy from 'busboy';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import * as XLSX from 'xlsx';
import { getSupabase } from '../utils/supabaseClient.js';

const router = express.Router();
const TABLES = ['postcode_routing_codes','postcodes_needs_review','sd_sequences','orders','barcode_sequences','qr_sequences','label_templates','label_template_tokens'];

function sha256(buf){ return crypto.createHash('sha256').update(buf).digest('hex'); }

function parseCsvBuffer(buf){
  const text = buf.toString('utf8');
  const lines = text.split(/\r?\n/); if(!lines.length) return [];
  const header = lines.shift().split(',').map(s=>s.trim());
  const rows = [];
  for(const line of lines){
    if(!line.trim()) continue;
    const cols = line.split(',');
    const obj = {}; header.forEach((h,i)=> obj[h] = (cols[i]??'').trim());
    rows.push(obj);
  }
  return rows;
}

function parseZip(buf){
  const byTable = {};
  const zip = new AdmZip(buf);
  for(const e of zip.getEntries()){
    if(e.isDirectory) continue;
    const base = e.entryName.toLowerCase().replace(/^.*\//,'');
    if(!base.endsWith('.csv')) continue;
    const table = base.replace(/\.csv$/,'');
    if(!TABLES.includes(table)) continue;
    byTable[table] = parseCsvBuffer(e.getData());
  }
  return byTable;
}

function parseXlsx(buf){
  const byTable = {};
  const wb = XLSX.read(buf, { type:'buffer' });
  for(const sheet of wb.SheetNames){
    const key = sheet.trim();
    if(!TABLES.includes(key)) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval:'' });
    byTable[key] = rows;
  }
  return byTable;
}

router.post('/api/data-packs/upload', (req,res)=>{
  const maxMb = Number(process.env.MAX_UPLOAD_MB || '10');
  const bb = Busboy({ headers:req.headers, limits:{ fileSize: maxMb*1024*1024, files:1 } });
  let buf = Buffer.alloc(0); let mime=''; let filename='';
  bb.on('file', (_name, file, info)=>{ mime=info.mimeType||''; filename=info.filename||'upload'; file.on('data', d=> buf=Buffer.concat([buf,d])); });
  bb.on('error', err=> res.status(400).json({ ok:false, error:'UPLOAD_ERROR', detail:err.message }));
  bb.on('finish', async ()=>{
    try{
      if(!buf.length) return res.status(400).json({ ok:false, error:'NO_FILE' });
      const digest = sha256(buf);
      const isZip = mime.includes('zip') || buf.slice(0,4).toString('hex')==='504b0304';
      const byTable = isZip ? parseZip(buf) : parseXlsx(buf);

      const supa = getSupabase();
      const result = { inserted:{}, updated:{}, skipped:{}, warnings:[] };

      for(const t of Object.keys(byTable)){
        const rows = byTable[t];
        if(!rows.length) continue;
        const { error, count } = await supa.from(t).upsert(rows, { defaultToNull:false, count:'exact' });
        if(error){ result.warnings.push({ table:t, error:error.message }); continue; }
        result.inserted[t] = count ?? rows.length;
      }

      try{
        await supa.from('admin_import_audit').insert({
          file_name: filename, mime: mime, sha256: digest,
          inserted: result.inserted, updated: result.updated, skipped: result.skipped
        });
      }catch(_){}

      return res.json({ ok:true, sha256:digest, ...result });
    }catch(e){
      return res.status(500).json({ ok:false, error:'IMPORT_FAILED', detail:e.message });
    }
  });
  req.pipe(bb);
});

export default router;
