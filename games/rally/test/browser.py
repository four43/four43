import asyncio, sys
from playwright.async_api import async_playwright
import pathlib
URL=(pathlib.Path(__file__).resolve().parents[3] / 'site/exp/rally/index.html').as_uri()
SHOTS=pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'build/shots'); SHOTS.mkdir(parents=True, exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        logs=[]
        # desktop
        pg = await b.new_page(viewport={'width':1280,'height':720})
        pg.on('console', lambda m: logs.append(m.type+': '+m.text)); pg.on('pageerror', lambda e: logs.append('ERR '+str(e)))
        await pg.goto(URL); await pg.wait_for_function('window.rally', timeout=60000)
        await pg.evaluate('rally.pause()')
        await pg.evaluate('rally.stepN(240)'); await pg.evaluate('rally.render()')
        await pg.screenshot(path=str(SHOTS / 'desk_idle.png'))
        # drive: throttle + steer left for 3 s
        await pg.evaluate("""()=>{ const c=rally.controls; c.update=()=>c.out; Object.assign(c.out,{throttle:1,steer:0.0,brake:0,handbrake:0}); }""")
        for i in range(12):
            await pg.evaluate('rally.stepN(60)')
        await pg.evaluate("Object.assign(rally.controls.out,{throttle:0.7,steer:0.7})")
        for i in range(6): await pg.evaluate('rally.stepN(60)')
        for i in range(30): await pg.evaluate('rally.render()')
        await pg.evaluate("document.getElementById('debug').hidden=false; rally.render()")
        await pg.screenshot(path=str(SHOTS / 'desk_drive.png'))
        print(await pg.evaluate('JSON.stringify(rally.state())'))
        # mobile landscape touch
        ctx = await b.new_context(viewport={'width':844,'height':390}, has_touch=True, is_mobile=True, device_scale_factor=2)
        m = await ctx.new_page(); m.on('pageerror', lambda e: logs.append('ERR '+str(e)))
        await m.goto(URL); await m.wait_for_function('window.rally', timeout=60000)
        await m.evaluate('rally.pause()'); await m.evaluate('rally.stepN(240)')
        # hit-test the pads: element at pad centre must be the pad
        for sel in ['#gasPad','#brakePad','#hbBtn','#steerZone','#menuBtn','#resetBtn']:
            ok = await m.evaluate(f"""(()=>{{const e=document.querySelector('{sel}');const r=e.getBoundingClientRect();const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return e.contains(t)}})()""")
            print('hit', sel, ok)
        await m.evaluate("document.getElementById('menuBtn').click()")
        await m.evaluate('rally.render()')
        await m.screenshot(path=str(SHOTS / 'mob_sheet.png'))
        await m.evaluate("document.getElementById('closeSheet').click(); rally.render()")
        await m.screenshot(path=str(SHOTS / 'mob.png'))
        print('\n'.join(logs[-15:]))
        await b.close()
asyncio.run(main())
