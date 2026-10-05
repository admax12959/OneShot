#!/usr/bin/env python3
"""Rebuild ../prototype.html from parts + oneshot-runtime.base.html."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / "prototype.html"
s = (ROOT / "oneshot-runtime.base.html").read_text()
P = lambda f: (ROOT / f).read_text()

def rep(a, b, cnt=1):
    global s
    assert s.count(a) >= 1, a[:80]
    s = s.replace(a, b, cnt)

rep("</style>", P("a-css.css") + "\n</style>")
rep("</defs>", P("b-icons.svg") + "</defs>")
i = s.index('<nav class="switch" id="switch">')
j = s.index("</nav>", i) + 6
G = [
    ("home", [("home", "Home")]),
    ("clip", [("clip-run", "Paste"), ("clip-mgmt", "Manage")]),
    ("shot", [("shot-run", "Capture"), ("shot-mgmt", "History")]),
    ("bat", [("battery-run", "Menu"), ("battery-mgmt", "Panel")]),
    ("disp", [("display-run", "Menu"), ("display-mgmt", "Settings")]),
    ("braces", [("json-run", "Format"), ("json-mgmt", "Studio")]),
    ("key", [("vault-run", "Autofill"), ("vault-mgmt", "Vault")]),
    ("canvas", [("canvas", "Canvas")]),
]
nav = (
    '<nav class="switch" id="switch">'
    + "<i></i>".join(
        '<span class="grp"><svg class="ic s"><use href="#i-%s"/></svg>%s</span>'
        % (k, "".join('<a href="#%s" data-v="%s">%s</a>' % (h, h, t) for h, t in L))
        for k, L in G
    )
    + "</nav>"
)
s = s[:i] + P("c-body.html") + "\n" + nav + s[j:]
rep("/* routing */", P("d-js.js") + "\n/* routing */")
rep(
    "const place=b=>{knob.style.transform=`translateX(${b.offsetLeft-2}px)`};",
    "const place=b=>{knob.style.transform=`translateX(${b.offsetLeft-2}px)`;knob.style.width=b.offsetWidth+'px'};",
)
rep(
    "['bat','Battery'],['disp','Displays'],['canvas','Canvas'],['braces','JSON'],['key','Password']",
    "['bat','Battery','#battery-mgmt'],['disp','Displays','#display-mgmt'],['canvas','Canvas','#canvas'],['braces','JSON','#json-mgmt'],['key','Vault','#vault-mgmt']",
)
rep(
    "if(cur===id){",
    "if(cur===id){ {const v0=document.getElementById(id);v0.classList.remove('live');v0.offsetWidth;v0.classList.add('live');} if(ENTER[id]) ENTER[id](false);",
)
rep(
    "if(prev){ prev.classList.remove('in');",
    "if(prev){ if(LEAVE[was]) LEAVE[was](); prev.classList.remove('in','live');",
)
rep(
    "if(id==='shot-mgmt'&&edit){ openEd($('.tile'),true); }",
    "if(id==='shot-mgmt'&&edit){ openEd($('.tile'),true); }\n  v.classList.remove('live'); v.offsetWidth; v.classList.add('live'); if(ENTER[id]) ENTER[id](first);",
)
rep("let id=(hash||'').replace('#','')||'clip-run';", "let id=(hash||'').replace('#','')||'home';")
rep("if(!document.getElementById(id)) id='clip-run';", "if(!document.getElementById(id)) id='home';")
rep("<script>\nconst RM", '<script>\nwindow.onerror=(m,u,l)=>{window.__err=(window.__err||"")+m+"@"+l+" "};\nconst RM')

OUT.write_text(s)
ban = ["example", "demo", "guidance", "review", "prototype", "lorem", "Lorem"] + [
    "".join(map(chr, cps))
    for cps in (
        (0x793A, 0x4F8B),
        (0x6A21, 0x62DF),
        (0x6307, 0x5BFC),
        (0x8BC4, 0x5BA1),
        (0x539F, 0x578B),
    )
]
bad = [w for w in ban if re.search(r"(?i)\b" + re.escape(w) + r"\b", s)]
CJK = re.compile("[%s-%s]+" % (chr(0x4E00), chr(0x9FFF)))
cjk_runs = CJK.findall(s)
print("written", len(s), "->", OUT, "forbidden:", bad, "total_cjk_runs:", len(cjk_runs))
if cjk_runs:
    raise SystemExit("CJK characters found in built HTML")
