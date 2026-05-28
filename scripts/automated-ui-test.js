const puppeteer = require('puppeteer');

(async () => {
  const testUrl = 'http://localhost:3000/login';
  const email = 'super@suivi-dechets.com';
  const password = 'Admin123!';
  const socketRequests = [];
  const apiRequests = [];

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    const isSameOrigin = url.startsWith('http://localhost:3000') || url.startsWith('http://127.0.0.1');
    if (!isSameOrigin && ['stylesheet', 'font', 'image', 'media'].includes(request.resourceType())) {
      return request.abort();
    }
    return request.continue();
  });

  page.on('console', async (msg) => {
    const location = msg.location ? `${msg.location().url}:${msg.location().lineNumber}:${msg.location().columnNumber}` : '';
    if (msg.type() === 'error') {
      const argTexts = [];
      for (const arg of msg.args()) {
        try {
          const remoteObj = arg._remoteObject;
          if (remoteObj && remoteObj.type === 'object') {
            const stackHandle = await arg.getProperty('stack');
            const messageHandle = await arg.getProperty('message');
            const nameHandle = await arg.getProperty('name');
            const stack = stackHandle ? await stackHandle.jsonValue().catch(() => null) : null;
            const message = messageHandle ? await messageHandle.jsonValue().catch(() => null) : null;
            const name = nameHandle ? await nameHandle.jsonValue().catch(() => null) : null;
            if (stack) {
              argTexts.push(stack);
            } else if (message || name) {
              argTexts.push(`${name || ''}: ${message || ''}`);
            } else {
              argTexts.push(arg.toString());
            }
          } else {
            const json = await arg.jsonValue();
            argTexts.push(String(json));
          }
        } catch (e) {
          argTexts.push(arg.toString());
        }
      }
      console.error('PAGE ERROR:', msg.text(), argTexts.join(' | '), location);
    }
  });

  page.on('pageerror', (err) => {
    console.error('PAGE JS ERROR:', err.stack || err.message || err);
  });

  page.on('requestfinished', (request) => {
    const url = request.url();
    if (url.includes('/socket.io')) socketRequests.push(url);
    if (url.includes('/api/')) apiRequests.push({ url, status: request.response()?.status() });
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    if (url.includes('/socket.io')) socketRequests.push(`${url} FAILED`);
    if (url.includes('/api/')) apiRequests.push({ url, status: 'FAILED' });
  });

  try {
    await page.evaluateOnNewDocument(() => {
      window.onerror = (message, source, lineno, colno, error) => {
        console.error('WINDOW ERROR:', message, source, lineno, colno, error?.stack || 'no stack');
      };
      window.onunhandledrejection = (event) => {
        console.error('UNHANDLED REJECTION:', event.reason?.stack || event.reason);
      };
    });

    console.log('Opening login page...');
    await page.goto(testUrl, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('#loginForm', { visible: true });
    await page.type('#email', email, { delay: 30 });
    await page.type('#password', password, { delay: 30 });
    await Promise.all([
      page.click('#loginBtn'),
      page.waitForNavigation({ waitUntil: 'domcontentloaded' })
    ]);

    const finalUrl = page.url();
    console.log('Final URL:', finalUrl);
    if (!finalUrl.endsWith('/')) {
      throw new Error(`Expected redirect to / but got ${finalUrl}`);
    }

    const initialState = await page.evaluate(() => ({
      pathname: window.location.pathname,
      token: localStorage.getItem('accessToken'),
      hasLoginForm: !!document.getElementById('loginForm'),
      hasMainContent: !!document.getElementById('main-content')
    }));
    console.log('Initial page state after navigation:', initialState);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const delayedState = await page.evaluate(() => ({
      pathname: window.location.pathname,
      token: localStorage.getItem('accessToken'),
      hasLoginForm: !!document.getElementById('loginForm'),
      hasMainContent: !!document.getElementById('main-content')
    }));
    console.log('Delayed page state:', delayedState);
    await page.waitForSelector('#main-content', { visible: true });
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const contentHtml = await page.$eval('#main-content', (el) => el.innerText.trim().slice(0, 200));
    console.log('Main content loaded:', contentHtml.substring(0, 150));

    const socketSeen = socketRequests.some((u) => String(u).includes('/socket.io'));
    const apiSeen = apiRequests.some((item) => String(item.url).includes('/api/auth/me') || String(item.url).includes('/api/stats'));

    console.log('Socket requests observed:', socketRequests.length);
    socketRequests.forEach((r) => console.log('  ', r));
    console.log('API requests observed:', apiRequests.length);
    apiRequests.forEach((r) => console.log('  ', JSON.stringify(r)));

    if (!socketSeen) {
      throw new Error('No socket.io request observed during page load.');
    }
    if (!apiSeen) {
      throw new Error('No expected API request observed during page load.');
    }

    console.log('✅ Automated browser test succeeded. Login, navigation, and socket/API requests are working.');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Automated browser test failed:', err.message || err);
    await page.screenshot({ path: 'scripts/automated-ui-test-failure.png', fullPage: true });
    console.error('Screenshot saved to scripts/automated-ui-test-failure.png');
    await browser.close();
    process.exit(1);
  }
})();
