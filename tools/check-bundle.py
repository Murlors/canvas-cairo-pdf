"""搬移原生包后重放已有录制，检查加载路径与逐页文本/尺寸。"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
from pypdf import PdfReader

bundle = Path(sys.argv[1]).resolve()
root = Path(__file__).resolve().parent.parent
temporary = Path(tempfile.mkdtemp(prefix='pliflo-native-relocation-'))
copied = temporary / 'native'
shutil.copytree(bundle, copied)
results = []
if len(sys.argv)<3:raise SystemExit('Usage: check-bundle.py bundle pages-directory [pages-directory ...]')
for index, argument in enumerate(sys.argv[2:]):
    source = Path(argument).resolve()
    name = f'case-{index+1}'
    output = temporary / f'{name}.pdf'
    env = {'PATH': '/usr/bin:/bin', 'HOME': str(temporary), 'TMPDIR': str(temporary),
           'DYLD_PRINT_LIBRARIES': '1'}
    start = time.monotonic()
    completed = subprocess.run([str(copied / 'canvas-cairo-pdf'), str(source / 'manifest.json'), str(output)],
                               env=env, capture_output=True, text=True, check=True)
    elapsed = time.monotonic() - start
    loaded = completed.stderr
    assert 'dyld[' in loaded, 'Expected dynamic loader diagnostics'
    assert '/opt/homebrew/' not in loaded, 'Loaded a Homebrew library'
    (temporary / f'{name}.dyld.txt').write_text(loaded)
    original, actual = PdfReader(source / 'document.pdf'), PdfReader(output)
    assert len(original.pages) == len(actual.pages)
    for before, after in zip(original.pages, actual.pages):
        assert before.mediabox == after.mediabox
        assert before.extract_text() == after.extract_text()
        # 相同内容流意味着重定位未改变绘图指令；不是浏览器保真验收。
        assert before.get_contents().get_data() == after.get_contents().get_data()
    results.append({'fixture': name, 'pages': len(actual.pages), 'bytes': output.stat().st_size,
                    'replaySeconds': round(elapsed, 3), 'textAndContentStreamsEqual': True,
                    'homebrewDylibsLoaded': False})
report = {'relocatedDirectory': str(temporary), 'results': results,
          'limitation': 'Same host; system fonts remain available. Not a clean-machine or minimum-macOS test.'}
(bundle / 'relocation-check.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
