import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9334',
  '--user-data-dir=C:\\Users\\fjrcs\\AppData\\Local\\Temp\\chrome-debug-9334',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--window-size=1280,820'
]);

async function waitForChrome(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9334/json/version');
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

    const targetRes = await fetch('http://127.0.0.1:9334/json/new?http://localhost:3000/', { method: 'PUT' });
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
    await send('Runtime.enable');
    await send('Page.enable');

    await new Promise(r => setTimeout(r, 1000));
    await send('Runtime.evaluate', { expression: 'location.hash = "#curva"' });
    await new Promise(r => setTimeout(r, 2000));

    // Test default aligned state
    const evalRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const title = document.querySelector('#cv-title')?.textContent;
        const sub = document.querySelector('#cv-sub')?.textContent;
        const selected = Array.from(document.querySelectorAll('.cv-seg button.selected')).map(b => b.textContent);
        const cards = Array.from(document.querySelectorAll('.cv-card')).map(c => ({
          k: c.querySelector('.cv-k')?.textContent,
          text: c.textContent.replace(/\\s+/g, ' ').trim()
        }));
        const svgLines = document.querySelectorAll('#cv-chart svg path').length;
        const ticks = Array.from(document.querySelectorAll('#cv-chart svg text.cv-ax')).map(t => t.textContent.trim());
        const status = document.querySelector('#cv-status')?.textContent;
        return { title, sub, selected, cards, svgLines, ticksCount: ticks.length, ticksSample: ticks.slice(0, 10), status };
      })()`,
      returnByValue: true
    });
    console.log('Aligned evaluation:', JSON.stringify(evalRes.result.value, null, 2));

    // Click "Horário real"
    await send('Runtime.evaluate', { expression: 'document.querySelector("[data-cv-x=\\"time\\"]").click()' });
    await new Promise(r => setTimeout(r, 200));
    const realRes = await send('Runtime.evaluate', {
      expression: `document.querySelector(".cv-seg button.selected").textContent + " | " + document.querySelector("#cv-sub").textContent`,
      returnByValue: true
    });
    console.log('Real time switch:', realRes.result.value);

    // Click "Por % apurado"
    await send('Runtime.evaluate', { expression: 'document.querySelector("[data-cv-x=\\"pct\\"]").click()' });
    await new Promise(r => setTimeout(r, 200));
    const pctRes = await send('Runtime.evaluate', {
      expression: `document.querySelector(".cv-seg button.selected").textContent + " | " + document.querySelector("#cv-sub").textContent`,
      returnByValue: true
    });
    console.log('Pct switch:', pctRes.result.value);

    // Click "19h com 17h"
    await send('Runtime.evaluate', { expression: 'document.querySelector("[data-cv-x=\\"aligned\\"]").click()' });
    await new Promise(r => setTimeout(r, 200));
    const alignedRes = await send('Runtime.evaluate', {
      expression: `document.querySelector(".cv-seg button.selected").textContent + " | " + document.querySelector("#cv-sub").textContent`,
      returnByValue: true
    });
    console.log('Aligned switch back:', alignedRes.result.value);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile('.runtime/test-curva.png', Buffer.from(shot.data, 'base64'));
    console.log('Saved .runtime/test-curva.png');

    ws.close();
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    chrome.kill();
  }
}

run();
