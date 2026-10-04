import json, hashlib, re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.request import urlopen, Request
from pypdf import PdfReader

ROOT = Path(__file__).parent
OUT = ROOT / 'manufacturer-sources'
OUT.mkdir(exist_ok=True)
sources = json.loads((ROOT / 'manufacturer-sources-manifest.json').read_text(encoding='utf-8'))

def run(item):
    name, url = item
    path = OUT / (name + '.pdf')
    try:
        if path.exists():
            body = path.read_bytes()
            final_url = url
        else:
            with urlopen(Request(url, headers={'User-Agent':'Mozilla/5.0'}), timeout=45) as r:
                body = r.read()
                final_url = r.url
        if not body.startswith(b'%PDF'):
            raise ValueError('Not a PDF')
        path.write_bytes(body)
        doc = PdfReader(path)
        pages = ['\n--- PDF PAGE ' + str(i+1) + ' ---\n' + p.extract_text() for i,p in enumerate(doc.pages)]
        path.with_suffix('.txt').write_text('\n'.join(pages), encoding='utf-8')
        return {'name':name,'url':url,'final_url':final_url,'pdf_pages':len(doc.pages),'sha256':hashlib.sha256(body).hexdigest(),'status':'downloaded_and_extracted'}
    except Exception as e:
        return {'name':name,'url':url,'status':'failed','error':str(e)}

with ThreadPoolExecutor(max_workers=5) as pool:
    results = list(pool.map(run, sources))
(OUT / 'download-log.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False,indent=2))
