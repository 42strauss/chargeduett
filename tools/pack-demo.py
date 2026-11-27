import base64, re, sys, os, glob
D = sys.argv[1]; OUT = sys.argv[2]
js_path = glob.glob(os.path.join(D, '_expo/static/js/web/entry-*.js'))[0]
js = open(js_path, encoding='utf-8').read()
mime = {'.png': 'image/png', '.ttf': 'font/ttf'}
used = sorted(set(re.findall(r'"(/assets/[^"]+\.(?:png|ttf))"', js)))
inlined = 0
for u in used:
    # nur Ionicons-Schrift und PNGs einbetten; andere Icon-Schriften nutzt die App nicht
    if u.endswith('.ttf') and 'Ionicons' not in u:
        continue
    f = os.path.join(D, u.lstrip('/'))
    if not os.path.exists(f):
        continue
    data = base64.b64encode(open(f, 'rb').read()).decode()
    js = js.replace(f'"{u}"', f'"data:{mime[os.path.splitext(u)[1]]};base64,{data}"')
    inlined += 1
js = js.replace('</script', '<\\/script')
html = f'''<title>Charge Duett Demo</title>
<meta name="theme-color" content="#0E0E0E">
<style>
  :root {{ --bg: #0E0E0E; color-scheme: dark; }}
  html, body {{ height: 100%; background: var(--bg); }}
  body {{ overflow: hidden; }}
  #root {{ display: flex; height: 100%; flex: 1; }}
</style>
<div id="root"></div>
<script>
  // Der Router der App erwartet die Startseite unter "/". Das Artefakt läuft unter einem
  // anderen Pfad, daher wird der Pfad (ohne Neuladen) auf "/" gesetzt.
  try {{ history.replaceState(null, '', '/'); }} catch (e) {{}}
</script>
<script>
{js}
</script>
'''
open(OUT, 'w', encoding='utf-8').write(html)
print('inlined assets:', inlined, 'size MB:', round(len(html.encode())/1e6, 2))
