# Ottimizza i PNG senza perdita. Uso: python3 tools/compress.py
import glob, os
from PIL import Image
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'icons')
for p in sorted(glob.glob(os.path.join(here, '*.png'))):
    Image.open(p).convert('RGB').save(p, optimize=True)
    print(os.path.basename(p), os.path.getsize(p) // 1024, 'KB')
