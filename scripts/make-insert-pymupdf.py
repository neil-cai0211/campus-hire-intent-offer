"""从录用意向书 PDF 生成高画质插图（邮件用）—— 不依赖 playwright / 浏览器。

背景：2026-11-13 起 playwright-core 已从本机卸载（Chrome 157 与 1.56.0 的
connectOverCDP 握手不兼容），旧 make-insert-png.js 无法再运行。
本脚本用 PyMuPDF 直接渲染 PDF 矢量页，Pillow 导出 JPEG。

用法:
  python make-insert-pymupdf.py --names "<姓名>-社招-<职位>" ["..." ...]
  python make-insert-pymupdf.py --pdf "<绝对路径>" [--out "<jpg绝对路径>"]

环境变量:
  HIRE_OUT_DIR   PDF 目录（默认 D:/AI-Workspace/录用意向书/out）
  HIRE_PNG_DIR   输出目录（默认 D:/AI-Workspace/录用意向书/out-png）
  HIRE_PNG_WIDTH 输出宽度（默认 3176）

输出: 3176 宽 JPEG q=90，约 1.8MB（在 offer 邮件插图 <=2MB 限制内）。
"""
import argparse
import os
import sys

import pymupdf
from PIL import Image

PDF_DIR = os.environ.get('HIRE_OUT_DIR', 'D:/AI-Workspace/录用意向书/out')
PNG_DIR = os.environ.get('HIRE_PNG_DIR', 'D:/AI-Workspace/录用意向书/out-png')
OUT_W = int(os.environ.get('HIRE_PNG_WIDTH', '3176'))
JPEG_Q = 90


def render(pdf_path, jpg_path, width=OUT_W):
    doc = pymupdf.open(pdf_path)
    try:
        page = doc[0]
        zoom = width / page.rect.width
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        os.makedirs(os.path.dirname(jpg_path), exist_ok=True)
        img.save(jpg_path, 'JPEG', quality=JPEG_Q, optimize=True)
        return img.size, os.path.getsize(jpg_path)
    finally:
        doc.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--names', nargs='+', default=[])
    ap.add_argument('--pdf')
    ap.add_argument('--out')
    a = ap.parse_args()

    if a.pdf:
        jobs = [(a.pdf, a.out or os.path.join(PNG_DIR, os.path.splitext(os.path.basename(a.pdf))[0] + '.jpg'))]
    elif a.names:
        jobs = [(os.path.join(PDF_DIR, n + '.pdf'), os.path.join(PNG_DIR, n + '.jpg')) for n in a.names]
    else:
        print('✗ 需要 --names 或 --pdf', file=sys.stderr)
        return 2

    os.makedirs(PNG_DIR, exist_ok=True)
    bad = 0
    for pdf, jpg in jobs:
        if not os.path.exists(pdf):
            print('⏭  缺 PDF:', pdf)
            bad += 1
            continue
        size, nbytes = render(pdf, jpg)
        print('OK', jpg, size, nbytes, 'bytes')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
