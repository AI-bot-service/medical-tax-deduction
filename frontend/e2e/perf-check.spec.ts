import { test, expect } from '@playwright/test';

const BASE = 'https://medvychet.systemtool.online';

test('замер времени ответа сервера', async ({ page, request }) => {
  const endpoints = [
    { name: 'Frontend (главная)', url: BASE + '/' },
    { name: 'Backend /health',    url: BASE + '/api/v1/health' },
  ];

  for (const ep of endpoints) {
    const t0 = Date.now();
    const res = await request.get(ep.url, { timeout: 30000 });
    const ms = Date.now() - t0;
    console.log(`[${ep.name}] status=${res.status()} time=${ms}ms`);
  }

  // Замер загрузки страницы через браузер с Navigation Timing
  const t0 = Date.now();
  const response = await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 });
  const fullLoad = Date.now() - t0;

  const timing = await page.evaluate(() => {
    const t = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return {
      dns:         Math.round(t.domainLookupEnd  - t.domainLookupStart),
      tcp:         Math.round(t.connectEnd        - t.connectStart),
      ssl:         Math.round(t.connectEnd        - t.secureConnectionStart),
      ttfb:        Math.round(t.responseStart     - t.requestStart),
      download:    Math.round(t.responseEnd       - t.responseStart),
      domParsing:  Math.round(t.domContentLoadedEventStart - t.responseEnd),
      domComplete: Math.round(t.domComplete       - t.startTime),
    };
  });

  console.log('\n=== Navigation Timing ===');
  console.log(`DNS lookup:    ${timing.dns}ms`);
  console.log(`TCP connect:   ${timing.tcp}ms`);
  console.log(`SSL handshake: ${timing.ssl}ms`);
  console.log(`TTFB:          ${timing.ttfb}ms`);
  console.log(`Download:      ${timing.download}ms`);
  console.log(`DOM parsing:   ${timing.domParsing}ms`);
  console.log(`DOM complete:  ${timing.domComplete}ms`);
  console.log(`Full load:     ${fullLoad}ms`);
  console.log(`HTTP status:   ${response?.status()}`);

  // Медленные ресурсы
  const slowResources = await page.evaluate(() => {
    return performance.getEntriesByType('resource')
      .filter(r => r.duration > 500)
      .map(r => ({ name: (r as PerformanceResourceTiming).name.split('/').slice(-2).join('/'), duration: Math.round(r.duration) }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
  });

  if (slowResources.length > 0) {
    console.log('\n=== Медленные ресурсы (>500ms) ===');
    slowResources.forEach(r => console.log(`  ${r.duration}ms — ${r.name}`));
  }
});
