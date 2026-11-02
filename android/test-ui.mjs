// Exercises our debuggable Android WebView and the real JNI engine, not a browser-hosted app.
import {_android} from 'playwright';
import {Chess} from 'chess.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const adb=process.env.ADB||'adb';
const shell=(...args)=>execFileSync(adb,['shell',...args],{encoding:'utf8'}).trim();
const devices=await _android.devices({omitDriverInstall:true});assert.equal(devices.length,1,'Use one test emulator');
const device=devices[0];assert(device.serial().startsWith('emulator-'),'Use an emulator for the scripted test');const view=await device.webView({pkg:'com.peteriley.solitairechess'});const page=await view.page();
page.setDefaultTimeout(20000);assert(page.url().startsWith('https://appassets.androidplatform.net/'));
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const cell=s=>page.locator(`[data-square="${s}"]`);
const ready=()=>page.waitForFunction(()=>document.querySelector('.engine-status')?.textContent.includes('Ready'),{timeout:25000});
const load=async fen=>{await page.getByRole('button',{name:'Load position',exact:true}).first().click();await page.getByRole('textbox',{name:'FEN position'}).fill(fen);await page.locator('.modal').getByRole('button',{name:'Load position',exact:true}).click();if(new Chess(fen).isGameOver())await page.waitForSelector('.terminal');else await ready();};
fs.mkdirSync('android/qa',{recursive:true});
try {
 await ready();assert.equal(await page.locator('.candidate-primary').count(),5);
 const start=new Chess().fen();
 const native=await page.evaluate(async fen=>new Promise((resolve,reject)=>{
   const off=window.chessEngine.onAnalysis(data=>{if(data.id===987&&data.error){off();reject(Error(data.error));}if(data.id===987&&data.status==='Ready'){off();resolve(data);}});
   window.chessEngine.analyze({fen,initialFen:fen,moves:[]},987).catch(reject);
 }),start);
 assert.equal(native.lines.length,5);
 for(const line of native.lines){const game=new Chess();for(const move of line.pv)game.move({from:move.slice(0,2),to:move.slice(2,4),promotion:move[4]||'q'});}
 shell('settings','put','system','accelerometer_rotation','0');shell('settings','put','system','user_rotation','0');
 await page.waitForFunction(()=>innerHeight>innerWidth);
 const board=await page.locator('.board').boundingBox(),candidates=await page.locator('.analysis-panel').boundingBox();assert(candidates.y>board.y+board.height);
 await page.screenshot({path:'android/qa/portrait.png'});
 await cell('e2').click();await cell('e4').click();await ready();assert.match(await cell('e4').getAttribute('aria-label'),/White pawn/);
 await page.evaluate(()=>{window.rotationSentinel=Date.now()});const sentinel=await page.evaluate(()=>window.rotationSentinel);
 shell('settings','put','system','accelerometer_rotation','0');shell('settings','put','system','user_rotation','1');
 await page.waitForFunction(()=>innerWidth>innerHeight);
 assert.equal(await page.evaluate(()=>window.rotationSentinel),sentinel);assert.match(await cell('e4').getAttribute('aria-label'),/White pawn/);
 const landscapeBoard=await page.locator('.board').boundingBox(),landscapeAnalysis=await page.locator('.analysis-panel').boundingBox();assert(landscapeAnalysis.x>landscapeBoard.x+landscapeBoard.width);
 await page.screenshot({path:'android/qa/landscape.png'});
 await page.locator('.candidate-primary').first().click();assert.match(await page.locator('.nav-caption').textContent(),/Exploring/);
 await page.getByRole('button',{name:'Next move',exact:true}).click();await page.getByRole('button',{name:'Return to game'}).click();assert.match(await cell('e4').getAttribute('aria-label'),/White pawn/);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await ready();assert.match(await cell('e2').getAttribute('aria-label'),/White pawn/);
 await page.getByRole('combobox',{name:'Play mode'}).selectOption('computer');await cell('e2').click();await cell('e4').click();
 await page.waitForFunction(()=>document.querySelector('.board-state')?.textContent==='White to move',{timeout:20000});
 assert.match(await cell('e4').getAttribute('aria-label'),/White pawn/);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await ready();await page.getByRole('combobox',{name:'Your pieces'}).selectOption('b');
 await page.waitForFunction(()=>document.querySelector('.board-state')?.textContent==='Black to move',{timeout:20000});
 await page.getByRole('combobox',{name:'Play mode'}).selectOption('local');
 await load('7k/P7/8/8/8/8/8/7K w - - 0 1');await cell('a7').click();await cell('a8').click();await page.getByRole('button',{name:'Promote to knight',exact:true}).click();assert.match(await cell('a8').getAttribute('aria-label'),/White knight/);
 await load('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');await cell('e1').click();await cell('g1').click();assert.match(await cell('f1').getAttribute('aria-label'),/White rook/);
 await load('7k/8/8/3pP3/8/8/8/7K w - d6 0 1');await cell('e5').click();await cell('d6').click();assert.equal(await cell('d5').getAttribute('aria-label'),'d5');
 await load('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1');assert.match(await page.locator('.terminal').textContent(),/checkmate/);
 await load('7K/8/5kq1/8/8/8/8/8 b - - 0 1');assert.match(await page.locator('.evaluation-number').textContent(),/−M/);
 await load(start);await cell('d2').click();await cell('d4').click();await ready();
 shell('input','keyevent','KEYCODE_HOME');shell('am','start','-n','com.peteriley.solitairechess/.MainActivity');await ready();assert.match(await cell('d4').getAttribute('aria-label'),/White pawn/);
 shell('settings','put','system','user_rotation','0');await page.waitForFunction(()=>innerHeight>innerWidth);assert.match(await cell('d4').getAttribute('aria-label'),/White pawn/);
 assert.deepEqual(errors,[]);
 console.log('PASS: native Android JNI engine, five complete legal PVs, portrait/landscape rotation preserving state, variation preview, moves/undo, computer both sides, promotion, castling, en passant, checkmate, White-perspective mate score, background/resume; no renderer errors.');
} finally {await device.close();}
