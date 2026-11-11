"""Run a container app, install missing external Python packages, then retry."""
import importlib.util
import os
from pathlib import Path
import re
import subprocess
import sys

PIP_NAMES = {
    'cv2': 'opencv-python-headless', 'PIL': 'pillow', 'sklearn': 'scikit-learn',
    'skimage': 'scikit-image', 'yaml': 'pyyaml', 'bs4': 'beautifulsoup4',
    'dotenv': 'python-dotenv', 'fitz': 'pymupdf', 'Crypto': 'pycryptodome',
    'docx': 'python-docx', 'serial': 'pyserial', 'jwt': 'pyjwt',
}


def missing_package(output):
    matches = re.findall(r"ModuleNotFoundError: No module named ['\"]([A-Za-z_][A-Za-z0-9_.]*)['\"]", output)
    if not matches:
        return None
    module = matches[-1]
    top = module.split('.')[0]
    # Missing project files or submodules of installed packages need a code fix.
    if top in {'google', 'azure', 'zope', 'mpl_toolkits'} or importlib.util.find_spec(top) is not None:
        return None
    for base in (Path.cwd(), Path.cwd() / 'src'):
        if (base / top).exists() or (base / (top + '.py')).exists():
            return None
    return PIP_NAMES.get(top, top)


def main(command):
    attempted = set()
    while True:
        output = ''
        child = subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors='replace', bufsize=1)
        for line in child.stdout:
            print(line, end='', flush=True)
            output = (output + line)[-20000:]
        code = child.wait()
        if code == 0 or os.environ.get('ORBIT_AUTO_DEPENDENCIES') == '0':
            return code
        package = missing_package(output)
        if not package or package in attempted or len(attempted) >= 5:
            return code
        attempted.add(package)
        print('Orbit: instalando dependência Python ausente: ' + package, flush=True)
        installed = subprocess.call([sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check', package])
        if installed != 0:
            return installed
        print('Orbit: dependência instalada; reiniciando o app.', flush=True)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
