import React, {useState,useEffect,useRef,useMemo} from 'react';
import {createRoot} from 'react-dom/client';
import {Chess,DEFAULT_POSITION} from 'chess.js';
import './style.css';

const PIECES={wk:'♚',wq:'♛',wr:'♜',wb:'♝',wn:'♞',wp:'♟',bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟'};
const NAMES={p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'};
const readSaved=()=>{try{return JSON.parse(localStorage.getItem('solitaire-chess-v1'))||{}}catch{return {}}};
const saved=readSaved();
function restore(){try{const c=new Chess(saved.initialFen||DEFAULT_POSITION);for(const m of saved.moves||[])c.move(m);return {initialFen:saved.initialFen||DEFAULT_POSITION,moves:saved.moves||[]}}catch{return{initialFen:DEFAULT_POSITION,moves:[]}}}
function gameAt(initialFen,moves){const c=new Chess(initialFen);for(const m of moves)c.move(m);return c;}
function scoreText(s){if(!s)return '—';if(s.type==='mate')return `${s.value<0?'−':''}M${Math.abs(s.value)}`;return `${s.value>=0?'+':'−'}${(Math.abs(s.value)/100).toFixed(2)}`;}
function pvMoves(fen,pv){const c=new Chess(fen),out=[];for(const u of pv||[]){try{const turn=c.turn(),number=c.moveNumber(),m=c.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'});out.push({...m,number,turn,uci:u,fen:c.fen()});}catch{break}}return out;}
function EdgeIcon({last=false}){return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{transform:last?"rotate(180deg)":undefined}}><path d="M3 2v12M12 3 6 8l6 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
function App(){
 const initial=useRef(restore()).current;
 const [session,setSession]=useState(initial),[orientation,setOrientation]=useState(saved.orientation||'w');
 const [mode,setMode]=useState(saved.mode||'local'),[human,setHuman]=useState(saved.human||'w'),[elo,setElo]=useState(saved.elo||1600);
 const [selected,setSelected]=useState(null),[promotion,setPromotion]=useState(null),[modal,setModal]=useState(null),[fenInput,setFenInput]=useState(''),[formError,setFormError]=useState('');
 const [lines,setLines]=useState([]),[analysisStatus,setAnalysisStatus]=useState('Starting engine'),[engineError,setEngineError]=useState(''),[meta,setMeta]=useState(null);
 const [variation,setVariation]=useState(null),[historyPly,setHistoryPly]=useState(null),[thinking,setThinking]=useState(false),[notice,setNotice]=useState(''),[lastChoice,setLastChoice]=useState(null);
 const [appActive,setAppActive]=useState(true);
 const analysisId=useRef(0),playId=useRef(0),mounted=useRef(true),boardRef=useRef(null);
 const game=useMemo(()=>gameAt(session.initialFen,session.moves),[session]);
 const fen=game.fen(),gameHistory=game.history({verbose:true}),isHistory=historyPly!==null;
 const viewGame=useMemo(()=>{if(variation){const c=new Chess(variation.fen);for(const m of variation.moves.slice(0,variation.ply))c.move(m.uci);return c;}if(isHistory)return gameAt(session.initialFen,session.moves.slice(0,historyPly));return game;},[variation,historyPly,session,game]);
 const viewing=!!variation||isHistory;
 const viewLast=variation?variation.moves[variation.ply-1]:isHistory?gameHistory[historyPly-1]:gameHistory.at(-1);
 const canMove=!viewing&&!game.isGameOver()&&!(mode==='computer'&&game.turn()!==human);
 const options=selected&&canMove?game.moves({square:selected,verbose:true}):[];
 const formatted=useMemo(()=>lines.map(l=>({...l,moves:pvMoves(fen,l.pv)})),[lines,fen]);
 const expectedCount=Math.min(5,game.moves().length);
 const mobileNative=['ios','android'].includes(window.chessEngine?.platform);
 useEffect(()=>{const pause=()=>setAppActive(false),resume=()=>setAppActive(true);window.addEventListener('solitaire-pause',pause);window.addEventListener('solitaire-resume',resume);return()=>{window.removeEventListener('solitaire-pause',pause);window.removeEventListener('solitaire-resume',resume)}},[]);
 useEffect(()=>{mounted.current=true;window.chessEngine?.metadata().then(m=>{setMeta(m);if(m.eloMin)setElo(e=>Math.max(m.eloMin,Math.min(m.eloMax,e)))}).catch(e=>setEngineError(e.message));return()=>{mounted.current=false}},[]);
 useEffect(()=>{localStorage.setItem('solitaire-chess-v1',JSON.stringify({...session,mode,human,elo,orientation}))},[session,mode,human,elo,orientation]);
 useEffect(()=>{
  const id=++analysisId.current;setLines([]);setEngineError('');setSelected(null);setVariation(null);setHistoryPly(null);
  if(!appActive){window.chessEngine?.stop();return;}
  if(game.isGameOver()){window.chessEngine?.stop();setAnalysisStatus('Game over');return;}
  if(!window.chessEngine){setEngineError('Open the installed Solitaire Chess app to use the local Stockfish engine.');return;}
  setAnalysisStatus('Analysing');
  const unsub=window.chessEngine.onAnalysis(data=>{if(data.id!==id)return;if(data.lines)setLines(data.lines);if(data.status)setAnalysisStatus(data.status);if(data.error)setEngineError(data.error)});
  window.chessEngine.analyze({fen,initialFen:session.initialFen,moves:session.moves},id).catch(e=>{if(analysisId.current===id){setEngineError(e.message);setAnalysisStatus('Engine unavailable')}});
  return()=>{unsub();};
 },[fen,appActive]);
 useEffect(()=>{
  const id=++playId.current;setThinking(false);window.chessEngine?.stopPlay();
  if(!appActive||mode!=='computer'||game.turn()===human||game.isGameOver()||!window.chessEngine)return;
  setThinking(true);
  window.chessEngine.play({fen,initialFen:session.initialFen,moves:session.moves},elo).then(result=>{
   if(playId.current!==id||!mounted.current)return;
   const u=typeof result==='string'?result:result.bestmove;
   const c=new Chess(fen);const m=c.move(u);if(!m)throw Error('The engine returned an invalid move.');
   setSession(s=>({...s,moves:[...s.moves,m.lan]}));setThinking(false);
  }).catch(e=>{if(playId.current===id){setThinking(false);setEngineError(e.message)}});
  return()=>{playId.current++;window.chessEngine?.stopPlay();};
 },[fen,mode,human,elo,appActive]);
 function commit(from,to,piece){try{const c=new Chess(fen),m=c.move({from,to,promotion:piece||'q'});if(!m)return;
  const rank=formatted.findIndex(l=>l.moves[0]?.lan===m.lan);
  setLastChoice({san:m.san,rank:rank>=0?rank+1:null,score:rank>=0?formatted[rank].score:null,compared:formatted.length>0});
  setSession(s=>({...s,moves:[...s.moves,m.lan]}));setSelected(null);setPromotion(null);setNotice('');
 }catch{setSelected(null)}}
 function choose(square){if(!canMove)return;
  if(selected){const legal=options.filter(m=>m.to===square);if(legal.length){if(legal.some(m=>m.promotion)){setPromotion({from:selected,to:square,color:game.turn()});return}commit(selected,square);return}}
  setSelected(game.get(square)?.color===game.turn()?square:null);
 }
 function exitPreview(){setVariation(null);setHistoryPly(null);setSelected(null)}
 function preview(line,ply){setVariation({rank:line.rank||line.multipv,fen,moves:line.moves,ply});setHistoryPly(null);setSelected(null)}
 function step(delta){setSelected(null);if(variation){setVariation(v=>({...v,ply:Math.max(0,Math.min(v.moves.length,v.ply+delta))}));return;}setHistoryPly(p=>Math.max(0,Math.min(session.moves.length,(p??session.moves.length)+delta)));}
 function edge(end){if(variation){setVariation(v=>({...v,ply:end?v.moves.length:0}));return;}setHistoryPly(end?null:0)}
 useEffect(()=>{function key(e){if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||modal||promotion)return;if(e.key==='ArrowLeft'){e.preventDefault();step(-1)}if(e.key==='ArrowRight'){e.preventDefault();step(1)}if(e.key==='Escape')exitPreview();if(e.key==='Home'){e.preventDefault();edge(false)}if(e.key==='End'){e.preventDefault();edge(true)}}window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[variation,session.moves.length,modal,promotion]);
 function undo(){if(!session.moves.length)return;const count=mode==='computer'&&game.turn()===human&&session.moves.length>1?2:1;setSession(s=>({...s,moves:s.moves.slice(0,-count)}));setLastChoice(null);exitPreview()}
 function newGame(){setSession({initialFen:DEFAULT_POSITION,moves:[]});setLastChoice(null);setModal(null);setNotice('');exitPreview()}
 function loadFen(){try{const c=new Chess(fenInput.trim());setSession({initialFen:c.fen(),moves:[]});setLastChoice(null);setModal(null);setNotice('');exitPreview()}catch{setFormError('That position is not valid FEN. Check the pieces, kings and side to move.')}}
 const status=game.isCheckmate()?`${game.turn()==='w'?'Black':'White'} wins by checkmate`:game.isStalemate()?'Draw by stalemate':game.isThreefoldRepetition()?'Draw by repetition':game.isInsufficientMaterial()?'Draw by insufficient material':game.isDraw()?'Draw':`${game.turn()==='w'?'White':'Black'} to move${game.isCheck()?' · check':''}`;
 const boardStatus=variation?`Line ${variation.rank} · ${variation.ply} of ${variation.moves.length} half-moves`:isHistory?`Game review · move ${Math.ceil(historyPly/2)}`:status;
 const score=lines[0]?.score,adv=score?.type==='mate'?(score.value>0?99:1):score?Math.max(4,Math.min(96,50+score.value/16)):50;
 const files=orientation==='w'?'abcdefgh':'hgfedcba',ranks=orientation==='w'?[8,7,6,5,4,3,2,1]:[1,2,3,4,5,6,7,8];
 return <main className="app">
  <header className="masthead"><div className="brandmark">♘</div><div><h1>Solitaire Chess</h1><p>Think first. Compare your move.</p></div><div className="local-badge"><span/> Local Stockfish</div>{['ios','android'].includes(window.chessEngine?.platform)&&<button className="mobile-info" aria-label="About, support and privacy" onClick={()=>window.chessEngine.showInfo()}>ⓘ</button>}</header>
  <div className="workspace">
   <section className="board-panel">
    <div className="section-head"><div className="eyebrow">THE POSITION</div><div className="board-tools"><button onClick={()=>{setFenInput(fen);setFormError('');setModal('fen')}} title="Load a position in FEN">Load position</button><button onClick={()=>setOrientation(o=>o==='w'?'b':'w')} title="Flip board" aria-label="Flip board">⇅ <span>Flip board</span></button></div></div>
    <div className="player-label"><span className={'side-dot '+(orientation==='w'?'black':'white')}/><span>{orientation==='w'?'Black':'White'}</span><span className="player-kind">{mode==='computer'&&(orientation==='w'?'b':'w')!==human?`Computer · ${elo} Elo`:mode==='computer'?'You':'Local player'}</span></div>
    <div className="board-area">
     <div className="eval-meter" aria-label={`Position evaluation ${scoreText(score)}, positive favours White`}><div className="meter-black" style={{height:`${100-adv}%`}}/><div className="meter-white" style={{height:`${adv}%`}}/></div>
     <div className="board" ref={boardRef} aria-label="Chess board" role={mobileNative?"group":"grid"}>
      {ranks.flatMap((rank,ri)=>[...files].map((file,fi)=>{const sq=file+rank,p=viewGame.get(sq),dark=(file.charCodeAt(0)-97+rank)%2===0,legal=options.some(m=>m.to===sq),last=viewLast&&(sq===viewLast.from||sq===viewLast.to),check=p?.type==='k'&&p.color===viewGame.turn()&&viewGame.isCheck();return <button key={sq} role={mobileNative?"button":"gridcell"} className={`square ${dark?'dark':'light'} ${selected===sq?'selected':''} ${last?'last':''} ${check?'in-check':''}`} aria-label={`${sq}${p?' '+(p.color==='w'?'White':'Black')+' '+NAMES[p.type]:''}`} aria-selected={mobileNative?undefined:selected===sq} aria-pressed={mobileNative?selected===sq:undefined} data-square={sq} onClick={()=>choose(sq)} onDragOver={e=>{if(canMove)e.preventDefault()}} onDrop={e=>{e.preventDefault();if(!canMove)return;const from=e.dataTransfer.getData('text/plain');const legal=game.moves({square:from,verbose:true}).filter(m=>m.to===sq);if(legal.some(m=>m.promotion))setPromotion({from,to:sq,color:game.turn()});else if(legal.length)commit(from,sq)}}>
       {fi===0&&<span className="rank-label">{rank}</span>}{ri===7&&<span className="file-label">{file}</span>}
       {p&&<span className={`piece ${p.color==='w'?'white-piece':'black-piece'}`} draggable={canMove&&p.color===game.turn()} onDragStart={e=>{if(!canMove||p.color!==game.turn()){e.preventDefault();return;}e.dataTransfer.setData('text/plain',sq);setSelected(sq)}}>{PIECES[p.color+p.type]}</span>}{legal&&<span className={p?'legal-ring':'legal-dot'}/>}</button>}))}
     </div>
    </div>
    <div className="player-label bottom-player"><span className={'side-dot '+(orientation==='w'?'white':'black')}/><span>{orientation==='w'?'White':'Black'}</span><span className="player-kind">{mode==='computer'&&orientation!==human?`Computer · ${elo} Elo`:mode==='computer'?'You':'Local player'}</span><span className="board-state">{thinking?'Computer is thinking…':boardStatus}</span></div>
    <div className={'navigation '+(viewing?'preview':'')}><span className="nav-caption">{variation?'Exploring a variation':isHistory?'Reviewing the game':'Your game'}</span><div className="nav-buttons"><button aria-label="First position" title="First position (Home)" onClick={()=>edge(false)}><EdgeIcon /></button><button aria-label="Previous move" title="Previous move (←)" onClick={()=>step(-1)}>‹</button><button aria-label="Next move" title="Next move (→)" onClick={()=>step(1)}>›</button><button aria-label="Last position" title="Last position (End)" onClick={()=>edge(true)}><EdgeIcon last /></button></div>{viewing?<button className="return-button" onClick={exitPreview}>Return to game ↩</button>:<span className="key-hint">← → to explore</span>}</div>
    <div className="game-controls"><label>Play mode<select aria-label="Play mode" value={mode} onChange={e=>{setMode(e.target.value);exitPreview()}}><option value="local">Player vs player</option><option value="computer">Player vs computer</option></select></label>{mode==='computer'&&<><label>Your pieces<select aria-label="Your pieces" value={human} onChange={e=>{setHuman(e.target.value);setOrientation(e.target.value)}}><option value="w">White</option><option value="b">Black</option></select></label><label>Computer Elo<select aria-label="Computer Elo" value={elo} onChange={e=>setElo(Number(e.target.value))}>{[meta?.eloMin||1320,1400,1600,1800,2000,2200,2400,2600,2800,meta?.eloMax||3190].filter((n,i,a)=>a.indexOf(n)===i&&n>=(meta?.eloMin||1320)&&n<=(meta?.eloMax||3190)).sort((a,b)=>a-b).map(n=><option key={n} value={n}>{n}</option>)}</select></label></>}
     <div className="game-actions"><button onClick={undo} disabled={!session.moves.length}>Undo</button><button onClick={()=>session.moves.length?setModal('new'):newGame()}>New game</button></div></div>
   </section>
   <aside className="analysis-panel"><div className="section-head"><div className="eyebrow">THE CANDIDATES</div><span className={'engine-status '+(analysisStatus==='Analysing'?'working':'')}><span/>{engineError?'Offline':analysisStatus}</span></div>
    <div className="analysis-intro"><h2>Find your next move.</h2><p>Make your choice, then compare it with the engine’s top five.</p></div>
    <div className="evaluation"><div><span className="eyebrow">POSITION EVALUATION</span><div className="evaluation-number">{game.isCheckmate()?(game.turn()==='w'?'−M0':'+M0'):game.isDraw()?'0.00':scoreText(score)}</div></div><div className="evaluation-description">{!score?'Waiting for analysis':score.type==='mate'?'Forced mate':Math.abs(score.value)<30?'An even position':`${score.value>0?'White':'Black'} has the edge`}<small>Positive scores favour White</small></div></div>
    {engineError?<div role="alert" className="error-box">{engineError}<button onClick={()=>window.location.reload()}>Retry engine</button></div>:<div className="candidate-list">{formatted.length?formatted.map((line,index)=>{
      const rank=line.rank||line.multipv||index+1,active=variation?.rank===rank;
      return <article className={`candidate ${index===0?'best':''} ${active?'active':''}`} key={rank}>
       <div className="candidate-top"><button className="candidate-primary" onClick={()=>preview(line,1)} aria-label={`Explore candidate ${rank} ${line.moves[0]?.san}`}><span className="candidate-rank">{String(rank).padStart(2,'0')}</span><strong>{line.moves[0]?.san||'—'}</strong>{index===0&&<span className="best-label">Best move</span>}</button><span className="candidate-score">{scoreText(line.score)}</span></div>
       <div className="continuation">{line.moves.slice(0,12).map((m,i)=><React.Fragment key={i}>{(m.turn==='w'||i===0)&&<span className="move-number">{m.number}{m.turn==='w'?'.':'…'}</span>}<button className={active&&variation.ply===i+1?'current-move':''} onClick={()=>preview(line,i+1)} aria-label={`Line ${rank} move ${i+1} ${m.san}`}>{m.san}</button></React.Fragment>)}</div>
       <div className="line-depth">Depth {line.depth||'—'}{active?' · Use ← → to step through this line':''}</div>
      </article>;
     }):game.isGameOver()?<div className="terminal"><span>♔</span><h3>{status}</h3><p>Start a new game or load another position.</p></div>:Array.from({length:expectedCount||5},(_,i)=><div className="candidate skeleton" key={i}><span>0{i+1}</span><div/><div/></div>)}</div>}
    {lastChoice&&<div className="last-choice"><span className="eyebrow">YOUR LAST CHOICE</span><p><strong>{lastChoice.san}</strong> {!lastChoice.compared?'was played before the previous analysis was available.':lastChoice.rank===1?'matched the engine’s first choice.':lastChoice.rank?`was candidate #${lastChoice.rank} (${scoreText(lastChoice.score)}).`:'was outside the previous top five.'}</p></div>}
    <div className="analysis-footnote"><span>◌</span><p>Short, full-strength analysis. Click any move to explore its continuation. Your game stays where you left it.</p></div>
   </aside>
  </div>
  <footer><span>Take your time. There’s no clock.</span><span>{meta?.name||'Stockfish'} · Private, on your device</span></footer>
  {modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null)}}><section className="modal" role="dialog" aria-modal="true" aria-label={modal==='fen'?'Load position':'New game'}><h2>{modal==='fen'?'A fresh position.':'Start again?'}</h2>{modal==='fen'?<><p>Paste a FEN position to analyse it or play from it.</p><textarea autoFocus aria-label="FEN position" value={fenInput} onChange={e=>setFenInput(e.target.value)}/>{formError&&<p role="alert" className="form-error">{formError}</p>}<div className="modal-buttons"><button onClick={()=>setModal(null)}>Cancel</button><button className="primary" onClick={loadFen}>Load position</button></div></>:<><p>This will replace the current game.</p><div className="modal-buttons"><button onClick={()=>setModal(null)}>Keep playing</button><button className="primary" onClick={newGame}>New game</button></div></>}</section></div>}
  {promotion&&<div className="modal-backdrop"><section className="modal promotion" role="dialog" aria-modal="true" aria-label="Choose promotion"><h2>Choose your promotion</h2><div>{['q','r','b','n'].map(p=><button aria-label={`Promote to ${NAMES[p]}`} key={p} onClick={()=>commit(promotion.from,promotion.to,p)}><span className={`piece ${promotion.color==='w'?'white-piece':'black-piece'}`}>{PIECES[promotion.color+p]}</span><small>{NAMES[p]}</small></button>)}</div><button onClick={()=>setPromotion(null)}>Cancel</button></section></div>}
 </main>
}
createRoot(document.getElementById('root')).render(<App/>);
