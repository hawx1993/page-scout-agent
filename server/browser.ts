import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

export function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    chromium.executablePath(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    process.env.PROGRAMFILES &&
      path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  ];
  const found = candidates.find((file): file is string => !!file && existsSync(file));
  if (!found)
    throw new Error(
      '未找到 Chromium / Chrome。请执行 npx playwright install chromium，或设置 CHROME_PATH。',
    );
  return found;
}

export const browserArgs = [
  '--proxy-bypass-list=<-loopback>',
  '--disable-quic',
  '--disable-background-networking',
  '--disable-extensions',
  '--disable-sync',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
];
