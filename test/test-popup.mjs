import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9333',
  '--user-data-dir=C:\\Users\\fjrcs\\AppData\\Local\\Temp\\chrome-debug-9333',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--window-size=1280,820'
]);

async function waitForChrome(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9333/json/version');
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

    const targetRes = await fetch('http://127.0.0.1:9333/json/new?http://localhost:3000/#mapas', { method: 'PUT' });
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
    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    // Wait 3.5s for atlas data
    await new Promise(r => setTimeout(r, 3500));

    // Hover over SP in Brasil mode
    const hoverSP = await send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.querySelector('[data-place="SP"]');
        if (!el) return { error: 'SP not found' };
        const rect = el.getBoundingClientRect();
        const evt = new MouseEvent('pointermove', {
          bubbles: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2
        });
        el.dispatchEvent(evt);
        const tip = document.querySelector('#map-tooltip');
        return {
          found: true,
          tipHidden: tip?.hidden,
          tipLeft: tip?.style.left,
          tipTop: tip?.style.top,
          tipText: tip?.innerText,
          tipHtml: tip?.innerHTML
        };
      })()`,
      returnByValue: true
    });
    console.log('Hover evaluation over SP:', JSON.stringify(hoverSP.result.value, null, 2));

    await new Promise(r => setTimeout(r, 500));
    const shotSP = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile('.runtime/test-popup-sp.png', Buffer.from(shotSP.data, 'base64'));
    console.log('Saved .runtime/test-popup-sp.png');

    // Switch to Mundo
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('[data-map-mode="mundo"]');
        if (btn) btn.click();
      })()`
    });

    await new Promise(r => setTimeout(r, 2000));

    // Hover over China
    const hoverChina = await send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.querySelector('[data-place="china"]');
        if (!el) return { error: 'China not found', places: Array.from(document.querySelectorAll('[data-place]')).map(p => p.dataset.place).slice(0, 10) };
        const rect = el.getBoundingClientRect();
        const evt = new MouseEvent('pointermove', {
          bubbles: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2
        });
        el.dispatchEvent(evt);
        const tip = document.querySelector('#map-tooltip');
        return {
          found: true,
          tipHidden: tip?.hidden,
          tipLeft: tip?.style.left,
          tipTop: tip?.style.top,
          tipText: tip?.innerText,
          tipHtml: tip?.innerHTML
        };
      })()`,
      returnByValue: true
    });
    console.log('Hover evaluation over China:', JSON.stringify(hoverChina.result.value, null, 2));

    await new Promise(r => setTimeout(r, 500));
    const shotChina = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile('.runtime/test-popup-china.png', Buffer.from(shotChina.data, 'base64'));
    console.log('Saved .runtime/test-popup-china.png');

    chrome.kill();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    chrome.kill();
    process.exit(1);
  }
}

run();
