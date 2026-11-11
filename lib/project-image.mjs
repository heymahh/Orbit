import {promises as fs} from 'node:fs';
import {safePath} from './runner.mjs';
export async function projectImage(directory, relative) {
  const target=await safePath(directory,relative || '');
  const stat=await fs.stat(target);
  if (!stat.isFile() || stat.size>2000000) throw new Error('A imagem precisa ter até 2 MB.');
  return imageFromBytes(await fs.readFile(target));
}
// Identifica a imagem pelo conteúdo (não pela extensão). Usado também para imagens de README lidas do GitHub.
export function imageFromBytes(bytes) {
  if (bytes.length>2000000) throw new Error('A imagem precisa ter até 2 MB.');
  let mime;
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime='image/png';
  else if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) mime='image/jpeg';
  else if (/^GIF8[79]a/.test(bytes.subarray(0,6).toString())) mime='image/gif';
  else if (bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP') mime='image/webp';
  else if (/<svg[\s>]/i.test(bytes.subarray(0,1000).toString('utf8')) && !bytes.includes(0)) {
    if (bytes.length>350000) throw new Error('O SVG precisa ter até 350 KB.');
    return {kind:'svg',content:bytes.toString('utf8')};
  } else throw new Error('Este arquivo não é uma imagem compatível.');
  return {kind:'raster',src:'data:'+mime+';base64,'+bytes.toString('base64')};
}
