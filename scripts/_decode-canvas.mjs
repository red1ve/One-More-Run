import fs from 'node:fs';
const [, , inputFile, outputFile] = process.argv;
const raw = fs.readFileSync(inputFile, 'utf8');
const data = JSON.parse(raw);
const text = data[0].text;
const b64 = text.split(',').slice(1).join(',').trim().replace(/^"|"$/g, '');
fs.writeFileSync(outputFile, Buffer.from(b64, 'base64'));
console.log('wrote', outputFile, b64.length, 'base64 chars');
