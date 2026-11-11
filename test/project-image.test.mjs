import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {projectImage} from '../lib/project-image.mjs';
test('project images preserve format and reject non-images, large files and traversal',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-images-'));const directory=path.join(root,'project');await fs.mkdir(directory);
 try{
  await fs.writeFile(path.join(directory,'logo.svg'),'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h2"/></svg>');
  assert.equal((await projectImage(directory,'logo.svg')).kind,'svg');
  await fs.writeFile(path.join(directory,'image.png'),Buffer.from([137,80,78,71,13,10,26,10,0,0]));
  const raster=await projectImage(directory,'image.png');assert.equal(raster.kind,'raster');assert.match(raster.src,/^data:image\/png;base64,/);
  await fs.writeFile(path.join(directory,'fake.png'),'<html>not an image</html>');
  await assert.rejects(projectImage(directory,'fake.png'),/não é uma imagem/);
  await fs.writeFile(path.join(directory,'huge.png'),Buffer.alloc(2000001));
  await assert.rejects(projectImage(directory,'huge.png'),/2 MB/);
  await fs.writeFile(path.join(root,'outside.svg'),'<svg/>');
  await assert.rejects(projectImage(directory,'../outside.svg'),/dentro do projeto/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
