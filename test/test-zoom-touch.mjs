import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9335',
  '--user-data-dir=C:\\Users\\fjrcs\\AppData\\Local\\Temp\\chrome-debug-9335',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--window-size=400,900'
]);

async function waitForChrome(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9335/json/version');
      if (res.ok) return await res.json();
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('Chrome remote debugging did not respond');
}

async function run() {
  try {
    const ver = await waitForChrome();
    console.log('Chrome connected:', ver.Browser);

    const targetRes = await fetch('http://127.0.0.1:9335/json/new?http://localhost:3000/#mapas', { method: 'PUT' });
    const target = await targetRes.json();

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 1;
    const send = (method, params = {}) => new Promise((res, rej) => {
      const msgId = id++;
      const handler = (event) => {
        const data = JSON.parse(event.data);
        if (data.id === msgId) {
          ws.removeEventListener('message', handler);
          if (data.error) rej(data.error);
          else res(data.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

    await new Promise(r => ws.addEventListener('open', r));
    ws.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        console.log('BROWSER LOG:', ...data.params.args.map(a => a.value || a.description));
      }
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    // Emulate iPhone 14
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
      hasTouch: true
    });
    await send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 5
    });

    // Wait for map load
    await new Promise(r => setTimeout(r, 2000));

    // Test 1: Check mobile map exists and initial viewBox
    const initMobile = await send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('#heat-map');
        const svg = canvas?.querySelector('svg');
        const rect = canvas?.getBoundingClientRect();
        return {
          viewBox: svg?.getAttribute('viewBox'),
          width: rect?.width,
          height: rect?.height
        };
      })()`,
      returnByValue: true
    });
    console.log('Mobile Initial:', initMobile.result.value);

    // Test 2: Mobile pinch-to-zoom on phone screen
    const mobilePinch = await send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('#heat-map');
        const rect = canvas.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const midY = rect.top + rect.height / 2;

        // Two fingers touch
        canvas.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 1,
          pointerType: 'touch',
          clientX: midX - 25,
          clientY: midY
        }));
        canvas.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 2,
          pointerType: 'touch',
          clientX: midX + 25,
          clientY: midY
        }));

        // Pinch out (distance from 50 to 125 -> 2.5x zoom)
        window.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 1,
          pointerType: 'touch',
          clientX: midX - 62.5,
          clientY: midY
        }));
        window.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 2,
          pointerType: 'touch',
          clientX: midX + 62.5,
          clientY: midY
        }));

        const svg = canvas.querySelector('svg');
        const vb = svg?.getAttribute('viewBox');

        // Release fingers
        window.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true,
          pointerId: 1,
          pointerType: 'touch',
          clientX: midX - 62.5,
          clientY: midY
        }));
        window.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true,
          pointerId: 2,
          pointerType: 'touch',
          clientX: midX + 62.5,
          clientY: midY
        }));

        return {
          viewBoxAfterMobilePinch: vb
        };
      })()`,
      returnByValue: true
    });
    console.log('After Mobile Pinch:', mobilePinch.result.value);

    // Test 3: Single finger drag panning on mobile
    const mobilePan = await send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('#heat-map');
        const rect = canvas.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;

        // Touch 1 down
        canvas.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 3,
          pointerType: 'touch',
          clientX: startX,
          clientY: startY
        }));

        // Drag 40px left, 30px up
        window.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 3,
          pointerType: 'touch',
          clientX: startX - 40,
          clientY: startY - 30
        }));

        const svg = canvas.querySelector('svg');
        const vb = svg?.getAttribute('viewBox');

        window.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true,
          pointerId: 3,
          pointerType: 'touch',
          clientX: startX - 40,
          clientY: startY - 30
        }));

        return {
          viewBoxAfterMobilePan: vb
        };
      })()`,
      returnByValue: true
    });
    console.log('After Mobile Pan:', mobilePan.result.value);

    // Wait for pan gesture cooldown
    await new Promise(r => setTimeout(r, 200));

    // Test 4: Verify clicking on a state (SP) works properly
    await send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.querySelector('[data-place="SP"]');
        if (el) {
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
      })()`
    });
    await new Promise(r => setTimeout(r, 700));

    const checkClickSP = await send('Runtime.evaluate', {
      expression: `(() => {
        const selectedEl = document.querySelector('.map-selected');
        const h2 = document.querySelector('#map-detail h2');
        return {
          code: selectedEl ? selectedEl.getAttribute('data-place') : null,
          title: h2 ? h2.innerText : null
        };
      })()`,
      returnByValue: true
    });
    console.log('State click check:', checkClickSP.result.value);
    if (checkClickSP.result.value.code !== 'SP') {
      throw new Error('Click on state did not select SP: ' + JSON.stringify(checkClickSP.result.value));
    }

    // Capture mobile screenshot
    const mobileShot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile('.runtime/test-zoom-mobile.png', Buffer.from(mobileShot.data, 'base64'));
    console.log('Saved .runtime/test-zoom-mobile.png');

    ws.close();
    chrome.kill();
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    chrome.kill();
    process.exit(1);
  }
}

run();
