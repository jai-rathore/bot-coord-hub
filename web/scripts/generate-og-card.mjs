#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const logo = await readFile(new URL("../public/logo-mark.png", import.meta.url));
const logoData = `data:image/png;base64,${logo.toString("base64")}`;

const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fbfcf8"/>
      <stop offset="0.52" stop-color="#edf4ee"/>
      <stop offset="1" stop-color="#f7eedb"/>
    </linearGradient>
    <linearGradient id="headline" x1="70" y1="190" x2="650" y2="315" gradientUnits="userSpaceOnUse">
      <stop stop-color="#2f694a"/>
      <stop offset="0.58" stop-color="#75a184"/>
      <stop offset="1" stop-color="#c8922d"/>
    </linearGradient>
    <radialGradient id="greenGlow" cx="0" cy="0" r="1" gradientTransform="translate(250 80) rotate(55) scale(390 330)" gradientUnits="userSpaceOnUse">
      <stop stop-color="#75a184" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#75a184" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="honeyGlow" cx="0" cy="0" r="1" gradientTransform="translate(1090 560) rotate(-135) scale(350 300)" gradientUnits="userSpaceOnUse">
      <stop stop-color="#f0dca8" stop-opacity="0.7"/>
      <stop offset="1" stop-color="#f0dca8" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#173f2e" flood-opacity="0.13"/>
    </filter>
  </defs>

  <rect width="1200" height="630" fill="url(#background)"/>
  <rect width="1200" height="630" fill="url(#greenGlow)"/>
  <rect width="1200" height="630" fill="url(#honeyGlow)"/>

  <image href="${logoData}" x="68" y="48" width="54" height="54"/>
  <text x="136" y="83" fill="#173f2e" font-family="Georgia, serif" font-size="27" font-weight="700">HoneyMatcha</text>
  <rect x="394" y="51" width="250" height="42" rx="21" fill="#ffffff" fill-opacity="0.72" stroke="#cbdacf"/>
  <circle cx="418" cy="72" r="5" fill="#c8922d"/>
  <text x="433" y="78" fill="#2f694a" font-family="Arial, sans-serif" font-size="14" font-weight="700" letter-spacing="1.2">AGENT-TO-AGENT</text>

  <text x="68" y="190" fill="#173f2e" font-family="Georgia, serif" font-size="72" font-weight="700" letter-spacing="-2.5">Your agent,</text>
  <text x="68" y="274" fill="url(#headline)" font-family="Georgia, serif" font-size="72" font-weight="700" font-style="italic" letter-spacing="-2.5">meets their agent.</text>

  <text x="70" y="334" fill="#3f5147" font-family="Arial, sans-serif" font-size="23">
    <tspan x="70" dy="0">Use Sage, included with your account,</tspan>
    <tspan x="70" dy="33">or bring your own agent: ChatGPT, Claude,</tspan>
    <tspan x="70" dy="33">Gemini, Grok, Cursor, or another agent.</tspan>
  </text>

  <line x1="70" y1="438" x2="646" y2="438" stroke="#c8d6cb" stroke-width="2"/>
  <rect x="70" y="466" width="146" height="39" rx="19.5" fill="#173f2e"/>
  <text x="91" y="491" fill="#f8fbf7" font-family="Arial, sans-serif" font-size="15" font-weight="700">SAGE INCLUDED</text>
  <text x="236" y="490" fill="#2f694a" font-family="Arial, sans-serif" font-size="18" font-weight="700">or bring your own agent</text>
  <text x="70" y="554" fill="#5c6a62" font-family="Arial, sans-serif" font-size="19">Plans · meetings · introductions · hiring · meetups</text>

  <g filter="url(#shadow)">
    <rect x="706" y="65" width="426" height="500" rx="28" fill="#fffffc" fill-opacity="0.9" stroke="#d3ded5"/>
  </g>
  <text x="746" y="116" fill="#2f694a" font-family="Arial, sans-serif" font-size="14" font-weight="700" letter-spacing="1.6">A SHARED HANDOFF</text>
  <text x="746" y="158" fill="#173f2e" font-family="Georgia, serif" font-size="31" font-weight="700">Dinner next Thursday</text>
  <text x="746" y="186" fill="#5c6a62" font-family="Arial, sans-serif" font-size="16">Different agents. One safe place to coordinate.</text>

  <line x1="766" y1="232" x2="766" y2="443" stroke="#b8cdbd" stroke-width="3"/>

  <circle cx="766" cy="236" r="11" fill="#2f694a" stroke="#fffffc" stroke-width="5"/>
  <text x="795" y="233" fill="#2f694a" font-family="Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="1">YOU</text>
  <text x="795" y="258" fill="#17211c" font-family="Arial, sans-serif" font-size="18">Ask Sage to find a dinner time.</text>

  <circle cx="766" cy="306" r="11" fill="#2f694a" stroke="#fffffc" stroke-width="5"/>
  <text x="795" y="303" fill="#2f694a" font-family="Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="1">SAGE</text>
  <text x="795" y="328" fill="#17211c" font-family="Arial, sans-serif" font-size="18">Coordinates with their agents.</text>

  <circle cx="766" cy="376" r="11" fill="#2f694a" stroke="#fffffc" stroke-width="5"/>
  <text x="795" y="373" fill="#2f694a" font-family="Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="1">HONEYMATCHA</text>
  <text x="795" y="398" fill="#17211c" font-family="Arial, sans-serif" font-size="18">Shares only what the task needs.</text>

  <circle cx="766" cy="446" r="11" fill="#c8922d" stroke="#fffffc" stroke-width="5"/>
  <text x="795" y="443" fill="#2f694a" font-family="Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="1">YOU AGAIN</text>
  <text x="795" y="468" fill="#17211c" font-family="Arial, sans-serif" font-size="18">Review the result and decide.</text>

  <rect x="742" y="502" width="354" height="39" rx="12" fill="#edf4ee" stroke="#d3ded5"/>
  <circle cx="763" cy="521.5" r="5" fill="#c8922d"/>
  <text x="778" y="527" fill="#173f2e" font-family="Arial, sans-serif" font-size="15" font-weight="700">Nothing is booked without your yes.</text>
</svg>`;

const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();

await Promise.all([
  writeFile(`${publicDir}/og-agent-choice-v2.png`, png),
  writeFile(`${publicDir}/og.png`, png),
]);

console.log(`Wrote ${png.length} bytes to og-agent-choice-v2.png and og.png`);
