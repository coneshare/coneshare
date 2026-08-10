import os
import struct


def make_mo(po_file, mo_file):
    with open(po_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    msgids = []
    msgstrs = []
    curr_msgid = None
    curr_msgstr = None
    in_msgid = False
    in_msgstr = False

    for line in lines:
        line = line.strip()
        if line.startswith('msgid '):
            if curr_msgid is not None and curr_msgstr is not None:
                msgids.append(curr_msgid)
                msgstrs.append(curr_msgstr)
            curr_msgid = line[7:-1].replace('\\n', '\n').replace('\\"', '"')
            curr_msgstr = None
            in_msgid = True
            in_msgstr = False
        elif line.startswith('msgstr '):
            curr_msgstr = line[8:-1].replace('\\n', '\n').replace('\\"', '"')
            in_msgid = False
            in_msgstr = True
        elif line.startswith('"') and line.endswith('"'):
            val = line[1:-1].replace('\\n', '\n').replace('\\"', '"')
            if in_msgid:
                curr_msgid += val
            elif in_msgstr:
                curr_msgstr += val

    if curr_msgid is not None and curr_msgstr is not None:
        msgids.append(curr_msgid)
        msgstrs.append(curr_msgstr)

    keystr = b''
    valstr = b''
    offsets = []

    entries = sorted(zip(msgids, msgstrs), key=lambda x: x[0].encode('utf-8'))

    for k, v in entries:
        kb = k.encode('utf-8')
        vb = v.encode('utf-8')
        offsets.append((len(keystr), len(kb), len(valstr), len(vb)))
        keystr += kb + b'\x00'
        valstr += vb + b'\x00'

    key_start = 7 * 4 + 16 * len(entries)
    val_start = key_start + len(keystr)

    keys = []
    vals = []
    for k_off, k_len, v_off, v_len in offsets:
        keys.append((k_len, key_start + k_off))
        vals.append((v_len, val_start + v_off))

    header = [
        0x950412de,
        0,
        len(entries),
        7 * 4,
        7 * 4 + 8 * len(entries),
        0, 0
    ]

    out = bytearray()
    for h in header:
        out += struct.pack('<I', h)
    for k_len, k_ptr in keys:
        out += struct.pack('<II', k_len, k_ptr)
    for v_len, v_ptr in vals:
        out += struct.pack('<II', v_len, v_ptr)

    out += keystr
    out += valstr

    os.makedirs(os.path.dirname(mo_file), exist_ok=True)
    with open(mo_file, 'wb') as f:
        f.write(out)


BASE_LOCALE = os.path.join(os.path.dirname(__file__), 'locale')


if __name__ == '__main__':
    for lang in ['en', 'zh_Hans', 'ru']:
        po_path = os.path.join(BASE_LOCALE, lang, 'LC_MESSAGES', 'django.po')
        mo_path = os.path.join(BASE_LOCALE, lang, 'LC_MESSAGES', 'django.mo')
        if os.path.exists(po_path):
            make_mo(po_path, mo_path)
            print(f"Compiled {po_path} -> {mo_path}")
