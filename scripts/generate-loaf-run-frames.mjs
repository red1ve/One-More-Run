import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'assets/characters/loaf-rear.svg');
const outDir = path.join(root, 'assets/characters/run');

// Cut only the paw TIPS (ellipses), then overlay those same tips with a
// small offset. No tail hole. Offsets stay small so the hole stays covered.
const frames = [
  {
    name: 'loaf-run-01.svg',
    body: 'rotate(-1.2 513 670) translate(0 3)',
    left: 'rotate(2.2 448 840) translate(-1 12)',
    right: 'rotate(-2.0 578 830) translate(1 -6)'
  },
  {
    name: 'loaf-run-02.svg',
    body: 'rotate(-0.25 513 670) translate(0 -4)',
    left: 'translate(0 5)',
    right: 'translate(0 -3)'
  },
  {
    name: 'loaf-run-03.svg',
    body: 'rotate(1.2 513 670) translate(0 3)',
    left: 'rotate(-2.0 448 840) translate(-1 -6)',
    right: 'rotate(2.2 578 830) translate(1 12)'
  },
  {
    name: 'loaf-run-04.svg',
    body: 'rotate(0.25 513 670) translate(0 -3)',
    left: 'translate(0 -3)',
    right: 'translate(0 5)'
  }
];

const source = await readFile(sourcePath, 'utf8');
const innerMatch = source.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
if (!innerMatch) throw new Error('loaf-rear.svg has no inner markup');
const inner = innerMatch[1].trim();

await mkdir(outDir, { recursive: true });

for (const frame of frames) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1024">
  <defs>
    <g id="loaf">${inner}</g>
    <clipPath id="bodyClip" clipPathUnits="userSpaceOnUse">
      <path clip-rule="evenodd" d="M0 0H1024V1024H0Z
        M424 902a24 18 0 1 0 48 0a24 18 0 1 0-48 0Z
        M556 908a22 18 0 1 0 44 0a22 18 0 1 0-44 0Z"/>
    </clipPath>
    <clipPath id="leftPaw">
      <ellipse cx="448" cy="878" rx="38" ry="42"/>
    </clipPath>
    <clipPath id="rightPaw">
      <ellipse cx="578" cy="872" rx="36" ry="48"/>
    </clipPath>
  </defs>
  <g transform="${frame.body}">
    <g clip-path="url(#bodyClip)">
      <use href="#loaf" xlink:href="#loaf"/>
    </g>
    <g transform="${frame.left}">
      <g clip-path="url(#leftPaw)">
        <use href="#loaf" xlink:href="#loaf"/>
      </g>
    </g>
    <g transform="${frame.right}">
      <g clip-path="url(#rightPaw)">
        <use href="#loaf" xlink:href="#loaf"/>
      </g>
    </g>
  </g>
</svg>
`;
  await writeFile(path.join(outDir, frame.name), svg);
}

console.log(`Wrote ${frames.length} run frames to ${outDir}`);
