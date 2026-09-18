"""顺序测完整实验入口；RSS为可追踪子进程采样，不冒充系统WebKit总内存。"""
import json
import subprocess
import time
import tempfile
from pathlib import Path
from pypdf import PdfReader

root=Path(__file__).resolve().parent.parent
out=Path(tempfile.mkdtemp(prefix='prepare-benchmark-',dir=root/'output'))
cases=['representative/office-report','representative/image-report','stress-40']
results=[]
for case in cases:
    for trial in range(3):
        script="import {prepareDocument} from './scripts/prepare.ts'; console.log(JSON.stringify(await prepareDocument(process.argv[1])));"
        start=time.monotonic()
        p=subprocess.Popen(['node','--input-type=module','-e',script,str(root/'fixtures'/f'{case}.docx')],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        peak=0;samples=0
        while p.poll() is None:
            snapshot=subprocess.run(['/bin/ps','-axo','pid=,ppid=,rss='],capture_output=True,text=True,check=True)
            rows=[tuple(map(int,line.split())) for line in snapshot.stdout.splitlines() if line.strip()]
            selected={p.pid}
            while True:
                more={pid for pid,parent,rss in rows if parent in selected}
                if more<=selected:break
                selected|=more
            peak=max(peak,sum(rss for pid,parent,rss in rows if pid in selected));samples+=1
            time.sleep(.1)
        stdout,stderr=p.communicate()
        if p.returncode:raise RuntimeError(stderr)
        result=json.loads(stdout);pdf=Path(result['pdfPath']);reader=PdfReader(pdf)
        if case.endswith('image-report'):
            text=''.join(page.extract_text() for page in reader.pages)
            assert all(text.count(f'FIGURE-{i:02}')==1 for i in range(1,13))
            assert sum(len(page.images) for page in reader.pages)==12
        row={'case':case,'trial':trial+1,'endToEndSeconds':round(time.monotonic()-start,3),'sampledDescendantPeakMiB':round(peak/1024,2),'samples':samples,'pages':len(reader.pages),'pdfBytes':pdf.stat().st_size,'imageObjects':sum(len(page.images) for page in reader.pages),'pdf':str(pdf)}
        results.append(row);print(json.dumps(row),flush=True)
        (out/'results.json').write_text(json.dumps({'memoryScope':'100ms sampled Node + descendant processes; excludes non-descendant system-managed WebKit helpers; not total app peak','results':results},indent=2))
print(out)
