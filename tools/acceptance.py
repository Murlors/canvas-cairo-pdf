"""Render document fixtures sequentially and verify each PDF; failures stay visible."""
import json
from pathlib import Path
import subprocess
import sys
import time
import tempfile
from pypdf import PdfReader

root = Path(__file__).resolve().parent.parent
out = Path(tempfile.mkdtemp(prefix='acceptance-', dir=root / 'output'))
cases = ['chinese', 'mixed', 'fonts', 'missing', 'multipage', 'stress-40', 'representative/office-report']
rows = []
for case in cases:
    start = time.monotonic()
    rendered = subprocess.run(['node', 'scripts/run-pages.ts', str(root / 'fixtures' / f'{case}.docx')], cwd=root, capture_output=True, text=True)
    row = {'case': case, 'renderExit': rendered.returncode}
    if rendered.returncode == 0:
        info = json.loads(rendered.stdout.strip().splitlines()[-1])
        pages = Path(info['run']) / 'pages'
        checked = subprocess.run([sys.executable, 'tools/check-pages.py', str(pages)], cwd=root, capture_output=True, text=True)
        row.update({'run': info['run'], 'pages': info['pages'], 'checkExit': checked.returncode})
        if checked.returncode == 0:
            checks = json.loads((pages / 'checks.json').read_text())
            row.update({'pdfBytes': checks['bytes'], 'maxPageMAE': max(p['rgbMAE255'] for p in checks['rows'])})
            if case == 'representative/office-report':
                text = ''.join(p.extract_text() for p in PdfReader(pages / 'document.pdf').pages)
                keys = ['SUMMARY-001', 'REPORT-END-001'] + [f'ROW-{i:03}' for i in range(1, 46)] + [f'ITEM-{i}-{j}' for i in range(1, 4) for j in range(1, 6)]
                row['missingOrDuplicateSentinels'] = [key for key in keys if text.count(key) != 1]
                if row['missingOrDuplicateSentinels']: row['checkExit'] = 1
        else: row['error'] = checked.stderr[-1500:]
    else: row['error'] = rendered.stderr[-1500:]
    row['elapsedWithChecksSeconds'] = round(time.monotonic() - start, 2)
    rows.append(row)
    (out / 'results.json').write_text(json.dumps(rows, indent=2))
    print(json.dumps(row), flush=True)
print(out, flush=True)
sys.exit(1 if any(r['renderExit'] or r.get('checkExit', 1) for r in rows) else 0)
