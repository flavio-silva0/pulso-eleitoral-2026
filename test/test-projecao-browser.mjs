import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9338',
  '--user-data-dir=C:\\Users\\fjrcs\\AppData\\Local\\Temp\\chrome-debug-9338',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--window-size=1280,1080'
]);

async function waitForChrome(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9338/json/version');
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

    const targetRes = await fetch('http://127.0.0.1:9338/json/new?http://localhost:3000/', { method: 'PUT' });
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
    ws.addEventListener('message', e => {
      const d = JSON.parse(e.data);
      if (d.method === 'Runtime.consoleAPICalled') {
        console.log('Console:', d.params.type, d.params.args.map(a => a.value || a.description));
      }
      if (d.method === 'Runtime.exceptionThrown') {
        console.error('Exception:', d.params.exceptionDetails);
      }
    });

    await send('Runtime.enable');
    await send('Page.enable');

    await new Promise(r => setTimeout(r, 1000));
    await send('Runtime.evaluate', { expression: 'localStorage.removeItem("pulso-projecao"); location.hash = "#projecao";' });
    await new Promise(r => setTimeout(r, 4000));

    const evalRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const title = document.querySelector('#pj-title')?.textContent;
        const headerPct = document.querySelector('.pt-andamento .pt-pct')?.textContent;
        const liveHora = document.querySelector('.pt-andamento .pt-hora')?.textContent;
        const boxes = Array.from(document.querySelectorAll('.ptb-cx')).map(b => ({
          rot: b.querySelector('.ptb-rot')?.textContent,
          pct: b.querySelector('.ptb-pct')?.textContent,
          vt: b.querySelector('.ptb-vt')?.textContent
        }));
        const margins = Array.from(document.querySelectorAll('.pt-ch-itens > span')).map(s => s.textContent.replace(/\\s+/g, ' ').trim());
        const aviso = document.querySelector('.tv-aviso')?.textContent.replace(/\\s+/g, ' ').trim();
        const agulhaStyle = document.querySelector('.pt-agulha')?.getAttribute('style');
        return { title, headerPct, liveHora, boxes, margins, aviso, agulhaStyle };
      })()`,
      returnByValue: true
    });

    console.log('Projecao Page State:\n', JSON.stringify(evalRes.result.value, null, 2));

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile('.runtime/test-projecao.png', Buffer.from(shot.data, 'base64'));
    console.log('Saved screenshot to .runtime/test-projecao.png');

    ws.close();
  } finally {
    chrome.kill();
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  chrome.kill();
  process.exit(1);
});
